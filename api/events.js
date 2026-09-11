import { getDb } from './_shared/database.js';
import {
  withApiHandler,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeHtml,
  sanitizeNumber
} from './_shared/middleware.js';
import { COUNCIL_ROLES, EVENT_TYPES } from '../shared/constants.js';
import { buildCalendarFeed } from '../shared/calendar-feed.js';
import { publicBaseUrl } from './_shared/newsletter.js';

// All event endpoints return rows with the same camelCase shape so the
// client (and any cache merge) sees one schema. `mapEvent` is the single
// place that defines that shape; queries select/return raw rows and map here.

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    time: row.time,
    location: row.location,
    customLocation: row.custom_location,
    maxAttendees: row.max_attendees,
    currentAttendees: row.current_attendees,
    registrationDeadline: row.registration_deadline,
    type: row.type,
    status: row.status,
    vigiloSignup: row.vigilo_signup,
    noSignup: row.no_signup,
    notifyNewsletter: row.notify_newsletter ?? false,
    newsletterSentAt: row.newsletter_sent_at,
  };
}

// Dated yearly-calendar entries ride along in the subscribable feed, so a
// parent who subscribes gets planning days and holidays too — the same two
// sources the /kalender page shows in its two tabs.
function mapFeedEntry(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    entryType: row.entry_type,
    date: row.date,
  };
}

// Keep the feed bounded: a year of history is plenty for a calendar app,
// and it stops the document growing without limit as the years pass.
function feedCutoffDate(now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

async function respondWithCalendarFeed(req, res, sql) {
  const since = feedCutoffDate();
  const language = req.query.lang === 'en' ? 'en' : 'no';

  const [eventRows, entryRows] = await Promise.all([
    sql`
      SELECT *
      FROM events
      WHERE status IN ('active', 'cancelled')
        AND date >= ${since}
      ORDER BY date ASC, time ASC
    `,
    sql`
      SELECT id, title, description, entry_type, date
      FROM yearly_calendar_entries
      WHERE entry_type IN ('day_event', 'closed')
        AND date IS NOT NULL
        AND date >= ${since}
      ORDER BY date ASC
    `,
  ]);

  const feed = buildCalendarFeed({
    events: eventRows.map(mapEvent),
    entries: entryRows.map(mapFeedEntry),
    baseUrl: publicBaseUrl(),
    language,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="fau-erdal-barnehage.ics"');
  return res.status(200).send(feed);
}

function normalizeRegistrationDeadline(value) {
  if (!value) return null;
  const deadline = new Date(String(value));
  if (Number.isNaN(deadline.getTime())) {
    return undefined;
  }
  return deadline.toISOString();
}

export function isRegistrationForeignKeyConflict(error) {
  return error?.code === '23503'
    && error?.constraint === 'event_registrations_event_id_fkey';
}

export default withApiHandler(async function handler(req, res) {
  const sql = getDb();

  if (req.method === 'GET') {
    // Public iCalendar feed for calendar apps that subscribe to the URL.
    if (req.query.format === 'ics') {
      return await respondWithCalendarFeed(req, res, sql);
    }

    const events = await sql`
      SELECT *
      FROM events
      WHERE status IN ('active', 'cancelled')
      ORDER BY date ASC, time ASC
    `;

    return res.status(200).json(events.map(mapEvent));
  }

  // All other methods require a council member.
  const user = await requireRole(req, res, COUNCIL_ROLES, sql);
  if (!user) return;

  if (!requireCsrf(req, res)) return;

  if (req.method === 'POST') {
    const {
      title,
      description,
      date,
      time,
      location,
      customLocation,
      maxAttendees,
      registrationDeadline,
      type,
      vigiloSignup,
      noSignup,
      notifyNewsletter,
    } = req.body;

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedDescription = sanitizeHtml(description, 5000);
    const sanitizedLocation = sanitizeText(location, 200);
    const sanitizedCustomLocation = customLocation ? sanitizeText(customLocation, 200) : null;
    const sanitizedMaxAttendees = maxAttendees ? sanitizeNumber(maxAttendees, 0, 1000) : null;
    const sanitizedRegistrationDeadline = normalizeRegistrationDeadline(registrationDeadline);

    if (!sanitizedTitle || !date || !time) {
      return res.status(400).json({ error: 'Valid title, date, and time are required' });
    }

    if (sanitizedRegistrationDeadline === undefined) {
      return res.status(400).json({ error: 'Valid registration deadline is required' });
    }

    if (!EVENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid event type: ${type}`, allowed: EVENT_TYPES });
    }

    const inserted = await sql`
      INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, registration_deadline, type, vigilo_signup, no_signup, notify_newsletter)
      VALUES (${sanitizedTitle}, ${sanitizedDescription}, ${date}, ${time}, ${sanitizedLocation}, ${sanitizedCustomLocation}, ${sanitizedMaxAttendees}, ${sanitizedRegistrationDeadline}, ${type}, ${vigiloSignup || false}, ${noSignup || false}, ${notifyNewsletter === true})
      RETURNING *
    `;

    return res.status(201).json(mapEvent(inserted[0]));
  }

  if (req.method === 'PUT') {
    const eventId = parseInt(req.query.id, 10);
    if (!eventId || Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }
    const {
      title,
      description,
      date,
      time,
      location,
      customLocation,
      maxAttendees,
      registrationDeadline,
      type,
      vigiloSignup,
      noSignup,
      notifyNewsletter,
    } = req.body;

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedDescription = sanitizeHtml(description, 5000);
    const sanitizedLocation = sanitizeText(location, 200);
    const sanitizedCustomLocation = customLocation ? sanitizeText(customLocation, 200) : null;
    const sanitizedMaxAttendees = maxAttendees ? sanitizeNumber(maxAttendees, 0, 1000) : null;
    const sanitizedRegistrationDeadline = normalizeRegistrationDeadline(registrationDeadline);

    if (!sanitizedTitle || !date || !time) {
      return res.status(400).json({ error: 'Valid title, date, and time are required' });
    }

    if (sanitizedRegistrationDeadline === undefined) {
      return res.status(400).json({ error: 'Valid registration deadline is required' });
    }

    if (!EVENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid event type: ${type}`, allowed: EVENT_TYPES });
    }

    const updated = await sql`
      UPDATE events
      SET title = ${sanitizedTitle},
          description = ${sanitizedDescription},
          date = ${date},
          time = ${time},
          location = ${sanitizedLocation},
          custom_location = ${sanitizedCustomLocation},
          max_attendees = ${sanitizedMaxAttendees},
          registration_deadline = ${sanitizedRegistrationDeadline},
          type = ${type},
          vigilo_signup = ${vigiloSignup || false},
          no_signup = ${noSignup || false},
          notify_newsletter = ${notifyNewsletter === true}
      WHERE id = ${eventId}
      RETURNING *
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.status(200).json(mapEvent(updated[0]));
  }

  if (req.method === 'PATCH') {
    const { action } = req.query;
    const eventId = parseInt(req.query.id, 10);
    if (!eventId || Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }

    if (action === 'cancel') {
      const cancelled = await sql`
        UPDATE events
        SET status = 'cancelled'
        WHERE id = ${eventId}
        RETURNING *
      `;

      if (cancelled.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(mapEvent(cancelled[0]));
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'DELETE') {
    const eventId = parseInt(req.query.id, 10);
    if (!eventId || Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }

    let deletion;
    try {
      deletion = await sql`
        WITH target AS MATERIALIZED (
          SELECT e.id,
                 EXISTS (
                   SELECT 1 FROM event_registrations r WHERE r.event_id = e.id
                 ) AS has_registrations
          FROM events e
          WHERE e.id = ${eventId}
        ), deleted AS (
          DELETE FROM events e
          USING target t
          WHERE e.id = t.id AND t.has_registrations = false
          RETURNING e.id
        )
        SELECT
          EXISTS (SELECT 1 FROM target) AS "eventExists",
          COALESCE((SELECT has_registrations FROM target), false) AS "hasRegistrations",
          EXISTS (SELECT 1 FROM deleted) AS deleted
      `;
    } catch (error) {
      // A registration committed between the snapshot and DELETE. The FK is the
      // final integrity boundary; expose the same stable business response as a
      // registration that was already visible at the start of the statement.
      if (isRegistrationForeignKeyConflict(error)) {
        return res.status(400).json({
          error: 'Cannot delete event with registrations',
          message: 'This event has registrations and cannot be deleted. You can cancel it instead.',
          hasRegistrations: true
        });
      }
      throw error;
    }

    const state = deletion[0];
    if (!state?.eventExists) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (state.hasRegistrations) {
      return res.status(400).json({
        error: 'Cannot delete event with registrations',
        message: 'This event has registrations and cannot be deleted. You can cancel it instead.',
        hasRegistrations: true
      });
    }

    if (!state.deleted) {
      return res.status(409).json({ error: 'Event could not be deleted' });
    }

    return res.status(200).json({ success: true, message: 'Event deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
