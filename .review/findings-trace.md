# Findings — traceability (flows F-01…F-16)

### TR-1 Outbox writes `status='failed'`, which the production CHECK constraint forbids
Area: DB · Severity: High · Confidence: CONFIRMED · Verified: db (local PostgreSQL 16, see 04-verification)
Where: `api/cron/event-reminders.js:330-338` (`SET status = ${exhausted ? 'failed' : 'pending'}`), `:474-476` (retention expects `'failed'`); `migrations/0008_delivery_outbox.sql:16-17` (`CHECK (status IN ('pending','processing','sent','skipped'))`); no later migration touches it (`grep -n "'failed'" migrations/` → none; 0010 only widens `item_type`).
Evidence: `MAX_DELIVERY_ATTEMPTS = 5` (`:40`). On the 5th failed send the catch block issues the UPDATE; PostgreSQL raises 23514 `newsletter_deliveries_status_check`. That throw escapes the worker, `runWithConcurrency` (`delivery.js:45-74`) aggregates it, and `broadcastNewsletter` exits **before** the three stamp UPDATEs (`:357-400`) and the remaining count. The row stays `processing` with `attempts = 5`.
Cause → Impact: code and schema disagree on the state machine → (1) the abandon path added to stop endless retries never takes effect: every 10-minute lease expiry the row is reclaimed, `attempts` climbs, and a mail is attempted every night indefinitely; (2) every evening cron run from then on ends in HTTP 500 (Sentry noise hides new failures); (3) no source item is stamped on those runs — for news posts the fan-out re-runs nightly and new subscribers keep receiving old posts, the exact defect the comment at `:32-39` says this code fixes. Triggered by any one permanently undeliverable subscriber address.
Fix: new migration `0017` that drops and re-adds `newsletter_deliveries_status_check` with `'failed'`; record it in `migrations/README.md`; apply before or with the next deploy. · Test: integration test that runs the production UPDATE with `exhausted = true` against a schema built from migrations (see TEST-1). · Regression risk: none (widening).
Dependencies: TEST-1 (why CI missed it).
Tests touching this: `tests/newsletter-broadcast.test.mjs:38-140` and `tests/backend-invariants.test.mjs:76-77` assert the code writes `'failed'` against a scripted DB — they pin the bug rather than catch it.

### TR-2 Newsletter retries ignore the source item's state and date
Area: TRACE · Severity: Medium · Confidence: CONFIRMED · Verified: db (claim query executed on local PostgreSQL 16 returned a pending delivery for a cancelled event dated 4 days before `targetDate`)
Where: `api/cron/event-reminders.js:223-266` claim query: `WHERE event_date <= ${targetDate}` with no join condition on `events.status`, `blog_posts.status`, or `event_date >= today`; titles fall back to the stored copy when the item was deleted (`COALESCE(ev.title, yc.title, bp.title, c.title)`).
Evidence: an event reminder that fails on the evening before the event (`event_date = D`) gets `next_attempt_at` = +1…60 min, but the next cron run is 24 h later with `targetDate = D+1`; `D <= D+1` → claimed and sent on the evening of the event day, and again on later nights until `attempts` reaches 5 (or forever, per TR-1). Same for an event cancelled (`status='cancelled'`), a calendar entry deleted, or a post archived/deleted after queueing.
Cause → Impact: the retry predicate was widened (`<=`) to fix stranding, without a freshness/validity guard → parents get "Påminnelse: Sommerfest – lørdag 14. juni" after the party, or a reminder for a cancelled event.
Fix: in the claim (or the worker) mark rows `skipped` when `item_type IN ('event','calendar') AND event_date < today-in-Oslo`, or when the joined source is missing/not active/not published. · Test: newsletter-broadcast cases for past-dated and cancelled items. · Regression risk: a legitimately late news post still sends (news uses run date).
Dependencies: TR-1.

### TR-3 Flagged news posts wait for the first subscriber, then go out months late
Area: TRACE · Severity: Low · Confidence: HIGH · Verified: static
Where: stamp condition `api/cron/event-reminders.js:387-400` requires `EXISTS (… newsletter_deliveries d WHERE d.item_id = p.id)`; fan-out `:208-211` is a CROSS JOIN with active subscribers.
Evidence: with zero active subscribers no delivery row exists, so the post is never stamped; when someone confirms later, every still-unstamped flagged post is fanned out to them.
Fix: stamp news items after the fan-out even when the subscriber set is empty (or restrict news fan-out to posts newer than N days). · Test: broadcast with no subscribers, then one. · Regression risk: low.

### TR-4 Two text timestamp formats in the same kind of column
Area: TRACE · Severity: Low · Confidence: HIGH (format) / POSSIBLE (browser impact) · Verified: static + V8 check
Where: `api/contact.js:118` and `api/upload.js:315` insert `NOW()` into `text` columns (`contact_messages.created_at`, `documents.uploaded_at`) → PostgreSQL text form `2026-09-24 11:56:00.123456+00`; every other writer stores `new Date().toISOString()`. Readers: `client/src/pages/files.tsx:126,278`, `client/src/pages/messages.tsx:210,348` use `new Date(string)`; `formatDate` (`client/src/lib/i18n.ts:2675-2685`) returns `''` on Invalid Date.
Evidence: V8 parses the PG form (verified); the ECMAScript spec only guarantees the ISO `T` form, so other engines may return Invalid Date (UNVERIFIED — no WebKit/Gecko in this environment).
Fix: write `${new Date().toISOString()}` like the other handlers (or `to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`), and normalize existing rows in a migration. · Test: handler test that stored `created_at` matches ISO. · Regression risk: none.

### TR-5 Client localizes signup errors by substring-matching English server text
Area: TRACE · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `client/src/components/event-registration-modal.tsx:91-137` (`includes("already registered")`, `"capacity"`, `"cancelled"`, Norwegian `e-postadresse`); server strings `api/registrations.js:470-483` are English-only while neighbouring errors are bilingual (`:271-273`, `:341-351`).
Evidence: `"Event not found or not active"` (cancelled/closed events) matches none of the substrings and is shown raw in English to Norwegian users; renaming any server message silently breaks the mapping.
Fix: return a stable `code` (`EVENT_FULL`, `ALREADY_REGISTERED`, `EVENT_INACTIVE`…) and map codes to `i18n.ts` keys, as `PASSWORD_CHANGE_REQUIRED` already does. · Test: client-invariants or handler test on codes. · Regression risk: low.

### TR-6 Documents list truncates before the client filters out editor images
Area: TRACE · Severity: Low · Confidence: HIGH · Verified: static
Where: `api/documents.js:48-63` (`ORDER BY uploaded_at DESC LIMIT 500`, all categories) vs `client/src/pages/files.tsx:124` (keeps only known categories); rich-text images are stored as `category: 'editor-image'` (`RichTextEditor.tsx:253`).
Evidence: each image inserted in a post/event consumes one of the 500 rows; once images + documents exceed 500, the oldest real documents vanish from `/files` with no error.
Fix: filter `category <> 'editor-image'` (or the allowed set) in SQL, and paginate. · Test: handler test. · Regression risk: none.

### TR-7 Orphans and dead declarations
Area: TRACE · Severity: Low · Confidence: CONFIRMED · Verified: static (grep)
Where: `shared/schema.ts:177-183,302,333` `site_settings` / `insertSiteSettingSchema` / `SiteSetting` — no handler or client reference; `api/secure-settings.js:739` `resource === 'staff-users'` alias — no client caller (`grep staff-users client/src` → only a component import name); `event_registrations.reminder_attempts` is incremented (`cron:561`) but never read or capped.
Fix: remove or document as intentional. · Regression risk: none.

## Contract checks that passed (return/error paths)
- F-01/F-02: 401 clears `['/api/auth']` (`queryClient.ts:49-66`); `PASSWORD_CHANGE_REQUIRED` code drives the password modal.
- F-03: `cancel_token` stripped from the 201 body (`registrations.js:506`); duplicate e-mail guarded by `NOT EXISTS` + unique index + `ON CONFLICT DO NOTHING`; counter write only when a row was inserted.
- F-04: cancel = one statement (delete + history copy + counter), Oslo-date guard (`registration-cancel.js:19-35`).
- F-05: event date/time/capacity/deadline validated server-side; deadline converted to ISO in the browser (`event-creation-modal.tsx:283`), compared as ISO text on the server — consistent.
- F-08: delete keeps the row when Cloudinary fails; `not found` treated as success (idempotent retry).
- F-12/F-13: deadline-bounded sends, lease recovery, Message-ID per delivery; morning stages isolated.
- F-14: `/kalender.ics` gets its own Cache-Control because vercel.json header rules match the pre-rewrite path (documented at `events.js:71-83`).

## Blocked/unverified
- Production schema state (whether 0008's CHECK exists exactly as in the file) — inferred from the migration and from 0010 relying on the same auto-generated constraint naming; not observed on Neon.
- Non-Chromium date parsing (TR-4).

## Ambiguities
- Whether a news post flagged before any subscriber exists should ever be sent (TR-3).
