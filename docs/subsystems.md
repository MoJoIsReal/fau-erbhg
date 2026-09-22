# Subsystem rules

Domain invariants for the four subsystems whose rules are easy to break from
the code alone. Read the relevant section before changing the files it names.
Everything else lives in [`AGENTS.md`](../AGENTS.md).

## Yearly calendar

Files: `client/src/components/calendar-{views,view,month-tools}.tsx`,
`client/src/components/yearly-calendar-entry-modal.tsx`, `api/yearly-calendar.js`,
`shared/yearly-calendar-display.js`, `shared/yearly-calendar-utils.js`,
`client/src/lib/yearly-calendar-{excel,pdf}.*`.

The month grid runs **Monday–Sunday**. The kindergarten week is Mon–Fri, but FAU
arrangements (dugnad, sommerfest) fall on weekends, so the weekend columns exist
and are only dimmed. `weeksOfMonth()` in `shared/yearly-calendar-display.js` is
the single source for that grid — the page and the PDF export both use it; do
not re-derive weeks locally. All seven days remain selectable on phones; the
agenda below the grid contains the readable details and editor controls.

A `day_event` can carry an optional `startTime`/`endTime` ("HH:MM", Norwegian
local time). Without a start time it stays an all-day entry, which is what most
of them are; with one it renders as "18:30–21:00 Tittel" and the calendar feed
publishes it as a timed VEVENT (busy) instead of an all-day block (free). An end
that is not after the start is dropped rather than rejected, the same way
`weekNumberEnd` is. Only `day_event` takes times — every other type is a whole
day or a whole week — and the Excel import does not carry them, so re-importing
never wipes a time set in the UI.

The public calendar has List and Month views. The month view replaces the old
standalone yearly calendar; its legacy URLs redirect to `/kalender?view=month`.
Editors select a day or week to create an entry and edit its date, month, year,
week span or weekdays in the form to move it. `shared/yearly-calendar-placement.js`
derives the school year from that placement, including moves across July/August.
Month notes without a week are shown above the grid. The editor's complete month
list also exposes yearly entries hidden by filters or deduplicated against events.
Staff can edit yearly entries; only council roles can edit signup events.

PDF downloads (selected month or full August–July school year) are public in the
month view, including on phones. They use the light design tokens and bundled
Manrope fonts in an A4 landscape layout, with complete source rows regardless of active filters. Long titles and
additional entries continue in a detail section instead of being lost. Week spans
are matched by their dates across month boundaries. Downloads stay disabled if a
required source failed to load. Signup events and cancelled events are included.
Excel import/export remains in the editor toolbar, scoped to the displayed month’s
school year (or the current school year in List view).

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

A signup event's `time` must be `HH:MM` — that is the only shape
`toIcsLocalDateTime` can render, and an event it cannot render is dropped from
the feed entirely. The event still looks fine on the website, which prints the
raw string, so this fails silently in exactly one direction: subscribers never
see it. `api/events.js` rejects anything else on create and update, and logs a
warning if a stored row still has one. Watch for the Norwegian decimal form
("17.00") — it is the natural thing to type and it is not valid here.

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

## Rich text and video embeds

Files: `shared/video-embed.js`, `api/_shared/middleware.js` (`sanitizeHtml`),
`client/src/components/safe-html.tsx`, `client/src/components/RichTextEditor.tsx`,
`vercel.json` (CSP).

Post and event bodies are stored as HTML that has been through `sanitizeHtml`
on write and DOMPurify on render. Both allowlists are deliberately narrow, and
both have to agree — content that only one of them keeps either disappears on
save or renders as a hole.

An `<iframe>` is the one element whose rules span four files:

1. `shared/video-embed.js` decides which URL may be framed at all. Only
   YouTube's no-cookie player is allowed, and `youtubeEmbedSrc` rebuilds the
   src from the video id, so autoplay, referrer and tracking parameters an
   author pasted never reach the stored markup. Both tiers import it.
2. `sanitizeHtml` keeps the frame, fixes its attributes (`allow`, `loading`,
   `allowfullscreen`, `title`) and drops any frame left without a src.
3. `SafeHtml` re-checks the src in the browser, so content stored before a rule
   tightened cannot render a frame the current rule rejects.
4. `vercel.json` must list the same host in `frame-src`, or the browser blocks
   a frame both sanitizers approved and the visitor sees an empty box.
   `scripts/smoke-tests.mjs` cross-checks the CSP against the shared host.

The sanitizer strips the wrapper `<div data-youtube-video>` that
`@tiptap/extension-youtube` renders, so a stored video is a bare `<iframe>`.
The stock extension only parses its own wrapper, which would silently drop the
video when a post is reopened for editing — `RichTextEditor.tsx` extends
`parseHTML` to recognise the bare frame too. Its paste handler is off on
purpose: a pasted YouTube link should stay a link, not become a player.
