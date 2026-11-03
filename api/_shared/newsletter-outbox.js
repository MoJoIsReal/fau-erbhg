// The evening newsletter: fan due items out into the durable per-subscriber
// outbox (newsletter_deliveries), claim a bounded batch and send each
// subscriber one mail. Run by api/cron/event-reminders.js; the invariants are
// in docs/subsystems.md ("Newsletter").
import { closePooledTransporter, isEmailConfigured, sendPooledEmail } from './email.js';
import { digestEmail, reminderEmail as newsletterReminderEmail, newsPostEmail } from './newsletter.js';
import { htmlToPlainText, truncatePlainText } from '../../shared/html-text.js';
import { redactSensitiveText } from './redact.js';
import { reportProviderError } from './provider-errors.js';
import { logEvent } from './log.js';
import { DELIVERY_CONCURRENCY, DELIVERY_LEASE_MINUTES, deliveryMessageId, nextAttemptAt, runWithConcurrency, sendWithDeadline } from './delivery.js';
import { formatLongDate } from './registration-emails.js';
import { deadlineFrom } from './run-budget.js';

// Counted in emails, i.e. subscribers: everything one subscriber has due goes
// out as a single message, so the claim takes whole subscribers at a time.
export const MAX_NEWSLETTER_EMAILS_PER_RUN = 300;

// After this many failed sends a delivery is given up on and marked 'failed',
// which is terminal. Without a bound, one address that can never be delivered
// to — a closed mailbox, a domain that has gone away — kept its row 'pending'
// forever. The source item is only stamped once nothing of it is still pending,
// so the post stayed unstamped, was re-queued on every nightly run, and mailed
// itself to everyone who subscribed months later. The row could not be aged out
// either, because retention only collects rows that have reached a terminal
// state. One attempt per nightly run makes this about five days of trying.
export const MAX_DELIVERY_ATTEMPTS = 5;

// News-post bodies can be long; the email carries a teaser and a link to the
// full post rather than the whole article.
const NEWS_EXCERPT_LENGTH = 600;

// The message for one subscriber's claimed deliveries: the familiar single
// reminder or news mail when there is one, a combined one when there are more.
// Reminders lead, since they are about tomorrow; each kind keeps the claim's order.
function newsletterEmail(group) {
  const { language, unsubscribeToken } = group[0];
  const items = group
    .map(delivery => delivery.itemType === 'news'
      ? {
        kind: 'news',
        title: delivery.title,
        excerpt: truncatePlainText(htmlToPlainText(delivery.description), NEWS_EXCERPT_LENGTH),
        postId: delivery.itemId,
      }
      : {
        kind: 'reminder',
        title: delivery.title,
        description: htmlToPlainText(delivery.description, { links: true }),
        dateText: formatLongDate(delivery.eventDate, language),
      })
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'reminder' ? -1 : 1));

  if (items.length > 1) return digestEmail({ items, language, unsubscribeToken });
  const [item] = items;
  return item.kind === 'news'
    ? newsPostEmail({ ...item, language, unsubscribeToken })
    : newsletterReminderEmail({ ...item, language, unsubscribeToken });
}

// Fan out due items into a durable per-subscriber outbox, claim a bounded batch,
// and only mark each delivery sent after Gmail accepts it. The outbox stays one
// row per item per subscriber, but a subscriber's claimed rows are sent as one
// email, so two posts flagged the same day arrive together. A crashed invocation
// leaves processing rows reclaimable after the lease expires.
// `queue: false` is the morning follow-up: it sends only what the evening run
// already queued and left pending (past its per-run cap or its deadline), for
// items dated today. It fans out nothing new, so an item flagged after last
// night's run is not mailed the same morning.
export async function broadcastNewsletter(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom(), { queue = true } = {}) {
  if (!isEmailConfigured()) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, abandoned: 0, emails: 0, remaining: 0, reason: 'email-not-configured' };
  }

  if (Date.now() >= deadline) {
    return { queued: 0, processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, abandoned: 0, emails: 0, remaining: null, reason: 'budget-exhausted' };
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
    WITH recipients AS (
      -- The cap is on subscribers, not rows: a row cap could cut one
      -- subscriber's items in two and send the rest as a second email. Locking
      -- the subscriber rather than every due row lets an overlapping run move
      -- on to the next subscribers instead of finding them all locked.
      -- NO KEY: the fan-out's foreign key check still gets through.
      SELECT s.id
      FROM newsletter_subscribers s
      WHERE EXISTS (
        SELECT 1 FROM newsletter_deliveries d
        WHERE d.subscriber_id = s.id
          AND d.event_date <= ${targetDate}
          AND (
            (d.status = 'pending' AND d.next_attempt_at <= NOW())
            OR (d.status = 'processing' AND d.claimed_at < NOW() - (${DELIVERY_LEASE_MINUTES} * INTERVAL '1 minute'))
          )
      )
      ORDER BY s.id
      LIMIT ${MAX_NEWSLETTER_EMAILS_PER_RUN}
      FOR NO KEY UPDATE SKIP LOCKED
    ), candidates AS (
      SELECT id
      FROM newsletter_deliveries
      -- Less-than-or-equal, not equal. The cron fires once a day with targetDate =
      -- tomorrow-in-Oslo, so a row scoped to a single event_date that was not
      -- sent during its own run could never be claimed again: the next run
      -- looks at a different date. Failed sends were therefore never retried
      -- and rows left 'processing' by a crashed run were stranded forever,
      -- which also blocked the source item from ever being stamped. event_date
      -- is ISO 'YYYY-MM-DD' text, so string ordering is date ordering.
      WHERE subscriber_id IN (SELECT id FROM recipients)
        AND event_date <= ${targetDate}
        AND (
          (status = 'pending' AND next_attempt_at <= NOW())
          OR (status = 'processing' AND claimed_at < NOW() - (${DELIVERY_LEASE_MINUTES} * INTERVAL '1 minute'))
        )
      -- Still locked row by row: this is what re-checks a row another run
      -- claimed and committed while this statement waited.
      FOR UPDATE SKIP LOCKED
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
           c.attempts, c.subscriber_id as "subscriberId",
           s.email, s.language, s.status as "subscriberStatus",
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
  let emails = 0;

  // Rows the run may still send, grouped into one email per subscriber. The
  // rest are retired one by one, as before.
  const groups = new Map();
  const unsendable = [];
  for (const delivery of deliveries) {
    // The claim takes anything due on or before tonight, so a reminder that
    // failed the evening before its event would otherwise be retried the
    // evening of it and on later nights. Only news rows carry the run date;
    // an event or calendar row dated before tonight's target is past.
    const past = delivery.itemType !== 'news' && delivery.eventDate < targetDate;
    if (delivery.subscriberStatus !== 'active' || !delivery.email || !delivery.sourceEligible || past) {
      unsendable.push(delivery);
      continue;
    }
    const group = groups.get(delivery.subscriberId) || [];
    group.push(delivery);
    groups.set(delivery.subscriberId, group);
  }

  for (const delivery of unsendable) {
    await sql`
      UPDATE newsletter_deliveries
      SET status = 'skipped', claimed_at = NULL, last_error = NULL, updated_at = NOW()
      WHERE id = ${delivery.id} AND status = 'processing'
    `;
    skipped += 1;
  }

  await runWithConcurrency([...groups.values()], DELIVERY_CONCURRENCY, async (group) => {
    // Out of time: hand the rows straight back as pending so they are picked up
    // by the next run rather than left claimed when the platform kills us.
    if (Date.now() >= deadline) {
      for (const delivery of group) {
        await sql`
          UPDATE newsletter_deliveries
          SET status = 'pending', claimed_at = NULL, updated_at = NOW(), attempts = GREATEST(0, attempts - 1)
          WHERE id = ${delivery.id} AND status = 'processing'
        `;
        deferred += 1;
      }
      return;
    }

    try {
      const { subject, text } = newsletterEmail(group);
      // A lone delivery keeps the Message-ID it always had; a combined one is
      // named after every row it carries.
      const ids = group.map(delivery => delivery.id).sort((a, b) => a - b).join(',');
      await sendWithDeadline(send, {
        to: group[0].email,
        subject,
        text,
        messageId: deliveryMessageId('newsletter', ids),
      }, deadline, closePooledTransporter);
      for (const delivery of group) {
        await sql`
          UPDATE newsletter_deliveries
          SET status = 'sent', sent_at = NOW(), claimed_at = NULL,
              last_error = NULL, updated_at = NOW()
          WHERE id = ${delivery.id} AND status = 'processing'
        `;
        sent += 1;
      }
      emails += 1;
    } catch (emailError) {
      const safeError = redactSensitiveText(emailError?.message || String(emailError)).substring(0, 500);
      for (const delivery of group) {
        const retryAt = nextAttemptAt(delivery.attempts);
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
      }
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
    emails,
    remaining: remainingRows[0]?.count || 0,
  };
}
