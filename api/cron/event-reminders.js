import crypto from 'crypto';
import { getDb } from '../_shared/database.js';
import { nameForMail, withApiHandler } from '../_shared/middleware.js';
import { resolvePhotoSlotsForRegistration } from '../../shared/photo-slots.js';
import {
  sendEmail,
  sendPooledEmail,
  closePooledTransporter,
  isEmailConfigured,
} from '../_shared/email.js';
import {
  NEWSLETTER_PENDING_PURGE_DAYS,
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
import { purgeExpiredShares } from '../_shared/media-share.js';
import { isR2Configured } from '../_shared/r2.js';

// Per-batch claim sizes. These are upper bounds on what one claim query takes;
// the real protection against being killed mid-batch is RUN_BUDGET_MS below,
// which stops the loop while there is still time to finish cleanly.
const MAX_REMINDERS_PER_RUN = 100;
const MAX_NEWSLETTER_EMAILS_PER_RUN = 300;

// A reminder whose send fails is released and, when the batch was full,
// claimed again by the next batch of the same run. Without a bound one
// address that can never be delivered to was retried batch after batch until
// the run's budget ran out. reminder_attempts counts sends tried (a deferred
// claim gives its attempt back), and a registration stops being claimed here.
const MAX_REMINDER_ATTEMPTS = 3;

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
//
// Compared in constant time, the way validateCsrfToken compares its pair: `===`
// returns at the first differing character, so response timing could reveal
// the secret one character at a time. Byte lengths are checked first because
// timingSafeEqual throws on buffers of different lengths.
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization;
  if (!secret || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
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

// The calendar day before an ISO date, as 'YYYY-MM-DD'.
function previousDay(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function tomorrowInOslo() {
  return formatOsloDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

// "Ola: 09:00" per child, as in the confirmation mail. The stored slots are a
// JSON array; printing that raw gave `["09:00","09:10"]` with no names.
function photoSlotText(registration, isNorwegian) {
  if (!registration.photoSlots) return '';
  const slots = resolvePhotoSlotsForRegistration({ time: registration.eventTime }, registration, [registration]);
  if (slots.length === 0) return '';
  let names = [];
  try { names = JSON.parse(registration.childrenNames || '[]'); } catch {}
  if (!Array.isArray(names)) names = [];
  const lines = slots.map((slot, i) => {
    const name = nameForMail(names[i]) || (isNorwegian ? `Barn ${i + 1}` : `Child ${i + 1}`);
    return `- ${name}: ${slot}`;
  });
  return `${isNorwegian ? 'Fototidspunkt' : 'Photo slots'}:\n${lines.join('\n')}\n\n`;
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
    potluck: registration.potluck,
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

${photoSlotText(registration, true)}Vi gleder oss til å se deg!

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

${photoSlotText(registration, false)}We look forward to seeing you!

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
// `queue: false` is the morning follow-up: it sends only what the evening run
// already queued and left pending (past its per-run cap or its deadline), for
// items dated today. It fans out nothing new, so an item flagged after last
// night's run is not mailed the same morning.
export async function broadcastNewsletter(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom(), { queue = true } = {}) {
  if (!isEmailConfigured()) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, abandoned: 0, remaining: 0, reason: 'email-not-configured' };
  }

  if (Date.now() >= deadline) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, abandoned: 0, remaining: null, reason: 'budget-exhausted' };
  }

  const queued = !queue ? [] : await sql`
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
           -- The same predicate the fan-out above queues by, minus the date
           -- and the stamp: whether the item is still one to send. A retry can
           -- come round after its event was cancelled, its post archived, its
           -- flag cleared or the item deleted.
           CASE c.item_type
             WHEN 'event' THEN COALESCE(ev.status = 'active' AND ev.notify_newsletter, false)
             WHEN 'calendar' THEN COALESCE(yc.entry_type IN ('day_event', 'closed') AND yc.notify_newsletter, false)
             WHEN 'news' THEN COALESCE(bp.status = 'published' AND bp.notify_newsletter, false)
             ELSE false
           END AS "sourceEligible",
           c.attempts, s.email, s.language, s.status as "subscriberStatus",
           s.unsubscribe_token as "unsubscribeToken"
    FROM claimed c
    LEFT JOIN newsletter_subscribers s ON s.id = c.subscriber_id
    -- The body is read from the item here rather than carried on the row. The
    -- stored columns remain a fallback for rows queued before that change; a
    -- row whose item has since been deleted is skipped (sourceEligible).
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

    // The claim takes anything due on or before tonight, so a reminder that
    // failed the evening before its event would otherwise be retried the
    // evening of it and on later nights. Only news rows carry the run date;
    // an event or calendar row dated before tonight's target is past.
    const past = delivery.itemType !== 'news' && delivery.eventDate < targetDate;
    if (delivery.subscriberStatus !== 'active' || !delivery.email || !delivery.sourceEligible || past) {
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
  // stamped at all, so it stayed queued forever. The stamp is ISO text, like
  // every other date column; NOW()::text wrote PostgreSQL's own format.
  const stampedAt = new Date().toISOString();
  await sql`
    UPDATE events e
    SET newsletter_sent_at = ${stampedAt}
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
    SET newsletter_sent_at = ${stampedAt}
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

  // A flagged post is also stamped when there was nobody to send it to. The
  // fan-out queues nothing without an active subscriber, so the delivery-row
  // test alone never stamped such a post, and it went out to whoever
  // subscribed months later. Events and calendar entries don't need this: they
  // are only due on their own date.
  await sql`
    UPDATE blog_posts p
    SET newsletter_sent_at = ${stampedAt}
    WHERE p.newsletter_sent_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM newsletter_deliveries d
          WHERE d.item_type = 'news' AND d.item_id = p.id
        )
        OR (
          p.status = 'published'
          AND p.notify_newsletter = true
          AND NOT EXISTS (SELECT 1 FROM newsletter_subscribers s WHERE s.status = 'active')
        )
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

// The audit trail (migration 0024) answers "who changed this?" for a year,
// then goes: it names council members' accounts, and nothing else reads it.
const AUDIT_LOG_RETENTION_DAYS = 365;

async function cleanupAuditLog(sql, now = new Date()) {
  const cutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const deleted = await sql`
    DELETE FROM audit_log
    WHERE created_at < ${cutoff}
    RETURNING id
  `;
  return deleted.length;
}

// The date columns are text holding ISO strings, so the windows compare text
// against an ISO cutoff instead of casting each row: one value that is not a
// date (the events handler once stored "neste fredag" and 2026-02-31) made the
// cast throw and the whole delete fail, every morning. A row that does not
// start with a date is skipped and counted, so it shows up in the run's log
// line instead of holding personal data unseen.
export async function cleanupPrivacyRetention(sql, now = new Date()) {
  const contactCutoff = new Date(now);
  contactCutoff.setUTCMonth(contactCutoff.getUTCMonth() - 12);
  const eventCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()))
    .toISOString().slice(0, 10);

  const deletedContactMessages = await sql`
    DELETE FROM contact_messages
    WHERE created_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND created_at < ${contactCutoff.toISOString()}
    RETURNING id
  `;

  const deletedRegistrations = await sql`
    DELETE FROM event_registrations r
    USING events e
    WHERE e.id = r.event_id
      AND e.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND e.date < ${eventCutoff}
    RETURNING r.id
  `;

  // Recorded self-service cancellations (migration 0016) follow the same
  // window as the registrations they were copied from.
  const deletedCancellations = await sql`
    DELETE FROM event_registration_cancellations c
    USING events e
    WHERE e.id = c.event_id
      AND e.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND e.date < ${eventCutoff}
    RETURNING c.id
  `;

  // Sign-ups never confirmed: an address someone may have typed for someone
  // else, kept no longer than NEWSLETTER_PENDING_PURGE_DAYS.
  const pendingCutoff = new Date(now.getTime() - NEWSLETTER_PENDING_PURGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const deletedPendingSubscribers = await sql`
    DELETE FROM newsletter_subscribers
    WHERE status = 'pending'
      AND created_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      AND created_at < ${pendingCutoff}
    RETURNING id
  `;

  const [unparseable] = await sql`
    SELECT
      (SELECT count(*) FROM contact_messages WHERE created_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}')::int AS "contactMessages",
      (SELECT count(*) FROM events WHERE date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')::int AS "events"
  `;

  return {
    contactMessagesDeleted: deletedContactMessages.length,
    eventRegistrationsDeleted: deletedRegistrations.length,
    registrationCancellationsDeleted: deletedCancellations.length,
    pendingSubscribersDeleted: deletedPendingSubscribers.length,
    unparseableDates: (unparseable?.contactMessages ?? 0) + (unparseable?.events ?? 0),
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
          r.children_names as "childrenNames",
          r.cancel_token as "cancelToken",
          e.title as "eventTitle",
          e.date as "eventDate",
          e.time as "eventTime",
          e.location,
          e.custom_location as "customLocation",
          e.potluck
        FROM event_registrations r
        JOIN events e ON e.id = r.event_id
        WHERE e.status = 'active'
          AND e.date = ${targetDate}
          AND r.reminder_sent_at IS NULL
          AND r.reminder_attempts < ${MAX_REMINDER_ATTEMPTS}
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
          SET reminder_sent_at = ${new Date().toISOString()}, reminder_claimed_at = NULL
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
// Expired private media shares (docs/mediedeling.md): their files in R2 and
// their rows. Skipped, not failed, where R2 is not configured — there is then
// nothing in R2 to delete, and the share API refuses to create any.
export async function purgeMediaShares(sql) {
  if (!isR2Configured()) return null;
  const { sharesDeleted, filesDeleted, failed } = await purgeExpiredShares(sql);
  return { mediaSharesDeleted: sharesDeleted, mediaFilesDeleted: filesDeleted, mediaPurgeFailed: failed };
}

export async function runMorningTasks(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom()) {
  const summary = { reminders: null, newsletter: null, retention: null, media: null, attendeeCountsRepaired: null, expiredRateLimitsDeleted: null, deliveryHistoryDeleted: null, auditLogDeleted: null };
  const errors = [];
  const stage = async (name, work) => {
    try {
      summary[name] = await work();
    } catch (error) {
      errors.push({ stage: name, error });
      logEvent('error', 'cron.stage_failed', { stage: name, message: redactSensitiveText(error?.message || String(error)) });
    }
  };
  try {
    await stage('retention', () => cleanupPrivacyRetention(sql));
    await stage('media', () => purgeMediaShares(sql));
    // Reconcile after retention, including a partially completed purge.
    await stage('attendeeCountsRepaired', () => reconcileEventAttendeeCounts(sql));
    await stage('expiredRateLimitsDeleted', () => cleanupExpiredRateLimits(sql));
    await stage('deliveryHistoryDeleted', () => cleanupDeliveryHistory(sql));
    await stage('auditLogDeleted', () => cleanupAuditLog(sql));
    await stage('reminders', () => sendEventReminders(sql, targetDate, send, deadline));
    // The evening broadcast is capped per run and stops at its deadline. What
    // it left pending for an item dated today would otherwise be skipped by
    // tonight's run, which only sends items dated tomorrow. Last, so it only
    // uses time the morning's own work left over.
    await stage('newsletter', () => broadcastNewsletter(sql, previousDay(targetDate), send, deadline, { queue: false }));
  } finally {
    closePooledTransporter();
  }
  if (errors.length) {
    // A failing run still writes its cron.run line, naming the stages that
    // failed, so every run leaves one (the handler's error line and Sentry
    // event follow from the throw). Flattened: logEvent writes a nested
    // object as "[object Object]". A stage that failed has null here and
    // adds nothing.
    const stagesFailed = errors.map(({ stage: name }) => name);
    const { reminders, newsletter, retention, media, ...counts } = summary;
    logEvent('error', 'cron.run', {
      task: 'reminders', targetDate, ...counts, ...retention, ...media, ...reminders,
      stagesFailed: stagesFailed.join(','),
    });
    throw new AggregateError(errors.map(({ error }) => error), `Morning stage(s) failed: ${stagesFailed.join(', ')}`);
  }
  return summary;
}

// The counts in a run's summary that mean mail did not go out, when above
// zero. Each failed send is also reported on its own, but that says neither
// how many there were nor whether mail is piling up. A newsletter run
// leaves failures to retry (`remaining`) and retires some for good
// (`abandoned`); a reminder that fails or is deferred is never retried, since
// the next morning looks at a different day.
export function mailProblems(task, summary) {
  const keys = task === 'newsletter' ? ['failed', 'abandoned', 'remaining'] : ['failed', 'deferred'];
  const problems = {};
  for (const key of keys) {
    const count = Number(summary?.[key]) || 0;
    if (count > 0) problems[key] = count;
  }
  if (summary?.reason) problems.reason = summary.reason;
  return problems;
}

// Housekeeping that left something behind: an expired share whose private
// photos could not be deleted from R2, or rows whose date the privacy
// retention could not read and so never deletes. Neither is mail, but both
// keep personal data past its time, so they are reported the same way.
export function housekeepingProblems(task, summary) {
  if (task !== 'reminders') return {};
  const problems = {};
  for (const key of ['mediaPurgeFailed', 'unparseableDates']) {
    const count = Number(summary?.[key]) || 0;
    if (count > 0) problems[key] = count;
  }
  return problems;
}

// Vercel Cron discards the response body, so the only durable record that a
// run happened is what gets logged. One line per run, so a cron that has been
// failing for a fortnight is visible instead of silent. A run that left mail
// unsent logs at warn and raises one error-tracker event under a fixed title,
// which is what the alert in docs/DEPLOYMENT.md listens for.
export function logCronRun(task, targetDate, summary) {
  const problems = mailProblems(task, summary);
  const troubled = Object.keys(problems).length > 0;
  const leftovers = housekeepingProblems(task, summary);
  const untidy = Object.keys(leftovers).length > 0;
  // Written directly rather than through logEvent, whose redaction reads the
  // run's date as a phone number; every field here is a count, the task or
  // that date. Warn goes to stderr, as logEvent does it.
  const line = {
    level: troubled || untidy ? 'warn' : 'info', event: 'cron.run', task, targetDate, ...summary,
    mailProblems: troubled,
    ...(untidy ? { housekeepingProblems: true } : {}),
  };
  (troubled || untidy ? console.error : console.log)(JSON.stringify(line));
  const report = (title, found, code) => reportProviderError(
    title,
    Object.assign(new Error(Object.entries(found).map(([key, value]) => `${key}=${value}`).join(', ')), { code }),
  );
  if (troubled) report(`Mail delivery problems in the ${task} run`, problems, 'MAIL_DELIVERY_PROBLEMS');
  if (untidy) report(`Housekeeping problems in the ${task} run`, leftovers, 'HOUSEKEEPING_PROBLEMS');
  return line;
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

  const logRun = (task, summary) => logCronRun(task, targetDate, summary);

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

  const { reminders, newsletter, retention, media, attendeeCountsRepaired, expiredRateLimitsDeleted, deliveryHistoryDeleted, auditLogDeleted } =
    await runMorningTasks(sql, targetDate, sendPooledEmail, deadline);
  // Its own line, under the newsletter's rules: what it still leaves pending
  // is lost tonight, and raises the newsletter's mail alert.
  // (Unconfigured mail already fails the reminders stage loudly.)
  if (newsletter && (newsletter.processed || newsletter.remaining || newsletter.reason === 'budget-exhausted')) {
    logCronRun('newsletter', previousDay(targetDate), { ...newsletter, followUp: true });
  }
  logRun('reminders', {
    ...reminders,
    ...retention,
    ...media,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
    auditLogDeleted,
  });
  return res.status(200).json({
    success: true,
    targetDate,
    sent: reminders.sent,
    failed: reminders.failed,
    deferred: reminders.deferred,
    newsletter,
    retention,
    media,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
    auditLogDeleted,
  });
});
