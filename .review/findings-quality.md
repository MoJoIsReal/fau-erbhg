# Findings — quality (maintainability, tests, observability, docs, a11y)

Method: backend `tsc` with and without `--strictNullChecks`; observability + secure-settings suites (22/22 pass); two harness probes (scratchpad); contrast computation over colour tokens. No repo file modified.
Counts: 26 findings — High 0, Medium 15, Low 11. MAINT 5 (M3 L2) · TEST 3 (M2 L1) · OBS 5 (M3 L2) · DOC 5 (M2 L3) · A11Y 8 (M4 L4).

## Maintainability

### MAINT-1 Backend type ratchet: over half the budget is config noise; counting totals hides new errors
Area: MAINT · Severity: Medium · Confidence: CONFIRMED · Verified: build
Where: `scripts/check-backend-types.mjs:31` (`OTHER_BUDGET=50`), `tsconfig.api.json` (`strict:false`)
Evidence: 27 in `shared/schema.ts:347-375` (drizzle-zod `.omit({x:true})` "'true' not assignable to 'never'"), pulled in via `shared/calendar-entries.d.ts:1`, `yearly-calendar-placement.d.ts:2`, `yearly-calendar-utils.d.ts:1`; 0 with `--strictNullChecks`. 4 union-narrowing artifacts (`api/yearly-calendar.js:272,295,298,315`). 7 TS2739 (`sendEmail`/`sendPooledEmail` infer `from`/`messageId` required, `email.js:94,119`). 4 from misplaced JSDoc (`middleware.js:507-519`). 3 TS1064 (`@returns {Object|null}` on async, `middleware.js:290,351,381`). ~5 minor. None is a real bug.
Cause → Impact: ratchet compares totals → fixing noise frees headroom for a real error; a drizzle-zod/TS bump moves the 27 arbitrarily.
Fix: JSDoc on senders (−7), move JSDoc (−4), `Promise` return types (−3), keep schema.ts out of the api program; fingerprint diagnostics (file+code+message) in a baseline file. · Test: backend-type-gate case where one added + one removed diagnostic still fails.
Tests: `tests/backend-type-gate.test.mjs`

### MAINT-2 Three error-handling conventions; contact.js and upload.js re-wrap and log every 500 twice
Area: MAINT · Severity: Medium · Confidence: CONFIRMED · Verified: unit (harness probe)
Where: `api/contact.js:169-171,309,346,379`, `api/upload.js:203-205`, `api/registrations.js:358-365`, `api/_shared/provider-errors.js:16-28`
Evidence: local `try/catch → handleError(...,500,req)` passes no `startedAt`; `withApiHandler` logs again → probe `STATUS 500 LINES ["api.error","api.request_failed"]`, breaking the "exactly one line" invariant (`middleware.js:113-117`). Sentry used three ways: awaited in `handleError`, `waitUntil` in `reportProviderError`, fire-and-forget at `registrations.js:363` (lost per `sentry.js:3-8`).
Impact: 500s double-counted; "spam filter silently off" may never reach Sentry.
Fix: remove local envelopes; route `:363` through `reportProviderError` (= PLAT-7). · Test: extend `observability.test.mjs:133` to contact/upload with a throwing DB.
Dependencies: DOC-2, OBS-4

### MAINT-3 Creation endpoints skip the per-resource mapper — two wire shapes per resource and a public deny-list
Area: MAINT · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `api/contact.js:124-168` (`RETURNING *` raw), `api/upload.js:185-199` (`document: newDocument[0]`), `api/registrations.js:612-614` (`{cancel_token, ...rest}`), `api/documents.js:50-60` (no `mapDocument`)
Evidence: contact message camelCase via `mapContactMessage` for council, raw snake_case on public POST; document list hides `uploaded_by` (`documents.js:47-49`) but upload response returns raw row incl. `uploaded_by`, `public_id`; client reads both shapes (`RichTextEditor.tsx:262` `data.fileUrl || data.document?.cloudinary_url`); public signup returns raw row minus one named column.
Impact: any column later added to `event_registrations` is published to anonymous callers by default; contracts drift per endpoint.
Fix: allow-list `mapPublicRegistration`, `mapDocument`; return mapped shapes. · Test: snapshot 201 bodies. (Same root cause as TRACE-7.)

### MAINT-4 Dead or disconnected code
Area: MAINT · Severity: Low · Confidence: CONFIRMED · Verified: static (grep api, shared, client, scripts, tests)
Evidence: `delivery.js:4` `DELIVERY_LEASE_MINUTES` never read; lease hard-coded `INTERVAL '10 minutes'` 3× (`event-reminders.js:256,603,614`). `turnstile.js:44` `isTurnstileEnabled` no callers. `shared/media.js:92` `MEDIA_ERROR_CODES` unreferenced; no test pins media.js refuse codes to it (SIGNUP_ERROR_CODES has one). `registrations.js` 17 bilingual `error` strings the client never shows (maps `code`, `event-registration-modal.tsx:139`).
Fix: interpolate or delete constant; delete unused fn; test pinning media codes; one English fallback server text.

### MAINT-5 Signup branch and transactional mail are inline, untestable blocks
Area: MAINT · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `registrations.js:281-616` (~335-line POST branch), `:661-767` (mail by string concat), `contact.js:173-200`, `secure-settings.js:686-705`
Evidence: repo pattern elsewhere is `events.js:228 validateEventBody` + pure template modules (`contact-emails.js`, `newsletter.js`) tested in `emails.test.mjs`; the most-sent public mail has no content test; date formatting differs (`toLocaleDateString` without timezone `:678,730` vs `osloTimestamp`).
Proposed: `validateSignupBody` + `_shared/registration-emails.js` → unit tests for cancel link, slots, both languages, Invalid Date; handler ~40% smaller.
Dependencies: TEST-3

## Tests

### TEST-1 secure-settings mutations are only tested for authorization
Area: TEST · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `secure-settings.js` board-members CRUD (:187-262), blog-posts (:340-420), kindergarten-info PUT (:450-492), contact-messages PUT/POST/DELETE (:519-633), users DELETE (:715-724), newsletter-subscribers DELETE (:753-764)
Evidence: 6 tests (reads, ids, homepage filter, user-create race) + authz matrix. Unprotected: users DELETE only removes member/staff (`AND role IN …`); contact reply sends mail before marking responded, mail failure → 502 (:589-611); reply to anonymous inquiry → 400 (:573); blog `notify_newsletter` COALESCE three-state (:388) and `sanitizeHtml`.
Impact: dropping the role filter (admin deletes admin) or reordering reply/update passes CI.
Fix: harness cases for each.

### TEST-2 Integration gate cannot catch an incomplete migration on a base table
Area: TEST · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `tests/integration/postgres-fixture.mjs:89-104`
Evidence: fixture creates every table no migration creates (events, event_registrations, users, blog_posts, …) from current `schema.ts`, then replays migrations → every `ADD COLUMN IF NOT EXISTS` is a no-op in CI (incl. 0020 `events.potluck`). Production receives only SQL files (`DEPLOYMENT.md:70-72`); no test diffs migrated schema vs declaration. No current drift found by grep.
Impact: a forgotten column or a schema.ts change without a migration passes both CI jobs, then fails the deploy.
Fix: frozen pre-0001 baseline → migrate → diff `information_schema.columns` against `generateDrizzleJson(schema)`.

### TEST-3 Council registration paths and confirmation mail only have source-text guards
Area: TEST · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `registrations.js:228-270` (council list), `:617-651` (council DELETE), `:661-767` (mail); `auth.js ?action=csrf`; `documents.js:15-37 ?action=download`
Evidence: covered by source regex (`registration-cancel.test.mjs:159,180,186`, `registration-integrity.test.mjs:42`); behavioural only fractional-id (`registrations-handler.test.mjs:200`) and "comment not echoed" (:135).
Fix: harness cases (easiest after MAINT-5).

## Observability

### OBS-1 Request ids mangled by phone-number redaction in logs
Area: OBS · Severity: Medium · Confidence: HIGH (code CONFIRMED; `x-vercel-id` format from Vercel docs) · Verified: unit
Where: `api/_shared/log.js:58-64` (`scrub` → `redactSensitiveText` on every string), `redact.js:9`
Evidence: `arn1::iad1::5wq9b-1759912345678-2c4e6a8b0d1f` logged as `…5wq9b-[redacted-phone]c4e6a8b0d1f`; `X-Request-Id` header carries the raw id. ISO dates redacted likewise (`logCronRun` works around it, :738-740). Fixture `'arn1:iad1:abc123'` (`observability.test.mjs:18`) has no digit run.
Impact: "joinable with Vercel's id" design fails; a parent's quoted id cannot be found.
Fix: pass requestId/path/method/action/resource/numeric ids through a strict charset check instead of text redaction; realistic fixture.

### OBS-2 Audit trail records who acted but not on what; lives only in platform logs
Area: OBS · Severity: Medium · Confidence: CONFIRMED (retention UNVERIFIED) · Verified: static
Where: `log.js:98-107` (`requestFields`), `middleware.js:123-131`
Evidence: `api.mutation` logs actor, role, path, action/resource — not target id (`req.query.id`) or created id. No audit table, no documented log drain (`DEPLOYMENT.md:159` relies on Vercel logs).
Impact: cannot answer "which subscriber/user was deleted, which post archived".
Fix: `targetId` in `requestFields`, creates stash new id; document a log drain or `audit_log` table for admin resources.

### OBS-3 DB outage or bad SESSION_SECRET answered as 401 "logged out", with no error event
Area: OBS · Severity: Medium · Confidence: CONFIRMED · Verified: unit (harness probe) + lead read of `middleware.js:309-344`
Where: `api/_shared/middleware.js:309-344` (one try around `getJwtConfig`, `jwt.verify` and the users SELECT; catch returns null)
Evidence: probe — identity SELECT throws "Connection terminated" → `401 Unauthorized`; logs: unstructured "Token validation error" + warn-level `api.request_failed`; no `api.error`, no Sentry. Config error from `jwt-config.js:11` swallowed the same way; client clears auth cache on 401.
Impact: during a Neon incident every council member appears logged out; 5xx alerting misses it. (On public endpoints that use `parseAuthToken`, e.g. registrations GET, it silently downgrades to the anonymous response — see TRACE-2.)
Fix: narrow the try to `jwt.verify`; let DB/config errors reach `withApiHandler`. · Test: api-security with a throwing `sqlClient` expects rejection.

### OBS-4 Error events carry no request context or release; users never see the request id
Area: OBS · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `sentry.js:26-53`, `client/src/main.tsx:17-26`, `provider-errors.js:16-18`
Evidence: backend events no tags (requestId, route, resource), no release; frontend no release; nothing in `client/src` reads `X-Request-Id` though `middleware.js:103` says a parent can quote one id; `reportProviderError` logs a multi-line object without request id.
Fix: `requestFields` as tags, release from `VERCEL_GIT_COMMIT_SHA`, show the id in error UI, provider errors through `logEvent`.

### OBS-5 Non-mail cron failures never reach the one configured alert
Area: OBS · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `event-reminders.js:674-678`, `:719-729` (`mailProblems` keys), `:701-709`; `DEPLOYMENT.md:146-154`
Evidence: `mediaPurgeFailed` excluded from alert keys → failing purge = info-level `cron.run`, no Sentry. A failing stage throws `AggregateError` with a generic message and no `cron.run` line at all, though docs say every run writes one.
Impact: expired private media of children can persist in R2 with nobody alerted.
Fix: add purge count to alert keys; always log `cron.run` with `stagesFailed` before rethrowing.

## Documentation

### DOC-1 Wrong function counts; media routing missing from the architecture doc
Area: DOC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `docs/architecture.md:8` "eight" handlers; `DEPLOYMENT.md:8` "nine functions"; actual 9 handlers + cron = 10 (`AGENTS.md:69` correct). `architecture.md:27-35` routing list omits `media?action=…`. `log.js:6` says "four handlers multiplex"; six do.

### DOC-2 AGENTS.md says "throw with a status", but the status is never honoured
Area: DOC · Severity: Medium · Confidence: CONFIRMED · Verified: static (lead re-read `middleware.js:135`)
Where: `AGENTS.md:65,222` vs `middleware.js:135` (`handleError(res, error, 500, …)`; `error.status` never read). Every 4xx in the code is written directly with `res.status()`.
Impact: an agent following the doc turns an intended 400 into a 500 + Sentry event.
Fix: document the real convention (write 4xx with `{error, code}`; throw only on unexpected failures) or make `handleError` honour statuses < 500.

### DOC-3 AGENTS.md says `api_rate_limits` is the only timestamptz table
Area: DOC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `AGENTS.md:217-218`; also timestamptz: `newsletter_deliveries` (5 cols), `event_registrations.reminder_claimed_at`, `event_registration_cancellations.cancelled_at`, `photo_event_slots.created_at` (`schema.ts:58,84,97,154-159`); cron correctly uses `NOW()` there.
Impact: an agent applying "never NOW()" could break lease arithmetic.

### DOC-4 README is stale
Area: DOC · Severity: Low · Confidence: CONFIRMED · Verified: static
Evidence: env list 6 vars vs ~20 (missing CRON_SECRET, GMAIL_*, PUBLIC_BASE_URL, R2_*, TURNSTILE_*, Sentry); says schema managed through Drizzle (contradicts hand-applied migrations); "session-based" auth (JWT) and "CSRF via SameSite" (double-submit); `npm install` vs `npm ci`.

### DOC-5 Privacy page omits newsletter data, private media sharing and telemetry processors
Area: DOC · Severity: Medium · Confidence: CONFIRMED (legal adequacy = Ambiguity) · Verified: static
Where: `client/src/pages/privacy.tsx:15-110` (last changed 2026-09-24; media sharing, migration 0019, landed 2026-09-28)
Evidence: no newsletter subscriber data or 90-day delivery records; no R2 storage of children's photos/videos (≤365 days) — Cloudflare named only for Turnstile; Sentry and Vercel Analytics not listed; cookie section omits csrf-token and login-device cookies and localStorage theme/calendar filter.

## Accessibility (WCAG 2.2 AA)

### A11Y-1 Photo-day child-name inputs labelled only by placeholder; errors only in a toast
Area: A11Y · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `event-registration-modal.tsx:349-361`, `:170-180`
Evidence: no id/Label/aria-label; heading is a `<p>` not a legend; missing name → toast only, no `aria-invalid`. Sibling "other attendees" fieldset (`:366-386`) is correct. Fails 1.3.1, 3.3.2, 4.1.2 on a core public flow.
Fix: reuse that fieldset/legend/Label pattern; error with `role="alert"`.

### A11Y-2 Hard-coded Norwegian labels on the public signup form
Area: A11Y · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `event-registration-modal.tsx:279,280,292,306,431,435` ("Fullt navn *", "Ditt navn", "E-post *", "Telefon", "Kommentarer", comment placeholder); `privacy.tsx` keeps its own copy dictionary outside `i18n.ts`.
Evidence: i18n ratchet counts only `language === 'no' ? …` ternaries, not bare literals → in English (`lang="en"`) accessible names are Norwegian (3.1.2) and the i18n contract breaks.
Fix: move strings to `i18n.ts`; optionally extend the ratchet to JSX label literals.

### A11Y-3 Identity and credential fields lack autocomplete purposes
Area: A11Y · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `login-modal.tsx:72-91`, `password-change-modal.tsx:72-100`, signup `event-registration-modal.tsx:280,294,308`, `newsletter-signup.tsx:91-110`, email field in `staff-users-section.tsx`. `contact.tsx:287,303,320` does it correctly. Fails 1.3.5; weakens password managers (3.3.8).

### A11Y-4 Several forms show errors only in a short-lived single-slot toast
Area: A11Y · Severity: Medium · Confidence: POSSIBLE (needs runtime + screen reader) · Verified: static
Where: `password-change-modal.tsx:20-46`, `login-modal.tsx:44-49`, `yearly-calendar-entry-modal.tsx:183-209,270` (save disabled while title empty, no reason shown), `settings.tsx`, `content.tsx`; `use-toast.ts:8` (`TOAST_LIMIT = 1`)
Evidence: no `FormField` → no `aria-invalid`/described-by; Radix toast closes after ~5 s, a second replaces the first; raw server text can appear (TRACE-1). Criteria 3.3.1, 3.3.3, possibly 2.2.1.
Fix: inline `role="alert"` messages tied to the field, as `share-page.tsx:207-224` does.

### A11Y-5 Icon-only mobile post-actions button has no name
Area: A11Y · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `content.tsx:506-509` — the only unnamed button in a scan of all non-ui buttons; `client-invariants.test.mjs:80` checks only the files it names.

### A11Y-6 Raw Tailwind colours bypass the contrast-checked tokens
Area: A11Y · Severity: Low · Confidence: HIGH (oklch→sRGB approximate) · Verified: static
Evidence: `content.tsx:554` "(arkivert)" `text-xs text-orange-600` ≈3.6:1 on white, ≈4.4:1 on dark surface (no dark variant). 127 raw palette utilities + 25 `dark:` variants outside `components/ui`, against the AGENTS token rule. `yearly-calendar-import-modal.tsx:487` SelectTrigger `h-9` (36px) — below the project 44px rule, meets WCAG 24px.

### A11Y-7 Month-grid chips show cancellation and category visually only
Area: A11Y · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `calendar-view.tsx:436-460` — cancellation as strike-through, category as an aria-hidden dot; day panel and list show a StatusPill (`:553-559`). 1.3.1. Fix: sr-only "cancelled" + category label in the chip.

### A11Y-8 One latent light-theme token pair below 4.5:1
Area: A11Y · Severity: Low · Confidence: CONFIRMED (computed) · Verified: static
Evidence: `--color-subtle`/`--color-text-muted` on `--color-peach` = 4.39:1; PageHero eyebrow uses `text-subtle` (`page-hero.tsx:124`); three pages use the peach tone, none passes an eyebrow today. Category dots on own tints 2.68/2.83 but always beside a label. Every dark-theme text token ≥4.5:1 on every surface.

## Blocked/unverified
- Integration suite not run (needs PostgreSQL) → TEST-2 reasoned from fixture code.
- Vercel log retention and real `x-vercel-id` format from public docs, not observed. Sentry ingestion not checkable offline.
- Runtime/AT a11y not done: toast/dialog announcements, focus return/order, 320px reflow, 200% zoom, focus not obscured under sticky header (2.4.11), real target sizes.
- No frontend component tests beyond invariant guards.

## Positive findings
- Authorization matrix covers every protected route × role + missing CSRF; media suite and cron tests (stage isolation, deadlines, mail alert) thorough.
- Integration job replays real migrations with concurrent psql sessions; migrations and schema.ts columns currently agree.
- Backend type gate fails hard on undefined identifiers.
- Logs never contain query strings, are redacted and length-capped; every mutation or non-2xx gets a line (apart from MAINT-2's double line).
- All dialogs Radix with `DialogTitle`; skip link; `<html lang>` follows language; button tokens give 44px targets; month-grid cells `min-h-11` with sr-only dates; share-page PIN form wired with `role="alert"` + `aria-invalid`/`aria-describedby`; token contrast departures documented.
- `migrations/README.md` gives a verification query per migration.

## Ambiguities
- Whether the privacy notice must list processors and media sharing (DOC-5) — legal decision.
- 44px touch target is the project's own standard; WCAG AA needs 24px.
- Whether server refusal text is kept deliberately for non-browser clients — not stated.
- Function budget (10 of 12) and multiplexing: no demonstrated harm, not flagged; `secure-settings.js` dispatches cleanly despite 804 lines.
- Source-text guard tests are a deliberate convention; TEST-3 asks only for behavioural cases where the harness can run.
