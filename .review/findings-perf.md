# Findings — performance (runtime, DB, frontend)

Scope: runtime and DB performance at realistic scale (hundreds of users, tens of events/year, ~10 council members). Method: static reading; existing `dist/public` build (closure sizes by walking each chunk's static import graph, gzip -9); local node import timings per handler (3 runs, Node 22, no network/DB). No production metrics, query plans or dashboards.
Labels: measured / evidenced / needs metrics. Severity: High 0 · Medium 3 · Low 4; DB: no material findings.

### PERF-1 Public `/kalender` loads the council editor (TipTap + editor modals) for every visitor
Area: PERF · Severity: Medium · Confidence: CONFIRMED · Verified: build (measured)
Where: `client/src/components/calendar-views.tsx:23` (`useCalendarEditor`), `client/src/components/calendar-editor-tools.tsx:24-27` (static `EventCreationModal`, `YearlyCalendarEntryModal`, `YearlyCalendarImportModal`), `event-creation-modal.tsx:27`, `yearly-calendar-entry-modal.tsx:20` (`import RichTextEditor`)
Evidence: `calendar.tsx:8` lazy-loads `calendar-views`, which always calls `useCalendarEditor()` → statically imports all three modals → two import RichTextEditor. Built `calendar-views-*.js` contains static `from"./RichTextEditor-ClJsImBK.js"`. Measured static JS (gz): main shell 185 kB · `/` 211 · `/news` 205 · `/contact` 317 · **`/kalender` 515 kB (1.73 MB raw)**. RichTextEditor 132 kB gz (427 raw), `schema` 67, `schemas` 52, `calendar-views` 48.
Access pattern → cost → scale: every calendar view (main public page; newsletter and `?vis=` landing) pays ~300 kB gz / 1.1 MB raw extra parse/compile, ~2.5× other public pages; hurts every mid-range phone on mobile regardless of user count.
Cause → Impact: editor-only UI wired statically without a role-gated import → slower first render/INP on the main public page.
Fix: `React.lazy` the three modals in `calendar-editor-tools.tsx`, render only while targeted inside `Suspense`; optionally lazy `EventRegistrationModal` (`calendar-views.tsx:24,381`). Saves ≥132 kB gz.
Test: after rebuild `calendar-views-*.js` has no static import of `RichTextEditor-*`; a client-invariants/deploy-config guard is justified (silent regression). Measure: closure walk + Lighthouse mobile TBT/LCP on `/kalender`. · Regression risk: Suspense fallback on first open; focus return (`editor-accessibility`).
Scope: `pages/content.tsx` also imports it (council-only route).
Dependencies: PERF-2. Tests: `tests/client-invariants.test.mjs:12`, `tests/editor-accessibility.test.mjs`

### PERF-2 Drizzle ORM runtime ships to public pages to derive three form schemas
Area: PERF · Severity: Low · Confidence: CONFIRMED · Verified: build (measured)
Where: `client/src/components/event-registration-modal.tsx:14`, `client/src/pages/contact.tsx:25`, `client/src/components/event-creation-modal.tsx:19` (`insert*Schema` from `@shared/schema`)
Evidence: `schema-DdXCIkWD.js` (298 kB raw / 67 kB gz) = drizzle-orm/pg-core column builders (`PgArrayBuilder`, `PgGeometry`, `PgHalfVector`…), drizzle-zod and all of `shared/schema.ts`; statically imported by `/contact` and `/kalender`. `schemas-*.js` (177 kB / 52 kB gz) is react-hook-form + zod (needed).
Cause → Impact: client validation derived at runtime from Drizzle tables (`createInsertSchema`) → ORM table model in the browser; fixed 67 kB gz per visit to those pages.
Fix: export plain zod schemas for these forms from a small shared module (`schema.ts` stays the type source via `import type`), and/or lazy-load the registration modal (PERF-1).
Test: tsc; no `Pg*Builder` strings in chunks reachable from main/contact; key-parity test between hand-written zod and table. · Regression risk: schema drift.
Dependencies: PERF-1. Tests: none

### PERF-3 Media-share grid shows full-resolution originals as thumbnails
Area: PERF · Severity: Medium · Confidence: HIGH · Verified: static (evidenced; byte totals need metrics)
Where: `client/src/share/share-page.tsx:277-286` (`<img src={file.url} loading={index < 6 ? "eager" : "lazy"}>` in 2–3 column `aspect-square` grid); `api/media.js:135-144` (`mapSharedFile` presigns the single stored object); `docs/mediedeling.md:81-82` ("Bilder beholder original oppløsning"). No thumbnail object in `api/_shared/r2.js`, `media-share.js`, `client/src/lib/media-upload.ts`.
Access pattern → cost → scale: parent opens `/del` on a phone; first 6 tiles are original camera files (2–6 MB, 12–48 MP) → ~15–35 MB on open plus each scrolled tile; each decoded at full res (~48–190 MB memory) for a ~180 px square. Any 20+ photo share on a phone; iOS Safari reloads/kills pages under image-memory pressure; parents pay cellular data.
Cause → Impact: the "no re-encode" rule for originals applied to previews too → slow, data-heavy page that may crash on its target device.
Fix: browser-side preview at upload (canvas → WebP/JPEG ~480 px; canvas strips EXIF/GPS) stored as a second R2 object (`media_files.preview_key` + migration), returned as `previewUrl`; originals stay for lightbox/download. Minimum: only first row eager, add `sizes`.
Test: media-handler checks `previewUrl`; scrub test checks no EXIF in preview. Measure: DevTools bytes/memory for a 30-photo share, throttled mobile. · Regression risk: quota sum (`media.js:357`) and purge (`media-share.js:246`) must include preview keys.
Dependencies: product sign-off (`docs/mediedeling.md` promises "uten omkoding"). Tests: `tests/media-handler.test.mjs`, `media-scrub`, `media-share`

### PERF-4 Function and Neon regions are not pinned or recorded
Area: PERF · Severity: Medium (if mismatched) · Confidence: UNVERIFIED · Verified: static (needs metrics)
Where: `vercel.json` (no `regions`); `api/_shared/database.js:27` (Neon HTTP driver: one HTTPS round trip per `sql` call); `docs/DEPLOYMENT.md:53` (`VERCEL_REGION` only as telemetry)
Evidence: nothing pins the function region or names the Neon region. Vercel's default is `iad1` unless changed in the dashboard; a Norwegian association's Neon project is likely EU. Requests run 1–6 sequential queries: public signup = IP limit, blacklist, email limit, event read, photo snapshot (photo events), locking CTE (`registrations.js:294,332,378,393,472,495`) + Turnstile; council writes = identity lookup (`middleware.js:316`) + work.
Access pattern → cost → scale: N × function↔DB RTT: ~2–10 ms co-located vs ~80–100 ms transatlantic → 0.5 s+ per signup, 100–300 ms per read, plus Neon scale-to-zero wake (~0.3–1 s). Any scale.
Fix: compare Vercel → Settings → Functions → Region with the Neon region; pin both to the same EU region via `"regions"` in `vercel.json` (e.g. `fra1` + `aws-eu-central-1`) — deliberate vercel.json change, call out in PR; record in `docs/DEPLOYMENT.md`.
Test: deploy-config asserts `regions`. Measure: per-handler durations (already logged); p50/p95 of `POST /api/registrations`. Tests: `tests/deploy-config.test.mjs`

### PERF-5 Public reads uncached; events list has no date bound; calendar fans out to 4 calls
Area: PERF · Severity: Low · Confidence: HIGH · Verified: static (evidenced; impact needs metrics)
Where: `vercel.json:81-85` (`/api/(.*)` → `s-maxage=0, no-store`); `api/events.js:308-318` (public GET: `SELECT e.*` + correlated `SUM` per row, every active/cancelled event ever, no bound/LIMIT); `client/src/hooks/useCalendarEntries.ts:28-38` (events + 3 × `/api/yearly-calendar?schoolYear=`); `client/src/hooks/useUpcomingItems.ts:30-40`
Evidence: identical responses for every caller, but each view invokes a function and queries Neon. Events never purged (retention deletes registrations only, `cron/event-reminders.js:536`) → payload grows yearly with every event's HTML description. The ICS feed already does it right: one-year cutoff (`events.js:80-83`) and own `Cache-Control` (`:96-97,148`).
Cost → scale: 4 parallel calls per home/calendar view; without Fluid compute each may cold-start and wake Neon → latency after idle (most visits). Payload matters after several years.
Fix: (a) bound `/api/events` like the feed (or `?from=`); (b) `schoolYears=a,b,c` on `/api/yearly-calendar` → one call; (c) optional short shared cache (`public, s-maxage=60, stale-while-revalidate=300`) — client `invalidateQueries` cannot clear the CDN copy, so editors need a no-store/cache-busting path first.
Test: events-handler asserts cutoff. Measure: invocations per page view, p95 TTFB and bytes of `/api/events`.
Dependencies: PERF-4. Tests: `tests/events-handler.test.mjs`, `tests/deploy-config.test.mjs:64-68`

### PERF-6 Nightly mail runs have a hard per-run capacity; overflow is dropped and housekeeping eats the reminder budget
Area: PERF · Severity: Low · Confidence: HIGH · Verified: static (evidenced; throughput needs metrics)
Where: `api/cron/event-reminders.js:33-34` (`MAX_NEWSLETTER_EMAILS_PER_RUN = 300`), `:62` (`RUN_BUDGET_MS = 23_000` vs maxDuration 30), `:305-313` (deferred → pending), `:323` (`past` → `skipped`), `:687-698` (retention → media purge → reconcile → cleanups → reminders under one `deadline` from `:764`); `api/_shared/delivery.js:3` (`DELIVERY_CONCURRENCY = 5`); `api/_shared/media-share.js:260-283` (purge sequential per share: SELECT files, R2 delete, DELETE row; up to 200 shares; no deadline check)
Evidence: a newsletter run sends ≤ min(300, 23 s × ~5–15 msg/s). Event/calendar deliveries deferred to the next night are marked `skipped` because `eventDate < targetDate` → those subscribers never get that mail; visible only as `remaining`/`deferred` in logs. Morning housekeeping has no deadline checks and runs before reminders.
Scale: hurts when active subscribers × items due the same date > ~120–300 (e.g. 2 items × 150 families).
Fix: when `remaining > 0`, schedule a follow-up run (19:15 cron or self-call with CRON_SECRET) or let one more run still send yesterday's event/calendar rows; deadline check or smaller `PURGE_BATCH` in housekeeping; alert on `mailProblems` (`:719`).
Test: newsletter-broadcast / event-reminders with a deadline expiring mid-batch. Measure: `logCronRun` counts/duration.
Tests: `tests/newsletter-broadcast.test.mjs`, `event-reminders`, `delivery`, `email-deadline`

### PERF-7 Landing critical path: render-blocking third-party font CSS; hero image discovered only after lazy route loads
Area: PERF · Severity: Low · Confidence: HIGH · Verified: static (needs metrics)
Where: `client/index.html:22-23` (plain `<link rel="stylesheet">` to fonts.googleapis.com — render-blocking; comment above says "non-blocking"); `client/src/App.tsx:11` (`Home` lazy); `client/src/components/site/artwork.tsx:58-73`
Evidence: first paint waits on cross-origin CSS then font files. LCP hero (`hero-home-1120` ~150 kB WebP, `-782` ~108 kB) requested only after HTML → entry JS (185 kB gz) → `home-*.js` → render. The CSS requests weight 800 (unused). Share page already self-hosts Manrope (`client/src/share/share.css:2-15`).
Fix: self-host Manrope + Caveat like `/del` (preload 400/700 woff2, `font-display: swap`), drop Google from CSP; import `Home` eagerly (~3 kB gz); optionally preload the hero with `imagesrcset`/`media`.
Measure: Lighthouse/WebPageTest mobile LCP and render-blocking time on `/`. Tests: `tests/deploy-config.test.mjs`

## Blocked/unverified
- Production latency, Neon plan/autosuspend, function region, Fluid compute: BLOCKED (PERF-4/5 impact figures are estimates).
- No `EXPLAIN` (no DB); index judgements from predicates and table sizes; `npm run test:integration` not run.
- Cron throughput (PERF-6): Gmail per-message latency unknown; 5–15 msg/s estimated.
- Vercel cold-start overhead not measured (local import times only). Real share file sizes (PERF-3) unavailable.

## Positive findings
- Measured local import times: auth 96–124 ms, events 122–139, yearly-calendar 107–122, registrations 161–214, contact 133–208, documents 148–180, upload 158–196, secure-settings 164–188, media 222–242, cron 240–328. `@aws-sdk/client-s3` (131–161 ms) loads only in media.js and cron. `sanitize-html` (~55 ms, `middleware.js:7`) and `cloudinary` (~80 ms, `documents.js:2`) on public GET paths — immaterial at this traffic.
- Heavy editor features deferred: `yearly-calendar-pdf` (1.19 MB / 435 kB gz) loads on click only (`calendar-month-tools.tsx:39`); Excel read/write dynamic (`yearly-calendar-excel.ts:215,237`, `excel-export.ts:113`); month grid and QR lazy (`calendar-views.tsx:33-34`, `calendar-entry-share.tsx:19`); every route lazy; `manualChunks` vendor chunks keep TipTap out of `vendor-react` (`vite.config.ts:27-41`); `/del` 170 kB gz total, no editor code.
- Stale-chunk recovery complete: `vite:preloadError` + `ErrorBoundary` reload with loop guard (`main.tsx:31`, `ErrorBoundary.tsx:30`, `lib/stale-chunk.ts`); missing `/assets/*` → 404 not SPA; assets immutable 1 year (deploy-config guard).
- React Query: staleTime 5 min, no refetch on focus, retry 1 (`queryClient.ts:163-166`); shared keys between home/calendar; attendee names load only for the selected entry (`calendar-editor-tools.tsx:325`); news paginated 10/page, debounced search; homepage `limit=3`.
- Images: narrow/wide crops, WebP + JPEG fallback, lazy below the fold, `fetchPriority` on hero, intrinsic sizes.
- DB writes set-based, short locks: signup single locking CTE (`registrations.js:495-571`); photo-slot retry ≤3; import commit one `jsonb_to_recordset` statement (`yearly-calendar.js:341`); `SKIP LOCKED` + 10-min lease claims safe under Neon HTTP auto-commit; SMTP sends deadline-bound (`delivery.js`, 5 s timeouts, pooled transport).
- Predicates covered at realistic size: duplicate check `lower(email)` uses unique `(event_id, lower(email))` index (`migrations/0001:14`); `parseAuthToken` PK lookup and skips DB without cookie; rate limits PK upserts; claim index `(status, next_attempt_at)` + `event_date`; `school_year` indexed. Non-SARGable spots (`e.date::date`, `created_at::timestamptz` in retention, `regexp_replace(content) ILIKE '%…%'` in `secure-settings.js:306,322`) on tiny tables — immaterial below ~10k rows.
- Cron retention keeps tables small (rate-limit rows 7 days after expiry, deliveries 90 days, contact messages 12 months, registrations/cancellations 6 months after event); documents and media list capped at 500.

## Ambiguities
- `shared/schema.ts` does not declare the `(event_id, lower(email))` unique index from migration 0001, but declares `event_registrations_event_id_idx`, `event_registrations_email_idx`, `documents_category_idx` and two `yearly_calendar_*` indexes no migration creates (Drizzle base DDL; `docs/database-testing.md:41-49`) → `npm run db:push` could propose dropping the functional unique index. (Handed to trace/quality.)
- `newsletter_deliveries.subscriber_id` (FK, ON DELETE CASCADE) has no own index (third column of the unique index); immaterial while 90-day retention keeps the table small.
- `/api/auth?action=me` looks up the same user twice (`middleware.js:316`, `auth.js:339`) — one extra PK query, immaterial.
- Public blog list returns full `content` (up to 50k chars/post, `secure-settings.js:316`); fine at realistic sizes; unverified whether the list needs the full body.
- `PUBLIC_MAIL_DAILY_LIMIT` single global counter row (`rate-limit.js:105-110`) serialises public mail; trivial at this volume.
