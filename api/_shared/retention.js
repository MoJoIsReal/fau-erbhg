// The morning run's housekeeping: privacy retention, expired rate limits,
// delivery history, the audit log, and the attendee counters. Run by
// api/cron/event-reminders.js; each piece is a stage of its own there.
import { NEWSLETTER_PENDING_PURGE_DAYS } from './newsletter.js';

// Terminal delivery rows are kept for this long so a council member can still
// ask what went out last month, then collected. The table is one row per item
// per subscriber and nothing else ever deleted from it.
export const DELIVERY_RETENTION_DAYS = 90;

// api_rate_limits rows are useless once their window has passed; without this
// the table would grow forever since nothing else ever deletes from it.
export async function cleanupExpiredRateLimits(sql) {
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
export async function cleanupDeliveryHistory(sql) {
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
export const AUDIT_LOG_RETENTION_DAYS = 365;

export async function cleanupAuditLog(sql, now = new Date()) {
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
