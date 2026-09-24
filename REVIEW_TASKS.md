# Review tasks

**Progress (2026-09-24):** all P1 and P2 tasks are done (DB-001, TRACE-001, TEST-001, SEC-001–004, PERF-001), plus TEST-002. The only manual step left is applying `migrations/0017_delivery_failed_status.sql` on Neon. SEC-004's captcha is still open, pending a product decision. The P3 tasks are untouched.

Each task comes from one finding in `REPO_REVIEW.md` (evidence in `.review/findings-*.md`). Priorities: P1 → P3. Effort: S (< ½ day), M (≤ 2 days), L (more).

---

## [x] DB-001 — Allow `'failed'` in the delivery outbox status constraint
**Status:** Done — `migrations/0017_delivery_failed_status.sql` + README entry; regression test in `tests/integration/database.test.mjs`. **Still to do by hand: apply 0017 in the Neon SQL editor.**
**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed (PostgreSQL 16 repro) · **Effort:** S · **Area:** Database / Background jobs
### Files
`migrations/0017_delivery_failed_status.sql` (new), `migrations/README.md`, `tests/integration/database.test.mjs`
### Problem
The cron marks a delivery `'failed'` after 5 attempts, but migration 0008's CHECK allows only `pending|processing|sent|skipped`. The UPDATE throws 23514. The row stays `processing` and is retried forever, the evening cron returns 500 every night, and the step that marks news, event and calendar items as sent is skipped.
### Evidence
`api/cron/event-reminders.js:330-338`; `migrations/0008_delivery_outbox.sql:16-17`; no later migration mentions `'failed'`. `.review/04-verification.md` row 7.
### Required change
Add migration `0017` with `ALTER TABLE newsletter_deliveries DROP CONSTRAINT IF EXISTS newsletter_deliveries_status_check; ALTER TABLE … ADD CONSTRAINT newsletter_deliveries_status_check CHECK (status IN ('pending','processing','sent','skipped','failed'));`. List it in `migrations/README.md` and apply it on Neon before (or together with) the next deploy.
### Acceptance criteria
- [ ] The constraint on Neon includes `'failed'` (`pg_get_constraintdef`).
- [ ] An integration test runs the production abandon UPDATE (`exhausted = true`) on a schema built from migrations and gets `status = 'failed'`.
- [ ] The next evening cron run after a permanent bounce returns 200 and logs `newsletter.delivery_abandoned`.
### Verification
`npm run test:integration` (with TEST-001 fixed), then check Neon manually.
### Dependencies
None. TEST-001 makes the regression test meaningful.
### Related findings
TRACE-001, TEST-001, OBS-001

---

## [x] TRACE-001 — Stop newsletter retries for past, cancelled or removed items
**Status:** Done — the claim returns `sourceEligible`; the worker skips ineligible rows and event/calendar rows dated before the target. Unit + integration tests; `docs/subsystems.md` updated.
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (DB) · **Effort:** S · **Area:** Traceability / Background jobs
### Files
`api/cron/event-reminders.js`, `tests/newsletter-broadcast.test.mjs`, `tests/integration/database.test.mjs`
### Problem
The claim query selects any pending row with `event_date <= targetDate`. It does not check whether the event or calendar item has already happened, is cancelled, or was deleted, or whether a post was archived or deleted. The worker then sends the mail.
### Evidence
`api/cron/event-reminders.js:223-266` (claim + `COALESCE` title fallback), `:287` (only the subscriber status is checked). Reproduced: a cancelled event 4 days in the past was claimed.
### Required change
In the claim's final SELECT, return the source's status and date. In the worker, mark the row `skipped` when `item_type IN ('event','calendar')` and `eventDate` is before today in Oslo, when the event is not `active`, or when the source row is missing or not `published`.
### Acceptance criteria
- [ ] A pending delivery for a past event is marked `skipped` and not sent.
- [ ] A pending delivery for a cancelled event or an archived/deleted post is marked `skipped`.
- [ ] A news post retried on a later night is still sent.
### Verification
Unit cases in `newsletter-broadcast.test.mjs`, plus an integration case with the real claim statement.
### Dependencies
DB-001 (so abandoned rows can finish).
### Related findings
TRACE-002

---

## [x] TEST-001 — Build the integration schema the way production was built
**Status:** Done — the fixture leaves every table a migration creates to that migration. Verified: without 0017 the new integration test fails with 23514, with it all 7 pass.
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Testing / Database
### Files
`tests/integration/postgres-fixture.mjs`, possibly `migrations/0000_baseline.sql` (test-only baseline) or a checked-in schema dump
### Problem
The fixture creates every table from `shared/schema.ts` first. As a result, the migrations' `CREATE TABLE IF NOT EXISTS` blocks (0001, 0003, 0008, 0009, 0016), and every CHECK inside them, never run in CI.
### Evidence
`postgres-fixture.mjs:84-88`. The same UPDATE succeeds on the fixture schema and fails on a schema built from migrations (`.review/04-verification.md` row 7).
### Required change
Create only the tables that existed before 0001 from Drizzle (or from a baseline SQL file), then apply all migrations. Add an assertion that the CHECK constraints in the fixture include the ones declared in the migrations.
### Acceptance criteria
- [ ] Fixture tables that a migration creates are created by that migration.
- [ ] Before DB-001 is fixed, a test running the abandon UPDATE fails in CI; after it, the test passes.
- [ ] The existing 5 integration tests still pass.
### Verification
`npm run test:integration` against local PostgreSQL 16/17.
### Dependencies
None (land before or with DB-001).
### Related findings
DB-001

---

## [x] SEC-001 — Enforce attendee and photo-slot limits on the server
**Status:** Done — `MAX_ATTENDEES_PER_REGISTRATION = 10` shared by API and form; foto signups must name every child, and a day without enough slots answers 409. `tests/registrations-handler.test.mjs`.
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (unit) · **Effort:** S · **Area:** Security / Business logic
### Files
`api/registrations.js`, `shared/photo-slots.js` (only if a helper is added), `tests/registrations-handler.test.mjs` (new)
### Problem
The server accepts up to 100 attendees per anonymous signup; the UI allows 10. Photo ("foto") events skip the capacity check, and a registration is stored even when fewer slots than children could be assigned.
### Evidence
`api/registrations.js:248`, `:398-404`; `shared/photo-slots.js:138-146`; `client/src/components/event-registration-modal.tsx:19`. The probe got a 201 with `attendeeCount: 100`.
### Required change
Cap `attendeeCount` at 10 (a shared constant used by both the UI and the server). For foto events, require `childrenNames.length === attendeeCount` and return 409 when `assignPhotoSlots` returns fewer slots than requested.
### Acceptance criteria
- [ ] `attendeeCount: 11` → 400.
- [ ] A foto registration on a fully booked day → 409, and no row is inserted.
- [ ] A normal 1–10 signup still gets 201.
### Verification
Handler-harness tests (TEST-002).
### Dependencies
Confirm with the council that 10 is the right maximum.
### Related findings
TEST-002

---

## [x] SEC-003 — Remove the uploader's login e-mail from the public documents list
**Status:** Done — `uploaded_by` dropped from the public list (test in `document-deletion.test.mjs`). Decided to leave the yearly calendar's public `createdBy`: it holds a display name, not a login.
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Data exposure
### Files
`api/documents.js`, `api/yearly-calendar.js` (`createdBy` in the public GET), `tests/document-deletion.test.mjs` or a new documents handler test
### Problem
`GET /api/documents` is public and returns `uploadedBy`, which is a council member's login e-mail. No client reads it.
### Evidence
`api/documents.js:58`, `api/upload.js:296`, `api/secure-settings.js:607`.
### Required change
Drop `uploaded_by` from the public SELECT. Decide whether the public yearly-calendar GET should also omit `createdBy`.
### Acceptance criteria
- [ ] The public list response has no `uploadedBy` key.
- [ ] `/files` renders unchanged.
### Verification
Handler-harness test on the public GET, then `npm test`.
### Dependencies
None.
### Related findings
SEC-002

---

## [x] SEC-002 — Stop anonymous callers from locking council accounts out
**Status:** Done, with a different design from the one written above. Verifying the password first and never blocking a correct one would have made the account limit useless against distributed guessing (a 200 still reveals the hit). Implemented instead: the account limit counts only failures and is read without being bumped, keys are hashed, and a browser that has signed in before gets an HttpOnly `login-device` cookie (signed, own audience, `/api/auth`, 180 days) that gets it past the account lock under its own 10-per-15-minutes limit. Unknown browsers stay locked. Tests in `auth-handler` and `rate-limit`; `docs/architecture.md` updated.
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** M · **Area:** Security / Authentication
### Files
`api/auth.js`, `api/_shared/rate-limit.js`, `tests/auth-handler.test.mjs`
### Problem
The IP-agnostic per-account limit (20 per hour) counts every attempt and is checked before the password, so a correct login is also refused. Its key stores the raw e-mail.
### Evidence
`api/auth.js:75`, `:87-99`.
### Required change
Verify the password first. Apply the per-account counter only to failed attempts, and never block a correct password on that counter alone. Keep the per-(IP, account) and per-IP limits in front. Hash the account key.
### Acceptance criteria
- [ ] After 25 failed attempts from other IPs, the correct password still logs in.
- [ ] 6 failed attempts from one IP for one account → 429, as today.
- [ ] No `api_rate_limits.key` contains an `@`.
### Verification
New auth-handler cases, then `npm test`.
### Dependencies
SEC-003 (lowers exposure in the meantime).
### Related findings
SEC-003

---

## [x] SEC-004 — Limit what the public forms can make FAU's Gmail send
**Status:** Done except the captcha, which needs a product decision. The confirmation no longer echoes the comment; signup, contact and newsletter mails share a 200/day cap (`sendPublicMail`), past which data is stored, mail is skipped and `mail.public_daily_cap_reached` is logged.
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** M · **Area:** Security / Abuse
### Files
`api/registrations.js`, `api/contact.js`, `api/_shared/email.js` (optional global cap), `tests/emails.test.mjs`
### Problem
Signup confirmations repeat the submitter's name and up to 1,000 characters of comment text to any address, without checking that the submitter owns it. Rate limits are per IP only, and all mail shares one Gmail quota.
### Evidence
`api/registrations.js:492-503`, `:607-617`; `api/contact.js:145-158`.
### Required change
Leave the comment out of the confirmation mail (or send it only to FAU). Add a daily cap on unauthenticated outbound mail (a counter in `api_rate_limits`). Discuss adding a challenge such as Turnstile to signup and contact.
### Acceptance criteria
- [ ] The confirmation text contains no free-text comment.
- [ ] Beyond N public-triggered mails per day, further requests still store the data but skip mail and log a warning.
### Verification
Unit tests on the mail builders and the cap.
### Dependencies
Product decision on a captcha.
### Related findings
OBS-001

---

## [x] PERF-001 — Keep the rich-text editor out of the eager vendor chunk
**Status:** Done — measured after the change: first-load JS 553 kB min / 172 kB gzip, `vendor-react` 205 kB with 0 ProseMirror references; browser smoke test passes on `/` and the editor on `/content`.
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (measured) · **Effort:** S · **Area:** Performance / Frontend
### Files
`vite.config.ts`, `tests/deploy-config.test.mjs` (optional guard)
### Problem
`id.includes("/react/")` also matches `@tiptap/react` (and others), so ProseMirror/TipTap is preloaded on every public page.
### Evidence
First-load JS is 855 kB (262 kB gzip). With `/node_modules\/(react|react-dom|scheduler)\//` it is 553 kB (172 kB gzip).
### Required change
Match exact package directories in `manualChunks`.
### Acceptance criteria
- [ ] `vendor-react` contains no `ProseMirror` (`grep -c` = 0).
- [ ] First-load JS is ≤ 560 kB min.
- [ ] The editor still loads on `/content`.
### Verification
`npm run build`; sum the sizes of the `index.html` script and modulepreload files.
### Dependencies
None.
### Related findings
PERF-002

---

## [ ] SEC-005 — Validate integer and string types before they reach SQL or bcrypt
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed (unit) · **Effort:** S · **Area:** Security / Input validation
### Files
`api/_shared/middleware.js`, `api/auth.js`, `api/registrations.js`, `api/secure-settings.js`, `tests/sanitizer-runtime.test.mjs`, `tests/auth-handler.test.mjs`
### Problem
`sanitizeNumber` accepts fractions, and the login fields are not type-checked, so bad input gives a 500 instead of a 400.
### Evidence
`middleware.js:609-613`; `auth.js:58-113`; probe results in `.review/04-verification.md` row 9.
### Required change
Add an integer sanitizer (or reuse `sanitizeInteger` from `yearly-calendar.js:137`) for ids, limits and counts. Require `typeof username/password === 'string'`.
### Acceptance criteria
- [ ] `attendeeCount: 2.5`, `limit=1.5`, `id=1.5` → 400.
- [ ] Login with a non-string password → 400.
### Verification
New unit and handler tests.
### Dependencies
None.
### Related findings
SEC-001

---

## [ ] SEC-006 — Make subscribe and user-create idempotent under concurrency
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Security / Concurrency
### Files
`api/contact.js`, `api/secure-settings.js`, `tests/integration/database.test.mjs`
### Problem
A SELECT followed by an INSERT on a unique column gives a 500 when two requests race.
### Evidence
`contact.js:261-287`; `secure-settings.js:618-630`.
### Required change
Use `INSERT … ON CONFLICT (email) DO UPDATE … WHERE status <> 'active'` for subscribe. For user create, catch 23505 and return 400.
### Acceptance criteria
- [ ] Two concurrent subscribes both return 200.
- [ ] A duplicate user returns 400 in every case.
### Verification
Integration test with parallel statements.
### Dependencies
TEST-001 (fixture fidelity).
### Related findings
—

---

## [ ] SEC-007 — Stop tying error redaction and cookie security to `NODE_ENV`
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Security / Configuration
### Files
`api/_shared/middleware.js`, `api/auth.js`, `tests/api-security.test.mjs`
### Problem
If `NODE_ENV` is anything other than `production`, raw error messages are returned, cookies lose the `Secure` flag, and CORS switches to the localhost allowlist.
### Evidence
`middleware.js:45-47,155-167,209`; the cron comment at `event-reminders.js:58-63` records such a deployment.
### Required change
Redact unless `NODE_ENV === 'development'`, and set `Secure` unless it is explicitly local development (or key on `VERCEL_ENV`).
### Acceptance criteria
- [ ] With `NODE_ENV` unset, a 500 body is `Internal server error` and cookies include `Secure`.
### Verification
Middleware unit test.
### Dependencies
None.
### Related findings
—

---

## [ ] SEC-008 — Compare the cron secret in constant time
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Security / Crypto
### Files
`api/cron/event-reminders.js`, `tests/event-reminders.test.mjs`
### Problem
`isAuthorizedCron` compares the secret with `===`.
### Evidence
`event-reminders.js:64-68`.
### Required change
Compare with `crypto.timingSafeEqual` after an equal-length check, the same way `validateCsrfToken` does.
### Acceptance criteria
- [ ] The existing cron authorization tests pass.
- [ ] A wrong secret of the same length → 401.
### Verification
`npm test`.
### Dependencies
None.
### Related findings
—

---

## [ ] TRACE-002 — Don't hold flagged news posts for future subscribers
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Traceability / Background jobs
### Files
`api/cron/event-reminders.js`, `tests/newsletter-broadcast.test.mjs`
### Problem
With zero active subscribers no delivery rows exist, so a flagged post is never marked sent. It is then mailed to whoever subscribes months later.
### Evidence
`event-reminders.js:208-211`, `:387-400`.
### Required change
Mark flagged news posts as sent after the fan-out even when nothing was queued (or bound news fan-out by post age).
### Acceptance criteria
- [ ] Broadcast with 0 subscribers marks the post sent.
- [ ] A later subscriber does not receive it.
### Verification
Unit test.
### Dependencies
DB-001.
### Related findings
TRACE-001

---

## [ ] TRACE-003 — Store ISO timestamps in text columns consistently
**Priority:** P3 · **Severity:** Low · **Confidence:** High (format) / Possible (browser impact) · **Effort:** S · **Area:** Traceability / Data contracts
### Files
`api/contact.js`, `api/upload.js`, a new migration to normalize existing rows
### Problem
`NOW()` inserted into `text` columns stores `2026-09-24 11:56:00.123456+00` instead of ISO. Clients parse these values with `new Date()`.
### Evidence
`contact.js:118`, `upload.js:315`; readers at `files.tsx:126,278` and `messages.tsx:210,348`.
### Required change
Write `new Date().toISOString()`, and normalize existing rows with `to_char(created_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.
### Acceptance criteria
- [ ] New rows match `/^\d{4}-\d{2}-\d{2}T.*Z$/`.
- [ ] Existing rows are normalized.
### Verification
Handler tests, then a spot check on Neon.
### Dependencies
None.
### Related findings
—

---

## [ ] TRACE-004 — Return error codes, not English text, for signup failures
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Traceability / i18n
### Files
`api/registrations.js`, `client/src/components/event-registration-modal.tsx`, `client/src/lib/i18n.ts`
### Problem
The client picks its translations by substring-matching English server messages. Unmatched messages, such as "Event not found or not active", are shown raw.
### Evidence
`event-registration-modal.tsx:91-137`; `registrations.js:470-483`.
### Required change
Add `code` to the error bodies (`EVENT_FULL`, `ALREADY_REGISTERED`, `EVENT_INACTIVE`, `DEADLINE_PASSED`, `SIGNUP_CLOSED`) and map the codes to i18n keys.
### Acceptance criteria
- [ ] No `includes(` on server error text in the modal.
- [ ] Every code has `no` and `en` strings.
### Verification
`npm run check` (i18n ratchet) and a handler test.
### Dependencies
None.
### Related findings
—

---

## [ ] TRACE-005 — Filter editor images before limiting the documents list
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Traceability
### Files
`api/documents.js`
### Problem
`LIMIT 500` is applied before the client filters out `editor-image` rows, so older real documents can disappear from `/files`.
### Evidence
`documents.js:48-63`; `files.tsx:124`; `RichTextEditor.tsx:253`.
### Required change
Add `WHERE category <> 'editor-image'` to the public list.
### Acceptance criteria
- [ ] Editor images never count toward the list limit.
### Verification
Handler test.
### Dependencies
SEC-003 (same query).
### Related findings
SEC-003

---

## [ ] TRACE-006 — Remove or document the orphans
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability
### Files
`shared/schema.ts`, `api/secure-settings.js`, `api/cron/event-reminders.js`
### Problem
`site_settings` and its insert schema and type are unused. The `staff-users` alias has no caller. `reminder_attempts` is written but never read.
### Evidence
`schema.ts:177-183,302,333`; `secure-settings.js:739`; cron `:561`.
### Required change
Remove the unused declarations or alias, or give `reminder_attempts` a purpose (a cap or a log field).
### Acceptance criteria
- [ ] `grep site_settings` hits only migrations/history, or the table is documented as reserved.
### Verification
`npm run check`, then `npm test`.
### Dependencies
None.
### Related findings
OBS-001

---

## [ ] PERF-002 — Ask the server for homepage posts only
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Performance
### Files
`client/src/pages/home.tsx`, `api/secure-settings.js`
### Problem
The homepage fetches up to 500 full posts to show 3.
### Evidence
`home.tsx:98-102`; `secure-settings.js:236,263-273`.
### Required change
Add a `homepage=true&limit=3` filter (`show_on_homepage = true`) and use it on the homepage.
### Acceptance criteria
- [ ] The homepage request returns ≤ 3 rows.
- [ ] The query key still starts with the blog-posts URL, so invalidation keeps working.
### Verification
Network panel or a test on the query URL.
### Dependencies
None.
### Related findings
PERF-001

---

## [ ] PERF-003 — Commit the year-calendar import in one atomic statement
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** M · **Area:** Performance / Database
### Files
`api/yearly-calendar.js`, `tests/yearly-calendar-handler.test.mjs`, `tests/integration/database.test.mjs`
### Problem
Up to 500 sequential round trips run inside a 30 s function, each one committing independently.
### Evidence
`yearly-calendar.js:247-352`.
### Required change
Validate every row first, then insert and update in one statement using `jsonb_to_recordset` (or a small number of statements).
### Acceptance criteria
- [ ] A 500-row import runs ≤ 3 SQL statements.
- [ ] A failure leaves no partial import.
### Verification
Handler test counting statements, plus an integration test.
### Dependencies
TEST-001.
### Related findings
—

---

## [x] TEST-002 — Add a handler suite for public signup
**Status:** Done together with SEC-001 (`tests/registrations-handler.test.mjs`, 5 cases; all fail on the old handler).
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Testing
### Files
`tests/registrations-handler.test.mjs` (new)
### Problem
There is no behavioural test for the capacity, duplicate, deadline, photo-slot or mail-content rules.
### Evidence
`tests/` covers only cancel and source-text guards for registrations.
### Required change
Add handler-harness cases for the rules in SEC-001, SEC-004 and SEC-005.
### Acceptance criteria
- [ ] The suite fails on today's code for the SEC-001 cases and passes after the fix.
### Verification
`node --test --experimental-test-module-mocks tests/registrations-handler.test.mjs`.
### Dependencies
Land with SEC-001.
### Related findings
SEC-001, SEC-004

---

## [ ] OBS-001 — Make mail failure visible in aggregate
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Observability
### Files
`api/cron/event-reminders.js`, `api/_shared/provider-errors.js`, optionally an admin view
### Problem
Failed sends show up only as individual Sentry events. Nothing tracks "N failed today" or pending deliveries.
### Evidence
`provider-errors.js`; cron `:342-347`, `:561`.
### Required change
Add `failed`, `abandoned` and `remaining` counts to `cron.run` (partly done already) and alert when they are above 0. Show pending/failed counts in the admin UI.
### Acceptance criteria
- [ ] One log line per run carries the failure counts.
- [ ] An alert rule is documented in `docs/DEPLOYMENT.md`.
### Verification
Unit test on the summary object.
### Dependencies
DB-001.
### Related findings
SEC-004

---

## [ ] MAINT-001 — Extract shared event validation
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability
### Files
`api/events.js`, `tests/events-handler.test.mjs`
### Problem
About 50 lines of validation are copied between POST and PUT.
### Evidence
`events.js:222-272` vs `:288-338`.
### Required change
Move them into a `validateEventBody(body)` function that returns `{ error }` or `{ values }`.
### Acceptance criteria
- [ ] One validation path.
- [ ] Existing events-handler tests pass unchanged.
### Verification
`npm test`.
### Dependencies
None.
### Related findings
—

---

## [ ] MAINT-002 — Route every `secure-settings` read through its mapper
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability
### Files
`api/secure-settings.js`
### Problem
Some reads alias columns inline while writes use the `map*` functions, which breaks the AGENTS.md rule of one mapper per resource.
### Evidence
`secure-settings.js:253,264,376-378,560-565`.
### Required change
SELECT raw rows and map them through `mapBlogPost`, `mapKindergartenInfo` and `mapContactMessage`. The public blog GET can map and then omit fields.
### Acceptance criteria
- [ ] No `as "camelCase"` aliases remain in this handler's SELECTs.
- [ ] Response shapes are unchanged (snapshot test).
### Verification
Handler tests.
### Dependencies
None.
### Related findings
—

---

## [ ] A11Y-001 — Fix the week-label contrast on `/kalender`
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed (axe) · **Effort:** S · **Area:** Accessibility
### Files
`client/src/components/calendar-entry-list.tsx`
### Problem
The "UKE" label is 3.85:1 on `bg-green-50` because of `opacity-80`.
### Evidence
axe `color-contrast` on `/kalender` at 375 px light (`.review/findings-quality.md`).
### Required change
Remove `opacity-80` from line 216.
### Acceptance criteria
- [ ] axe reports 0 violations on `/kalender` in both themes.
### Verification
Re-run the axe scan (method in `.review/04-verification.md` row 11).
### Dependencies
None.
### Related findings
—

---

## Dependency graph

```
TEST-001 ──▶ DB-001 ──▶ TRACE-001 ──▶ TRACE-002
    │           └────▶ OBS-001
    ├──▶ SEC-006
    └──▶ PERF-003
SEC-003 ──▶ SEC-002
SEC-003 ──▶ TRACE-005        (same query)
SEC-001 ◀──▶ TEST-002         (land together)
SEC-004 ──▶ OBS-001           (the mail cap feeds the alert)
```
DB-001 does not strictly need TEST-001, but its regression test proves nothing until the fixture is fixed. Ship DB-001's migration first if you can't wait.

## Can run in parallel
- **Stream A (outbox):** DB-001 → TRACE-001 → TRACE-002, with TEST-001 alongside.
- **Stream B (public signup):** SEC-001 + TEST-002, then SEC-005, then TRACE-004.
- **Stream C (auth and exposure):** SEC-003 → SEC-002, then TRACE-005.
- **Independent any time:** PERF-001, PERF-002, A11Y-001, SEC-007, SEC-008, MAINT-001, MAINT-002, TRACE-003, TRACE-006, SEC-004 (after the product decision).
