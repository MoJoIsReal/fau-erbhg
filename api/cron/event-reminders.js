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
import { logEvent } from '../_shared/log.js';
import {
  DELIVERY_CONCURRENCY,
  deliveryMessageId,
  nextAttemptAt,
  runWithConcurrency,
  sendWithDeadline,
} from '../_shared/delivery.js';
import { cancellationText } from '../_shared/registration-cancel.js';

// Per-batch claim sizes. These are upper bounds on what one claim query takes;
// the real protection against being killed mid-batch is RUN_BUDGET_MS below,
// which stops the loop while there is still time to finish cleanly.
const MAX_REMINDERS_PER_RUN = 100;
const MAX_NEWSLETTER_EMAILS_PER_RUN = 300;

// After this many failed sends a delivery is given up on and marked 'failed',
// which is terminal. Without a bound, one address that can never be delivered
// to — a closed mailbox, a domain that has gone away — kept its row 'pending'
// forever. The source item is only stamped once nothing of it is still pending,
// so the post stayed unstamped, was re-queued on every nightly run, and mailed
// itself to everyone who subscribed months later. The row could not be aged out
// either, because retention only collects rows that have reached a terminal
// state. One attempt per nightly run makes this about five days of trying.
const MAX_DELIVERY_ATTEMPTS = 5;

// Terminal delivery rows are kept for this long so a council member can still
// ask what went out last month, then collected. The table is one row per item
// per subscriber and nothing else ever deleted from it.
const DELIVERY_RETENTION_DAYS = 90;

// vercel.json gives these functions maxDuration: 30. Stop sending at 23 s so
// the run exits under its own control — a kill at 30 s leaves rows claimed as
// 'processing' with no send record. Previously the claim query flipped the
// whole batch to 'processing' before a single message was sent, so a timeout
// stranded every unsent row in it.
const RUN_BUDGET_MS = 23_000;

function deadlineFrom(startedAt = Date.now()) {
  return startedAt + RUN_BUDGET_MS;
}

// Fails closed. Without CRON_SECRET set this used to authorize anyone whenever
// NODE_ENV was not exactly 'production' — and an anonymous GET to this route
// sends mail and runs the irreversible GDPR retention DELETE, against a
// caller-supplied ?date=. A preview deployment, or a production deployment that
// simply never had NODE_ENV set, was wide open. `.env.example` documents
// CRON_SECRET; local runs set it there.
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers?.authorization === `Bearer ${secret}`;
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

export function registrationReminderEmail(registration) {
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

  const cancellation = cancellationText({
    language: registration.language,
    cancelToken: registration.cancelToken,
  });

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

${cancellation}

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

${cancellation}

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
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, abandoned: 0, remaining: 0, reason: 'email-not-configured' };
  }

  if (Date.now() >= deadline) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, abandoned: 0, remaining: null, reason: 'budget-exhausted' };
  }

  const queued = await sql`
    WITH due_items AS (
      SELECT 'event'::text AS item_type, id AS item_id, title, date AS event_date
      FROM events
      WHERE date = ${targetDate}
        AND status = 'active'
        AND notify_newsletter = true
        AND newsletter_sent_at IS NULL
      UNION ALL
      SELECT 'calendar'::text, id, title, date
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
      SELECT 'news'::text, id, title, ${targetDate}::text
      FROM blog_posts
      WHERE status = 'published'
        AND notify_newsletter = true
        AND newsletter_sent_at IS NULL
    )
    INSERT INTO newsletter_deliveries (
      item_type, item_id, subscriber_id, title, description, event_date
    )
    -- The body is deliberately not copied. It used to be written into one row
    -- per subscriber — up to 4 000 characters of a news article, duplicated
    -- across every delivery — which is the single reason this table grows the
    -- way it does. The claim query below reads the body from the item itself at
    -- send time, which also means a typo corrected between queueing and sending
    -- actually goes out corrected.
    SELECT d.item_type, d.item_id, s.id, d.title, NULL::text, d.event_date
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
           COALESCE(ev.title, yc.title, bp.title, c.title) AS title,
           COALESCE(ev.description, yc.description, left(bp.content, 4000), c.description)
             AS description,
           c.event_date as "eventDate",
           c.attempts, s.email, s.language, s.status as "subscriberStatus",
           s.unsubscribe_token as "unsubscribeToken"
    FROM claimed c
    LEFT JOIN newsletter_subscribers s ON s.id = c.subscriber_id
    -- The body is read from the item here rather than carried on the row. The
    -- stored columns are still the last fallback, which is what keeps rows
    -- queued before this change — and rows whose item has since been deleted —
    -- sendable exactly as they were.
    LEFT JOIN events ev ON c.item_type = 'event' AND ev.id = c.item_id
    LEFT JOIN yearly_calendar_entries yc ON c.item_type = 'calendar' AND yc.id = c.item_id
    LEFT JOIN blog_posts bp ON c.item_type = 'news' AND bp.id = c.item_id
    ORDER BY c.id
  `;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;
  let abandoned = 0;

  await runWithConcurrency(deliveries, DELIVERY_CONCURRENCY, async (delivery) => {
    // Out of time: hand the row straight back as pending so it is picked up by
    // the next run rather than left claimed when the platform kills us.
    if (Date.now() >= deadline) {
      await sql`
        UPDATE newsletter_deliveries
        SET status = 'pending', claimed_at = NULL, updated_at = NOW(), attempts = GREATEST(0, attempts - 1)
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
      await sendWithDeadline(send, {
        to: delivery.email,
        subject,
        text,
        messageId: deliveryMessageId('newsletter', delivery.id),
      }, deadline, closePooledTransporter);
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
      // A deadline can race acceptance: keep that uncertain outcome retryable.
      const exhausted = emailError?.code !== 'EMAIL_DEADLINE' && Number(delivery.attempts) >= MAX_DELIVERY_ATTEMPTS;
      await sql`
        UPDATE newsletter_deliveries
        SET status = ${exhausted ? 'failed' : 'pending'},
            claimed_at = NULL,
            next_attempt_at = ${retryAt},
            last_error = ${safeError},
            updated_at = NOW()
        WHERE id = ${delivery.id} AND status = 'processing'
      `;
      if (exhausted) {
        abandoned += 1;
        logEvent('warn', 'newsletter.delivery_abandoned', {
          deliveryId: delivery.id,
          itemType: delivery.itemType,
          itemId: delivery.itemId,
          attempts: Number(delivery.attempts),
        });
      }
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
    abandoned,
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

// `events.current_attendees` is written by the registration statement and the
// delete statement, and until now nothing ever checked it against the rows it
// is supposed to count — the GDPR retention cleanup below deletes registrations
// without touching it at all, so every purge left the counter permanently high.
// Readers no longer see this value (api/events.js derives what it shows), but
// the capacity check still compares against it under FOR UPDATE, so it has to
// be brought back to the truth.
//
// The `d.stored` re-check is what makes this safe to run against live traffic:
// a registration racing this statement holds the event row's FOR UPDATE lock,
// so the UPDATE blocks, and on unblocking PostgreSQL re-evaluates the WHERE
// clause against the new row version. The counter it just incremented no longer
// matches the value this statement read, so the row is skipped rather than
// rolled back to a stale sum. The next run picks up anything skipped.
export async function reconcileEventAttendeeCounts(sql) {
  const repaired = await sql`
    WITH drifted AS (
      SELECT e.id,
             COALESCE(e.current_attendees, 0) AS stored,
             COALESCE(SUM(r.attendee_count), 0)::int AS actual
      FROM events e
      LEFT JOIN event_registrations r ON r.event_id = e.id
      GROUP BY e.id, e.current_attendees
      HAVING COALESCE(e.current_attendees, 0)
             IS DISTINCT FROM COALESCE(SUM(r.attendee_count), 0)::int
    )
    UPDATE events e
    SET current_attendees = d.actual
    FROM drifted d
    WHERE e.id = d.id
      AND COALESCE(e.current_attendees, 0) = d.stored
    RETURNING e.id
  `;
  return repaired.length;
}

// newsletter_deliveries is one row per item per subscriber and, before this,
// nothing ever deleted from it: every event, calendar entry and news post left
// a permanent row for every subscriber who was active at the time. Terminal
// rows are the whole history after DELIVERY_RETENTION_DAYS, so they are
// collected; anything still pending or processing is left alone, however old.
async function cleanupDeliveryHistory(sql) {
  const deleted = await sql`
    DELETE FROM newsletter_deliveries
    WHERE status IN ('sent', 'skipped', 'failed')
      AND updated_at < NOW() - (${DELIVERY_RETENTION_DAYS} * INTERVAL '1 day')
    RETURNING id
  `;
  return deleted.length;
}

export async function cleanupPrivacyRetention(sql) {
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

  // Recorded self-service cancellations (migration 0016) follow the same
  // window as the registrations they were copied from.
  const deletedCancellations = await sql`
    DELETE FROM event_registration_cancellations c
    USING events e
    WHERE e.id = c.event_id
      AND e.date::date < CURRENT_DATE - INTERVAL '6 months'
    RETURNING c.id
  `;

  return {
    contactMessagesDeleted: deletedContactMessages.length,
    eventRegistrationsDeleted: deletedRegistrations.length,
    registrationCancellationsDeleted: deletedCancellations.length,
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
  let deferred = 0;

  if (!isEmailConfigured()) throw new Error('Email configuration not available');

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
          r.cancel_token as "cancelToken",
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

    await runWithConcurrency(claimed, DELIVERY_CONCURRENCY, async (registration) => {
      if (Date.now() >= deadline) {
        // No send was attempted: release without consuming an attempt.
        deferred += 1;
        await sql`
          UPDATE event_registrations
          SET reminder_claimed_at = NULL, reminder_attempts = GREATEST(0, reminder_attempts - 1)
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        return;
      }
      try {
        const { subject, text } = registrationReminderEmail(registration);
        await sendWithDeadline(send, {
          to: registration.email,
          subject,
          text,
          messageId: deliveryMessageId('registration-reminder', registration.id),
        }, deadline, closePooledTransporter);
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

  return { claimed: claimedTotal, sent, failed, deferred };
}

// Housekeeping runs first so mail cannot spend its budget or suppress it.
// Independent stages still run after a failure; the invocation fails with the
// original errors and logs its partial results instead of claiming success.
export async function runMorningTasks(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom()) {
  const summary = { reminders: null, retention: null, attendeeCountsRepaired: null, expiredRateLimitsDeleted: null, deliveryHistoryDeleted: null };
  const errors = [];
  const stage = async (name, work) => {
    try {
      summary[name] = await work();
    } catch (error) {
      errors.push(error);
      logEvent('error', 'cron.stage_failed', { stage: name, message: redactSensitiveText(error?.message || String(error)) });
    }
  };
  try {
    await stage('retention', () => cleanupPrivacyRetention(sql));
    // Reconcile after retention, including a partially completed purge.
    await stage('attendeeCountsRepaired', () => reconcileEventAttendeeCounts(sql));
    await stage('expiredRateLimitsDeleted', () => cleanupExpiredRateLimits(sql));
    await stage('deliveryHistoryDeleted', () => cleanupDeliveryHistory(sql));
    await stage('reminders', () => sendEventReminders(sql, targetDate, send, deadline));
  } finally {
    closePooledTransporter();
  }
  if (errors.length) {
    logEvent('error', 'cron.morning_partial', summary);
    throw new AggregateError(errors, `${errors.length} morning stage(s) failed`);
  }
  return summary;
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

  const { reminders, retention, attendeeCountsRepaired, expiredRateLimitsDeleted, deliveryHistoryDeleted } =
    await runMorningTasks(sql, targetDate, sendPooledEmail, deadline);
  logRun('reminders', {
    ...reminders,
    ...retention,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
  });
  return res.status(200).json({
    success: true,
    targetDate,
    sent: reminders.sent,
    failed: reminders.failed,
    deferred: reminders.deferred,
    retention,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
  });
});
