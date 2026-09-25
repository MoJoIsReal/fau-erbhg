import { getDb } from './_shared/database.js';
import {
  withApiHandler,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeHtml,
  sanitizeInteger,
  MAX_INT_ID,
} from './_shared/middleware.js';
import { COUNCIL_ROLES, EVENT_TYPES, MAX_EVENT_ATTENDEES } from '../shared/constants.js';
import { buildCalendarFeed } from '../shared/calendar-feed.js';
import { publicBaseUrl } from './_shared/newsletter.js';

// All event endpoints return rows with the same camelCase shape so the
// client (and any cache merge) sees one schema. `mapEvent` is the single
// place that defines that shape; queries select/return raw rows and map here.

// `events.current_attendees` is a stored counter with three writers and, until
// migration 0012, no way back once it drifted. What every reader actually wants
// is the sum of the registrations that exist right now, so the read paths
// compute it (see ATTENDEE_COUNT_SELECT) and hand it over as
// `derived_attendees`. The stored column survives only as the value the
// capacity check locks and compares under FOR UPDATE in api/registrations.js;
// nothing renders it any more, so a drifted counter can no longer show a parent
// the wrong number of free seats. Writes that do not join the registrations
// fall back to the stored value, which is correct for them by construction — a
// freshly inserted event has no registrations at all.
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
    currentAttendees: row.derived_attendees ?? row.current_attendees,
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
    category: row.category ?? null,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

// Keep the feed bounded: a year of history is plenty for a calendar app,
// and it stops the document growing without limit as the years pass.
function feedCutoffDate(now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return cutoff.toISOString().slice(0, 10);
}

// Set here rather than in vercel.json. Header rules there are matched against
// the pre-rewrite path, so the `/api/(.*)` no-store rule never sees
// /kalender.ics — production was returning `public, max-age=0,
// must-revalidate`, i.e. two database queries for every poll from every
// subscribed calendar client, none of them cached at the edge.
//
// The feed is entirely public and is rebuilt from data that changes a few times
// a week, so a short shared cache costs nothing: a stale entry is at most ten
// minutes behind, which is well inside how often calendar clients refresh
// anyway. `stale-while-revalidate` keeps subscribers served while the edge
// refetches. The query string (`?lang=en`) is part of the cache key.
export const CALENDAR_FEED_CACHE_CONTROL =
  'public, max-age=300, s-maxage=600, stale-while-revalidate=3600';

async function respondWithCalendarFeed(req, res, sql) {
  const since = feedCutoffDate();
  const language = req.query.lang === 'en' ? 'en' : 'no';

  const [eventRows, entryRows] = await Promise.all([
    sql`
      SELECT e.*,
             (
               SELECT COALESCE(SUM(r.attendee_count), 0)::int
               FROM event_registrations r
               WHERE r.event_id = e.id
             ) AS derived_attendees
      FROM events e
      WHERE e.status IN ('active', 'cancelled')
        AND e.date >= ${since}
      ORDER BY e.date ASC, e.time ASC
    `,
    sql`
      SELECT id, title, description, entry_type, category, date, start_time, end_time
      FROM yearly_calendar_entries
      WHERE entry_type IN ('day_event', 'closed')
        AND date IS NOT NULL
        AND date >= ${since}
      ORDER BY date ASC
    `,
  ]);

  const events = eventRows.map(mapEvent);

  // An event the feed cannot represent is skipped by buildCalendarFeed. That is
  // the right behaviour, but it must not be silent: a subscriber simply never
  // sees the event, and nothing else in the system notices.
  const unrenderable = events.filter((event) => !isValidEventTime(event.time));
  if (unrenderable.length > 0) {
    console.warn(
      'Calendar feed: skipping events with an unusable time',
      unrenderable.map((event) => ({ id: event.id, time: event.time })),
    );
  }

  const feed = buildCalendarFeed({
    events,
    entries: entryRows.map(mapFeedEntry),
    baseUrl: publicBaseUrl(),
    language,
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="fau-erdal-barnehage.ics"');
  res.setHeader('Cache-Control', CALENDAR_FEED_CACHE_CONTROL);
  return res.status(200).send(feed);
}

// events.time is `text NOT NULL` with no format constraint, and the only check
// was truthiness. shared/calendar-feed.js can only render "H:MM", so an event
// whose time was typed the Norwegian way ("17.00") rendered fine on the site
// but was silently dropped from the public /kalender.ics feed — no log, no
// counter, nobody finds out.
const EVENT_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function isValidEventTime(value) {
  return typeof value === 'string' && EVENT_TIME_RE.test(value.trim());
}

// events.date is `text NOT NULL`, and the client drops an event whose date it
// cannot parse (normalizeEvent in shared/calendar-entries.js). The only check
// used to be truthiness, so "neste fredag" or 2026-02-31 was stored and the
// event vanished from the calendar without anyone being told. Only a real
// calendar day in ISO form is accepted.
const EVENT_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidEventDate(value) {
  const match = typeof value === 'string' ? EVENT_DATE_RE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// max_attendees NULL means no cap. sanitizeNumber answers null for anything out
// of range, so a capacity of 1500 (or -5) used to be saved as unlimited signups.
// Absent or empty still means unlimited; any other value must be a whole
// number in range, or the request is refused. Returns undefined when invalid.
function normalizeMaxAttendees(value) {
  if (value === undefined || value === null || value === '') return null;
  return sanitizeInteger(value, 0, MAX_EVENT_ATTENDEES) ?? undefined;
}

function normalizeRegistrationDeadline(value) {
  if (!value) return null;
  const deadline = new Date(String(value));
  if (Number.isNaN(deadline.getTime())) {
    return undefined;
  }
  return deadline.toISOString();
}

// POST and PUT take the same event, and these checks used to be written out
// twice, fifty lines each. Returns { values } ready for the columns, or
// { error }: the body of the 400 to send.
function validateEventBody(body = {}) {
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
  } = body;

  const values = {
    title: sanitizeText(title, 200),
    description: sanitizeHtml(description, 5000),
    date,
    time,
    location: sanitizeText(location, 200),
    customLocation: customLocation ? sanitizeText(customLocation, 200) : null,
    maxAttendees: normalizeMaxAttendees(maxAttendees),
    registrationDeadline: normalizeRegistrationDeadline(registrationDeadline),
    type,
    vigiloSignup: vigiloSignup || false,
    noSignup: noSignup || false,
    notifyNewsletter: notifyNewsletter === true,
  };

  if (!values.title || !date || !time) {
    return { error: { error: 'Valid title, date, and time are required' } };
  }
  if (!isValidEventDate(date)) {
    return { error: { error: 'Date must be a real calendar date written as YYYY-MM-DD, for example 2026-06-12' } };
  }
  if (!isValidEventTime(time)) {
    return { error: { error: 'Time must be written as HH:MM (24-hour), for example 17:00' } };
  }
  if (values.maxAttendees === undefined) {
    return {
      error: { error: `Max attendees must be a whole number from 0 to ${MAX_EVENT_ATTENDEES}, or empty for no limit` },
    };
  }
  if (values.registrationDeadline === undefined) {
    return { error: { error: 'Valid registration deadline is required' } };
  }
  if (!EVENT_TYPES.includes(type)) {
    return { error: { error: `Invalid event type: ${type}`, allowed: EVENT_TYPES } };
  }
  return { values };
}

// The id in ?id=. parseInt read '1.5' and '12abc' as event 1 and 12.
function eventIdFrom(req) {
  return sanitizeInteger(req.query.id, 1, MAX_INT_ID);
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
      SELECT e.*,
             (
               SELECT COALESCE(SUM(r.attendee_count), 0)::int
               FROM event_registrations r
               WHERE r.event_id = e.id
             ) AS derived_attendees
      FROM events e
      WHERE e.status IN ('active', 'cancelled')
      ORDER BY e.date ASC, e.time ASC
    `;

    return res.status(200).json(events.map(mapEvent));
  }

  // All other methods require a council member.
  const user = await requireRole(req, res, COUNCIL_ROLES, sql);
  if (!user) return;

  if (!requireCsrf(req, res)) return;

  if (req.method === 'POST') {
    const { error, values } = validateEventBody(req.body);
    if (error) return res.status(400).json(error);

    const inserted = await sql`
      INSERT INTO events (title, description, date, time, location, custom_location, max_attendees, registration_deadline, type, vigilo_signup, no_signup, notify_newsletter)
      VALUES (${values.title}, ${values.description}, ${values.date}, ${values.time}, ${values.location}, ${values.customLocation}, ${values.maxAttendees}, ${values.registrationDeadline}, ${values.type}, ${values.vigiloSignup}, ${values.noSignup}, ${values.notifyNewsletter})
      RETURNING *
    `;

    return res.status(201).json(mapEvent(inserted[0]));
  }

  if (req.method === 'PUT') {
    const eventId = eventIdFrom(req);
    if (!eventId) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }
    const { error, values } = validateEventBody(req.body);
    if (error) return res.status(400).json(error);

    const updated = await sql`
      UPDATE events
      SET title = ${values.title},
          description = ${values.description},
          date = ${values.date},
          time = ${values.time},
          location = ${values.location},
          custom_location = ${values.customLocation},
          max_attendees = ${values.maxAttendees},
          registration_deadline = ${values.registrationDeadline},
          type = ${values.type},
          vigilo_signup = ${values.vigiloSignup},
          no_signup = ${values.noSignup},
          notify_newsletter = ${values.notifyNewsletter}
      WHERE id = ${eventId}
      RETURNING *, (
        SELECT COALESCE(SUM(r.attendee_count), 0)::int
        FROM event_registrations r
        WHERE r.event_id = events.id
      ) AS derived_attendees
    `;

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.status(200).json(mapEvent(updated[0]));
  }

  if (req.method === 'PATCH') {
    const { action } = req.query;
    const eventId = eventIdFrom(req);
    if (!eventId) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }

    if (action === 'cancel') {
      const cancelled = await sql`
        UPDATE events
        SET status = 'cancelled'
        WHERE id = ${eventId}
        RETURNING *, (
          SELECT COALESCE(SUM(r.attendee_count), 0)::int
          FROM event_registrations r
          WHERE r.event_id = events.id
        ) AS derived_attendees
      `;

      if (cancelled.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(mapEvent(cancelled[0]));
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'DELETE') {
    const eventId = eventIdFrom(req);
    if (!eventId) {
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
