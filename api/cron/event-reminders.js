import { getDb } from '../_shared/database.js';
import { withApiHandler } from '../_shared/middleware.js';
import {
  sendEmail,
  sendPooledEmail,
  closePooledTransporter,
  isEmailConfigured,
} from '../_shared/email.js';
import {
  newsPostEmail,
  reminderEmail as newsletterReminderEmail,
} from '../_shared/newsletter.js';
import { htmlToPlainText, truncatePlainText } from '../../shared/html-text.js';
import { redactSensitiveText } from '../_shared/redact.js';
import { reportProviderError } from '../_shared/provider-errors.js';
import {
  DELIVERY_CONCURRENCY,
  deliveryMessageId,
  nextAttemptAt,
  runWithConcurrency,
} from '../_shared/delivery.js';

// Per-batch claim sizes. These are upper bounds on what one claim query takes;
// the real protection against being killed mid-batch is RUN_BUDGET_MS below,
// which stops the loop while there is still time to finish cleanly.
const MAX_REMINDERS_PER_RUN = 100;
const MAX_NEWSLETTER_EMAILS_PER_RUN = 300;

// vercel.json gives these functions maxDuration: 30. Stop sending at 25 s so
// the run exits under its own control — a kill at 30 s leaves rows claimed as
// 'processing' with no send record. Previously the claim query flipped the
// whole batch to 'processing' before a single message was sent, so a timeout
// stranded every unsent row in it.
const RUN_BUDGET_MS = 25_000;

function deadlineFrom(startedAt = Date.now()) {
  return startedAt + RUN_BUDGET_MS;
}

function isAuthorizedCron(req) {
  if (!process.env.CRON_SECRET) {
    return process.env.NODE_ENV !== 'production';
  }
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

function formatOsloDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function tomorrowInOslo() {
  return formatOsloDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function reminderEmail(registration) {
  const isNorwegian = registration.language !== 'en';
  const locale = isNorwegian ? 'no-NO' : 'en-US';
  const date = new Date(registration.eventDate).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const location = registration.customLocation
    ? `${registration.location} (${registration.customLocation})`
    : registration.location;

  const subject = isNorwegian
    ? `Påminnelse: ${registration.eventTitle} i morgen`
    : `Reminder: ${registration.eventTitle} tomorrow`;

  const text = isNorwegian ? `
Hei ${registration.name},

Dette er en påminnelse om at du er påmeldt "${registration.eventTitle}" i morgen.

Arrangementsinformasjon:
- Dato: ${date}
- Tid: ${registration.eventTime}
- Sted: ${location}
- Antall deltakere: ${registration.attendeeCount || 1}

${registration.photoSlots ? `Fototidspunkt: ${registration.photoSlots}\n\n` : ''}Vi gleder oss til å se deg!

Med vennlig hilsen,
FAU Erdal Barnehage
` : `
Hi ${registration.name},

This is a reminder that you are registered for "${registration.eventTitle}" tomorrow.

Event information:
- Date: ${date}
- Time: ${registration.eventTime}
- Location: ${location}
- Number of attendees: ${registration.attendeeCount || 1}

${registration.photoSlots ? `Photo slot: ${registration.photoSlots}\n\n` : ''}We look forward to seeing you!

Best regards,
FAU Erdal Barnehage
`;

  return { subject, text };
}

// News-post bodies can be long; the email carries a teaser and a link to the
// full post rather than the whole article.
const NEWS_EXCERPT_LENGTH = 600;

function formatLongDate(dateStr, language) {
  const locale = language === 'en' ? 'en-US' : 'no-NO';
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Fan out due items into a durable per-subscriber outbox, claim a bounded batch,
// and only mark each delivery sent after Gmail accepts it. A crashed invocation
// leaves processing rows reclaimable after the lease expires.
export async function broadcastNewsletter(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom()) {
  if (!isEmailConfigured()) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, remaining: 0, reason: 'email-not-configured' };
  }

  const queued = await sql`
    WITH due_items AS (
      SELECT 'event'::text AS item_type, id AS item_id, title, description, date AS event_date
      FROM events
      WHERE date = ${targetDate}
        AND status = 'active'
        AND notify_newsletter = true
        AND newsletter_sent_at IS NULL
      UNION ALL
      SELECT 'calendar'::text, id, title, description, date
      FROM yearly_calendar_entries
      WHERE date = ${targetDate}
        AND entry_type IN ('day_event', 'closed')
        AND notify_newsletter = true
        AND newsletter_sent_at IS NULL
      UNION ALL
      -- News posts are not tied to a date the way events are: a flagged post
      -- goes out on the first run after it is flagged. It rides the same
      -- outbox, so event_date carries the run's date to keep the claim query
      -- (and its index) unchanged.
      -- Only a teaser is copied per subscriber: a full article (up to 50k
      -- chars) would be duplicated across every delivery row for nothing.
      SELECT 'news'::text, id, title, left(content, 4000), ${targetDate}::text
      FROM blog_posts
      WHERE status = 'published'
        AND notify_newsletter = true
        AND newsletter_sent_at IS NULL
    )
    INSERT INTO newsletter_deliveries (
      item_type, item_id, subscriber_id, title, description, event_date
    )
    SELECT d.item_type, d.item_id, s.id, d.title, d.description, d.event_date
    FROM due_items d
    CROSS JOIN newsletter_subscribers s
    WHERE s.status = 'active'
    -- Carrying a still-unsent delivery into today's run is what lets a news
    -- post whose send failed reach that subscriber on the next run: the claim
    -- below only looks at today's date. Event and calendar rows are only due
    -- on their own date, so their event_date is already today and this is a
    -- no-op for them.
    ON CONFLICT (item_type, item_id, subscriber_id) DO UPDATE
      SET event_date = EXCLUDED.event_date, updated_at = NOW()
      WHERE newsletter_deliveries.status = 'pending'
    RETURNING id
  `;

  const deliveries = await sql`
    WITH candidates AS (
      SELECT id
      FROM newsletter_deliveries
      -- Less-than-or-equal, not equal. The cron fires once a day with targetDate =
      -- tomorrow-in-Oslo, so a row scoped to a single event_date that was not
      -- sent during its own run could never be claimed again: the next run
      -- looks at a different date. Failed sends were therefore never retried
      -- and rows left 'processing' by a crashed run were stranded forever,
      -- which also blocked the source item from ever being stamped. event_date
      -- is ISO 'YYYY-MM-DD' text, so string ordering is date ordering.
      WHERE event_date <= ${targetDate}
        AND (
          (status = 'pending' AND next_attempt_at <= NOW())
          OR (status = 'processing' AND claimed_at < NOW() - INTERVAL '10 minutes')
        )
      ORDER BY event_date, next_attempt_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${MAX_NEWSLETTER_EMAILS_PER_RUN}
    ), claimed AS (
      UPDATE newsletter_deliveries d
      SET status = 'processing', claimed_at = NOW(), attempts = attempts + 1, updated_at = NOW()
      FROM candidates c
      WHERE d.id = c.id
      RETURNING d.*
    )
    SELECT c.id, c.item_type as "itemType", c.item_id as "itemId",
           c.title, c.description, c.event_date as "eventDate",
           c.attempts, s.email, s.language, s.status as "subscriberStatus",
           s.unsubscribe_token as "unsubscribeToken"
    FROM claimed c
    LEFT JOIN newsletter_subscribers s ON s.id = c.subscriber_id
    ORDER BY c.id
  `;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;

  await runWithConcurrency(deliveries, DELIVERY_CONCURRENCY, async (delivery) => {
    // Out of time: hand the row straight back as pending so it is picked up by
    // the next run rather than left claimed when the platform kills us.
    if (Date.now() >= deadline) {
      await sql`
        UPDATE newsletter_deliveries
        SET status = 'pending', claimed_at = NULL, updated_at = NOW()
        WHERE id = ${delivery.id} AND status = 'processing'
      `;
      deferred += 1;
      return;
    }

    if (delivery.subscriberStatus !== 'active' || !delivery.email) {
      await sql`
        UPDATE newsletter_deliveries
        SET status = 'skipped', claimed_at = NULL, last_error = NULL, updated_at = NOW()
        WHERE id = ${delivery.id} AND status = 'processing'
      `;
      skipped += 1;
      return;
    }

    try {
      const { subject, text } = delivery.itemType === 'news'
        ? newsPostEmail({
          title: delivery.title,
          excerpt: truncatePlainText(htmlToPlainText(delivery.description), NEWS_EXCERPT_LENGTH),
          postId: delivery.itemId,
          language: delivery.language,
          unsubscribeToken: delivery.unsubscribeToken,
        })
        : newsletterReminderEmail({
          title: delivery.title,
          description: htmlToPlainText(delivery.description),
          dateText: formatLongDate(delivery.eventDate, delivery.language),
          language: delivery.language,
          unsubscribeToken: delivery.unsubscribeToken,
        });
      await send({
        to: delivery.email,
        subject,
        text,
        messageId: deliveryMessageId('newsletter', delivery.id),
      });
      await sql`
        UPDATE newsletter_deliveries
        SET status = 'sent', sent_at = NOW(), claimed_at = NULL,
            last_error = NULL, updated_at = NOW()
        WHERE id = ${delivery.id} AND status = 'processing'
      `;
      sent += 1;
    } catch (emailError) {
      const retryAt = nextAttemptAt(delivery.attempts);
      const safeError = redactSensitiveText(emailError?.message || String(emailError)).substring(0, 500);
      await sql`
        UPDATE newsletter_deliveries
        SET status = 'pending', claimed_at = NULL, next_attempt_at = ${retryAt},
            last_error = ${safeError}, updated_at = NOW()
        WHERE id = ${delivery.id} AND status = 'processing'
      `;
      failed += 1;
      reportProviderError('Failed to send newsletter delivery', emailError);
    }
  });

  // Stamped off the delivery rows rather than the date. Scoping this to
  // targetDate meant an item whose deliveries finished on a later run was never
  // stamped at all, so it stayed queued forever.
  await sql`
    UPDATE events e
    SET newsletter_sent_at = NOW()::text
    WHERE e.newsletter_sent_at IS NULL
      AND EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'event' AND d.item_id = e.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'event' AND d.item_id = e.id
          AND d.status IN ('pending', 'processing')
      )
  `;

  await sql`
    UPDATE yearly_calendar_entries e
    SET newsletter_sent_at = NOW()::text
    WHERE e.newsletter_sent_at IS NULL
      AND EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'calendar' AND d.item_id = e.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'calendar' AND d.item_id = e.id
          AND d.status IN ('pending', 'processing')
      )
  `;

  await sql`
    UPDATE blog_posts p
    SET newsletter_sent_at = NOW()::text
    WHERE p.newsletter_sent_at IS NULL
      AND EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'news' AND d.item_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.item_type = 'news' AND d.item_id = p.id
          AND d.status IN ('pending', 'processing')
      )
  `;

  const remainingRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM newsletter_deliveries
    WHERE event_date <= ${targetDate} AND status IN ('pending', 'processing')
  `;

  return {
    queued: queued.length,
    processed: deliveries.length,
    sent,
    failed,
    skipped,
    deferred,
    remaining: remainingRows[0]?.count || 0,
  };
}

// api_rate_limits rows are useless once their window has passed; without this
// the table would grow forever since nothing else ever deletes from it.
async function cleanupExpiredRateLimits(sql) {
  const deleted = await sql`
    DELETE FROM api_rate_limits
    WHERE reset_at < NOW() - INTERVAL '7 days'
    RETURNING key
  `;
  return deleted.length;
}

async function cleanupPrivacyRetention(sql) {
  const deletedContactMessages = await sql`
    DELETE FROM contact_messages
    WHERE created_at::timestamptz < NOW() - INTERVAL '12 months'
    RETURNING id
  `;

  const deletedRegistrations = await sql`
    DELETE FROM event_registrations r
    USING events e
    WHERE e.id = r.event_id
      AND e.date::date < CURRENT_DATE - INTERVAL '6 months'
    RETURNING r.id
  `;

  return {
    contactMessagesDeleted: deletedContactMessages.length,
    eventRegistrationsDeleted: deletedRegistrations.length,
  };
}

// Claim and send registration reminders for `targetDate`, in batches, until
// there is nothing left or the run budget is spent.
//
// This used to be inline in the handler with a hard LIMIT of 25 and a single
// pass, so an event with 60 registrations silently reminded 25 parents and
// never the other 35 — the next run computes a new targetDate, the event is no
// longer "tomorrow", and reminder_sent_at stays NULL forever. The response
// reported `sent: 25`, which looked healthy. Extracting it also makes the
// send/failure paths reachable from tests, which the inline version was not.
export async function sendEventReminders(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom()) {
  let sent = 0;
  let failed = 0;
  let claimedTotal = 0;

  for (;;) {
    if (Date.now() >= deadline) break;

    const claimed = await sql`
      WITH due AS (
        SELECT
          r.id,
          r.name,
          r.email,
          r.language,
          r.attendee_count as "attendeeCount",
          r.photo_slots as "photoSlots",
          e.title as "eventTitle",
          e.date as "eventDate",
          e.time as "eventTime",
          e.location,
          e.custom_location as "customLocation"
        FROM event_registrations r
        JOIN events e ON e.id = r.event_id
        WHERE e.status = 'active'
          AND e.date = ${targetDate}
          AND r.reminder_sent_at IS NULL
          AND (r.reminder_claimed_at IS NULL OR r.reminder_claimed_at < NOW() - INTERVAL '10 minutes')
        ORDER BY e.time ASC, r.id ASC
        FOR UPDATE OF r SKIP LOCKED
        LIMIT ${MAX_REMINDERS_PER_RUN}
      ),
      claimed AS (
        UPDATE event_registrations r
        SET reminder_claimed_at = NOW(), reminder_attempts = reminder_attempts + 1
        FROM due
        WHERE r.id = due.id
          AND r.reminder_sent_at IS NULL
          AND (r.reminder_claimed_at IS NULL OR r.reminder_claimed_at < NOW() - INTERVAL '10 minutes')
        RETURNING r.id, r.reminder_attempts as "reminderAttempts"
      )
      SELECT due.*, claimed."reminderAttempts"
      FROM due
      JOIN claimed ON claimed.id = due.id
    `;

    if (claimed.length === 0) break;
    claimedTotal += claimed.length;

    if (!isEmailConfigured()) {
      throw new Error('Email configuration not available');
    }

    await runWithConcurrency(claimed, DELIVERY_CONCURRENCY, async (registration) => {
      if (Date.now() >= deadline) {
        // Release the claim rather than holding it for the full lease.
        await sql`
          UPDATE event_registrations
          SET reminder_claimed_at = NULL
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        return;
      }
      try {
        const { subject, text } = reminderEmail(registration);
        await send({
          to: registration.email,
          subject,
          text,
          messageId: deliveryMessageId('registration-reminder', registration.id),
        });
        await sql`
          UPDATE event_registrations
          SET reminder_sent_at = NOW()::text, reminder_claimed_at = NULL
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        sent += 1;
      } catch (emailError) {
        failed += 1;
        await sql`
          UPDATE event_registrations
          SET reminder_claimed_at = NULL
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        reportProviderError('Failed to send event reminder', emailError);
      }
    });

    // A short batch means the queue is drained.
    if (claimed.length < MAX_REMINDERS_PER_RUN) break;
  }

  return { claimed: claimedTotal, sent, failed };
}

export default withApiHandler(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = getDb();
  const targetDate = req.query.date || tomorrowInOslo();
  const deadline = deadlineFrom();

  // Vercel Cron discards the response body, so the only durable record that a
  // run happened is what gets logged. One line per run, so a cron that has been
  // failing for a fortnight is visible instead of silent.
  const logRun = (task, summary) =>
    console.log(JSON.stringify({ event: 'cron.run', task, targetDate, ...summary }));

  // The evening run (21:00 Oslo / 19:00 UTC) only broadcasts the newsletter
  // for the next day's flagged events. Registration reminders + GDPR cleanup
  // stay on the morning run (07:00 UTC).
  if (req.query.task === 'newsletter') {
    try {
      const newsletter = await broadcastNewsletter(sql, targetDate, sendPooledEmail, deadline);
      logRun('newsletter', newsletter);
      return res.status(200).json({ success: true, targetDate, task: 'newsletter', newsletter });
    } finally {
      closePooledTransporter();
    }
  }

  let reminders;
  try {
    reminders = await sendEventReminders(sql, targetDate, sendPooledEmail, deadline);
  } finally {
    closePooledTransporter();
  }

  const retention = await cleanupPrivacyRetention(sql);
  const expiredRateLimitsDeleted = await cleanupExpiredRateLimits(sql);
  logRun('reminders', { ...reminders, ...retention, expiredRateLimitsDeleted });
  return res.status(200).json({
    success: true,
    targetDate,
    sent: reminders.sent,
    failed: reminders.failed,
    retention,
    expiredRateLimitsDeleted,
  });
});
