# Subsystem rules

Domain invariants for the three subsystems whose rules are easy to break from
the code alone. Read the relevant section before changing the files it names.
Everything else lives in [`AGENTS.md`](../AGENTS.md).

## Yearly calendar

Files: `client/src/pages/yearly-calendar.tsx`, `api/yearly-calendar.js`,
`shared/yearly-calendar-display.js`, `shared/yearly-calendar-utils.js`,
`client/src/lib/yearly-calendar-{excel,pdf}.*`.

The month grid runs **Monday–Sunday**. The kindergarten week is Mon–Fri, but FAU
arrangements (dugnad, sommerfest) fall on weekends, so the weekend columns exist
and are only dimmed. `weeksOfMonth()` in `shared/yearly-calendar-display.js` is
the single source for that grid — the page and the PDF export both use it; do
not re-derive weeks locally. On phones an empty weekend row is hidden unless the
viewer can edit, so there is still somewhere to add a Saturday entry.

A `day_event` can carry an optional `startTime`/`endTime` ("HH:MM", Norwegian
local time). Without a start time it stays an all-day entry, which is what most
of them are; with one it renders as "18:30–21:00 Tittel" and the calendar feed
publishes it as a timed VEVENT (busy) instead of an all-day block (free). An end
that is not after the start is dropped rather than rejected, the same way
`weekNumberEnd` is. Only `day_event` takes times — every other type is a whole
day or a whole week — and the Excel import does not carry them, so re-importing
never wipes a time set in the UI.

Signup events (`/api/events`) are rendered inside the day cells alongside the
yearly entries, in orange, read-only (they link back to the "Hva skjer" tab,
which owns creating and editing them) and never draggable — drag-and-drop moves
yearly entries only. Cancelled events stay visible, struck through. The PDF
export takes the same events and prints them the same way.

## Calendar feed

Files: `shared/calendar-feed.js`, the `format=ics` branch of `api/events.js`,
`vercel.json` rewrite.

`GET /api/events?format=ics` (public URL: `/kalender.ics`, `?lang=en` for English
labels) serves an iCalendar feed of signup events and dated yearly-calendar
entries (`day_event` / `closed`), bounded to the last 12 months onwards. The
document is assembled by `shared/calendar-feed.js`; keep RFC 5545 concerns
(escaping, 75-octet line folding, `VTIMEZONE`) there rather than in the handler,
and keep `UID`s stable (`event-<id>@`, `yearly-<id>@`) — **a changed UID makes
every subscriber's calendar duplicate the entry.** Week-based yearly entries have
no date and are deliberately left out. Cancelled events stay in the feed with
`STATUS:CANCELLED` so subscribers see the cancellation.

The client-side `AddToCalendar` export (`client/src/lib/calendar.ts`) is the
separate one-event-at-a-time path and is unrelated to the feed.

## Newsletter

Files: `api/cron/event-reminders.js` (`?task=newsletter`), `api/_shared/newsletter.js`,
`api/_shared/delivery.js`, `api/contact.js` (subscribe/confirm/unsubscribe actions).

Three item types feed the evening broadcast, all through the
`newsletter_deliveries` outbox: events and yearly-calendar entries flagged
`notify_newsletter` and dated tomorrow, and blog posts flagged
`notify_newsletter` (any published post that has not been broadcast yet — news
is not tied to a date, so it goes out on the first run after it is flagged).
Each item is stamped `newsletter_sent_at` once no delivery for it is still
pending, which is what stops a second send.

The broadcast runs from Vercel Cron at 19:00 UTC (≈21:00 Oslo); the 07:00 UTC
run of the same handler does registration reminders and GDPR retention cleanup.
Both schedules live in `vercel.json`, are fixed UTC, and do **not** follow
Norwegian DST. `/api/cron/*` requires the `CRON_SECRET` bearer token in
production.
