# Review Tasks

These tasks come from [`REPO_REVIEW.md`](REPO_REVIEW.md) (commit `041e0cf`). There is one task per finding or systemic root cause, ordered by priority. Full evidence for each is in `.review/findings-*.md`.

General verification for every task: `npm run check`, the named suite, then `npm test`; add `npm run build` for `client/` changes (see AGENTS.md "Validation ladder").

---

## P1

## [x] SEC-001 — Make the PIN and account-wide failure lockouts atomic
> **Done.** Attempts are reserved with `checkRateLimit` before bcrypt and handed back with the new `releaseRateLimit` (media: correct PIN; share-lock refusal returns the IP attempt) or cleared on login success; `peekRateLimit` removed. Concurrent-burst tests added to `media-handler` and `auth-handler` (they fail on the old code).

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed (independently reproduced) · **Effort:** S · **Area:** Security / Authentication (brute force)

### Files
- `api/media.js` (`handleView`, ~:189-215)
- `api/auth.js` (`handleLogin`, ~:151-183)
- `api/_shared/rate-limit.js` (`peekRateLimit` :75-88, `checkRateLimit` :46-73)
- `tests/media-handler.test.mjs`, `tests/auth-handler.test.mjs`, `tests/rate-limit.test.mjs`

### Problem
Both failure lockouts work in three steps: the counter is read with `peekRateLimit` (a SELECT), bcrypt runs, and only after a wrong answer is the failure recorded with `checkRateLimit`. Requests sent at the same time all read the count from before any of them failed, so every one of them gets evaluated.

For media shares, the only atomic bound is `VIEW_LIMIT`, 120 per IP per 10 min. A 4-digit PIN protecting the children's photos and video can therefore be exhausted in about 14 h from one IP. For login, the account-wide cap of 20 per hour can be exceeded with many IPs.

### Evidence
`.review/04-verification.md` records a verifier run against the real handler:

| Scenario | Wrong PINs evaluated | Locked out | Intended limit |
|---|---|---|---|
| Media share, 150 concurrent from one IP | 120 | 30 (by `VIEW_LIMIT`, not the PIN limit) | 5 per IP, 30 per share |
| Media share, 10 IPs × 120 concurrent | 1,200 | 0 | 30 per share |
| Login account-wide lock, 100 concurrent | 100 | 0 | 20 per hour |

### Required change
Reserve the attempt atomically **before** the bcrypt call:
1. Increment the per-IP and per-share keys (login: the `accountFailureKey`) with `checkRateLimit` and refuse if the limit is exceeded.
2. On a correct PIN, clear the IP key as today; on a correct password, keep the current behaviour.
3. Alternatively, use a single conditional `UPDATE … SET count = count + 1 WHERE count < $limit RETURNING`.

Remove `peekRateLimit` if it has no callers left. Correct the "about a year" comment at `media.js:94-96`.

### Acceptance criteria
- [ ] N concurrent wrong PINs from one IP let at most `PIN_IP_MAX_FAILURES` requests reach `verifyPin`.
- [ ] N concurrent wrong passwords across many IPs let at most the account cap reach bcrypt (unless known-device).
- [ ] A correct PIN after 4 typos still opens the share; existing lockout tests pass.

### Verification
`node --test --experimental-test-module-mocks tests/media-handler.test.mjs tests/auth-handler.test.mjs`. Add a concurrent-burst case using a stateful in-memory counter, as in the verifier's `race.test.mjs`. Add an integration case in `tests/integration/database.test.mjs` with parallel psql sessions.

### Dependencies
None.

### Related findings
SEC-002, SEC-004, SEC-010

## [x] SEC-002 — Add a cumulative per-share PIN failure cap, raise the PIN minimum, and stop share-wide lockout of legitimate viewers
> **Done, narrowed scope.** New shares need a 6–8 digit PIN (`MEDIA_NEW_PIN_PATTERN`); viewing still accepts 4–8 so existing shares keep working until they expire. With SEC-001 this bounds a guesser to ~1% of the PIN space over the 365-day maximum. **Deferred:** the cumulative cap (needs a migration and an admin "set new PIN" action that does not exist) and exempting grant holders from the share lock (grants last 12 h, so returning parents rarely hold one). The share-wide lock remains the accepted trade-off of a shared PIN.

**Priority:** P1 · **Severity:** Medium · **Confidence:** Confirmed (verified, with corrections) · **Effort:** M · **Area:** Security / Authentication

### Files
- `api/media.js` (:97-100, :192-215, :288-292)
- `shared/media.js` (`MEDIA_PIN_PATTERN` :89, lifetimes :77-80)
- `client/src/pages/media-shares.tsx` (PIN input)
- new migration `migrations/0021_*.sql` + `shared/schema.ts` (`media_shares.pin_failures`)
- `docs/mediedeling.md`, `client/src/lib/i18n.ts`

### Problem
Even guessing one PIN at a time, the per-share limit allows 30 failures per fixed 24 h window. The window resets daily and a correct PIN never clears it. PINs may be 4 digits and are chosen by an admin. Over the default 90-day lifetime that is 2,700 guesses, about 27% of a uniform 4-digit space; over 365 days it is the whole space. One IP is enough, since 5 failures per 15 min reaches 30 per day in about 75 min.

The same 30 failures also lock out every parent without a view grant for 24 h, and a link holder can repeat that every day.

### Evidence
`.review/findings-sec-platform.md` PLAT-1 and `.review/04-verification.md`. The lockout of legitimate viewers is already exercised by `tests/media-handler.test.mjs:184-191`.

### Required change
1. Keep a cumulative failure counter on the share. Once it passes a threshold (e.g. 100), refuse with a coded error until an admin sets a new PIN or revokes the share.
2. Require at least 6 digits for new or changed PINs. Existing shares stay valid; flag them in the admin list.
3. Apply the share-wide daily lock only to requests without a valid view grant, and consider exponential backoff instead of a hard 24 h lock.
4. Update `docs/mediedeling.md` and add i18n strings.

### Acceptance criteria
- [ ] Creating a share with a 4-digit PIN is refused with a coded error and a translated message.
- [ ] After the cumulative cap is reached, a correct PIN is refused until an admin resets the PIN.
- [ ] A viewer holding a valid grant is unaffected by the share-wide lock.

### Verification
`tests/media-handler.test.mjs` cases for each criterion, plus `npm run check` (i18n).

### Dependencies
SEC-001 (atomic reserve). Migration per `migrations/README.md`.

### Related findings
SEC-001

## [x] TRACE-001 — Stop the council attendee view crashing the app when the session has lapsed
> **Done, different server fix.** The `jwt` cookie expires with the JWT, so a lapsed session arrives with no cookie and cannot be told apart from a visitor; "401 when a token is presented" would not have helped. Council pages now ask for `?eventId=…&view=council`, which requires a council session (401 → sign-in prompt); plain `?eventId=` still returns `{count}`. Both components also guard with `Array.isArray`. Covered by the authorization matrix, `read-error-ui` and a `client-invariants` guard.

**Priority:** P1 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Traceability / Contract

### Files
- `api/registrations.js` (:228-278)
- `client/src/components/event-registrations-view.tsx` (:35, :137)
- `client/src/components/attendee-tooltip.tsx` (:27, :43)
- `tests/registrations-handler.test.mjs`

### Problem
`GET /api/registrations?eventId=` returns `200 {count}` whenever `parseAuthToken` yields no council user: an expired JWT, a revoked session, a pending password change, or a DB error (OBS-001). The council components type that key as `EventRegistration[]` and call `.reduce` / `.filter` on it. The TypeError reaches the only error boundary (`client/src/main.tsx:36`) and blanks the whole site. Because the status is 200, the 401 re-login path never runs.

### Evidence
`TRACEABILITY_MATRIX.md` F-05 and `.review/04-verification.md` (lead spot-check).

### Required change
- **Server:** if a session cookie or Bearer token is *presented* but invalid or expired, answer 401. Keep `{count}` only for requests with no credentials. Alternatively, have council callers use an explicit `?view=council` guarded by `requireRole`.
- **Client:** guard with `Array.isArray(data)`.

### Acceptance criteria
- [ ] Expired JWT plus `?eventId=` → 401, with no `{count}` body.
- [ ] Anonymous request → `200 {count}`, as today.
- [ ] The view renders `QueryNotice` or the login prompt instead of throwing when given a non-array.

### Verification
Handler-harness case with an expired token; `npm run check`; `npm run build`.

### Dependencies
None. Pairs with OBS-001.

### Related findings
OBS-001, TEST-003

---

## P2

## [x] SEC-003 — Stop echoing submitter-chosen text in mail to unverified addresses
> **Done.** Names are kept, as asked, but pass through the new `nameForMail` (letters, marks, spaces, `-` and `'` only — no dots, slashes, digits or line breaks), in both the signup confirmation (parent and child names) and the contact receipt.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (verified) · **Effort:** S · **Area:** Security / Abuse

### Files
- `api/registrations.js` (`sendEventConfirmationEmail` :661-767)
- `api/_shared/contact-emails.js` (:48-98)
- `tests/emails.test.mjs`

### Problem
Signup confirmations and contact receipts go to an unverified address and include the submitted `name`, and on photo days up to 10 child names. `sanitizeText` keeps URLs and newlines. An anonymous attacker can therefore make FAU's Gmail deliver "VIKTIG: https://evil.example/…" to anyone, with valid SPF and DKIM. That endangers the sending account. The comment at `contact-emails.js:48-51` claims no attacker text is included.

### Evidence
`.review/04-verification.md` (Phase-4 verifier).

### Required change
Drop the name from the greeting, or restrict it to letters, spaces and `-'.` with no URL or newline. Never echo child names in mail; refer to slots by time only. Fix the comment.

### Acceptance criteria
- [ ] A name containing `https://` or a newline does not appear in either mail body.
- [ ] Photo-day confirmation lists slot times without child names.

### Verification
`node --test tests/emails.test.mjs` plus new cases.

### Dependencies
Easier after MAINT-005 (extracting the mail templates).

### Related findings
SEC-006, MAINT-005

## [x] SEC-006 — Make the public-mail daily cap fair and never lose the only cancel link
> **Done.** Signup confirmations may use the whole 200/day; every other kind shares a 100/day pool, contact receipts at most 40 of it. The first refusal of the day is reported. A signup whose mail cannot go out answers `confirmationEmail:false` + `cancelUrl`, and the form shows that link until closed.

**Priority:** P2 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Security / Availability

### Files
- `api/_shared/rate-limit.js` (:102-117)
- `api/registrations.js` (:595-616)
- `api/contact.js` (:135, :154, :300)
- `client/src/components/event-registration-modal.tsx`

### Problem
All public forms share one 200-per-day mail budget, and a contact submission costs 2. A mail over the cap is only logged, while the request still succeeds. About 70 contact posts exhaust the budget, after which every signup confirmation that day is dropped. That mail carried the only cancel token.

### Evidence
`.review/findings-sec-input.md` INPUT-6.

### Required change
Use per-kind budgets: reserve signup confirmations and drop contact acknowledgements first. When the confirmation is not sent, return a flag so the client can show the cancel link once on screen. Alert on `mail.public_daily_cap_reached`.

### Acceptance criteria
- [ ] Exhausting the contact budget does not block signup confirmations.
- [ ] A signup whose mail was suppressed returns `confirmationSent:false`, and the UI shows the cancel link.

### Verification
`tests/contact-handler.test.mjs`, `tests/registrations-handler.test.mjs`, `tests/rate-limit.test.mjs`.

### Dependencies
None.

### Related findings
SEC-003

## [x] SEC-005 — Strip `createdBy` and internal flags from the public yearly-calendar response
> **Done.** `createdBy` is dropped from the public GET. The newsletter flags stay: they hold no personal data, and the entry editor seeds its form from this response, so removing them would silently untick "notify" on save.

**Priority:** P2 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Privacy

### Files
- `api/yearly-calendar.js` (:45-77, :183-207)
- `tests/yearly-calendar-handler.test.mjs`

### Problem
Anonymous `GET /api/yearly-calendar` returns `createdBy`, the editor's name or, when the name is empty, their login e-mail, for staff and council. `notifyNewsletter` and `newsletterSentAt` are also returned. No client renders these fields.

### Evidence
`.review/findings-sec-authz.md` AUTHZ-3.

### Required change
Add a public projection, like `publicBlogPost`, for callers that are not editors. Apply the same projection to the internal flags in the `api/events.js` public GET.

### Acceptance criteria
- [ ] An anonymous GET has no `createdBy`, `notifyNewsletter` or `newsletterSentAt`; an editor GET still has them.

### Verification
New handler case.

### Dependencies
None.

### Related findings
MAINT-003

## [x] TRACE-002 — Make privacy retention robust to non-ISO legacy dates
> **Done.** Retention compares text to ISO cutoffs (no casts) and skips rows that do not start with a date, counting them as `unparseableDates`. Verified against a local PostgreSQL 16: the old statements fail with `invalid input syntax … "ukjent"`, the new ones pass.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Possible · **Effort:** S · **Area:** Correctness / Data retention

### Files
- `api/cron/event-reminders.js` (`cleanupPrivacyRetention` :529-552)
- `tests/integration/database.test.mjs`

### Problem
`created_at::timestamptz` and `e.date::date` cast text columns. A single unparsable legacy value makes the DELETE fail. The comment at `events.js:192-196` mentions that values like "neste fredag" and 2026-02-31 were stored historically. The stage is isolated, so GDPR deletion of registrations, cancellations and contact messages would then stop every day, with only a log line to show it.

### Evidence
`.review/findings-trace.md` TRACE-3.

### Required change
First run a check query in production:

```sql
SELECT id, date FROM events WHERE date !~ '^\d{4}-\d{2}-\d{2}$' OR to_date(date,'YYYY-MM-DD')::text <> date;
SELECT id, created_at FROM contact_messages WHERE created_at !~ '^\d{4}-';
```

Repair any rows it finds. Then guard the casts with a regex, or compare against an ISO text cutoff as `events.js:80` does.

### Acceptance criteria
- [ ] A bad-date row does not stop the deletion of other rows.
- [ ] The check query result is recorded in the PR.

### Verification
An integration case with a bad-date row; `tests/event-reminders.test.mjs`.

### Dependencies
None.

### Related findings
DB-001, OBS-005

## [x] DB-001 — Bring `shared/schema.ts` in line with the migrations (or retire `db:push`)
> **Done.** `schema.ts` now declares the unique `(event_id, lower(email))` index, the 0010 partial index, every migration-only CHECK (newsletter_deliveries, photo_event_slots, yearly_calendar_entries, media_*) and the PostgreSQL-default unique names (`*_key`). `registered_at` gets an ISO default via new migration `0021_registration_iso_registered_at.sql`, which also rewrites rows still in `NOW()::text` form. `npm run db:push` is removed; DEPLOYMENT.md says how to build a fresh database instead.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Possible · **Effort:** M · **Area:** Database / Schema drift

### Files
- `shared/schema.ts` (:43-69 and the index declarations)
- `migrations/0001_production_hardening.sql` (:8, :14)
- new migration
- `package.json` (`db:push`)
- `docs/database-testing.md`, `migrations/README.md`

### Problem
`schema.ts` drifts from the migrations in four ways:
- It does not declare the unique `(event_id, lower(email))` index, which is what makes signup's `ON CONFLICT DO NOTHING` reject concurrent duplicates.
- It declares indexes that no migration creates.
- `registered_at DEFAULT NOW()::text` stores non-ISO text in production, while CI produces NULL.
- CHECK constraints and the 0010 partial index exist only in migrations.

The documented `npm run db:push` would plausibly drop the unique index, after which concurrent duplicate signups double-count capacity.

### Evidence
`.review/findings-trace.md` TRACE-4 and `.review/findings-perf.md` (Ambiguities).

### Required change
Declare the functional unique index and the CHECKs in `schema.ts` using `uniqueIndex().on(sql\`lower(email)\`)` and `check()`. Change the `registered_at` default to an ISO default or a handler-supplied value, with a backfill migration. Either reconcile the declared-only indexes or remove `db:push` and document that migrations are the only path.

### Acceptance criteria
- [ ] `drizzle-kit push --dry-run` (or `generate`) against a migrated DB proposes no drops.
- [ ] `registered_at` is ISO in new rows in both CI and production.

### Verification
`npm run test:integration` in CI, plus TEST-002's schema diff.

### Dependencies
TEST-002.

### Related findings
TEST-002, TRACE-002

## [x] TRACE-003 — Give user-reachable refusals a `code` and translate them in the client
> **Done.** `API_ERROR_CODES` (27 codes) in `shared/constants.js`, translated in `t.apiErrors` (tsc enforces both languages). Every listed toast now goes through `apiErrorText(error, t, fallback)`; `getApiErrorMessage` is gone. Guards: no page renders `error.message` (client-invariants), and handler codes ⇄ client lists agree (backend-invariants). Not covered: the yearly-calendar import's per-row validation report, which already maps its Norwegian messages itself.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Traceability / i18n contract

### Files
- `client/src/lib/queryClient.ts` (:15)
- 15 callers listed in `.review/findings-trace.md` TRACE-1
- `api/auth.js`, `api/contact.js`, `api/events.js`, `api/upload.js`, `api/secure-settings.js`, `api/yearly-calendar.js`
- `client/src/lib/i18n.ts`

### Problem
Most mutation toasts render `error.message`, the server's fixed English text (Norwegian-only in places). A Norwegian parent sees "Invalid credentials" or "Too many messages. Try again later." This contradicts AGENTS.md: "keys off the body's `code` … never matches the `error` text".

### Evidence
`.review/findings-trace.md` TRACE-1.

### Required change
Define codes for login, rate limits, validation and conflicts (in `shared/constants.js`, as is done for `SIGNUP_ERROR_CODES`). Map them to `t.*`, and fall back to a generic translated message, never the raw text.

### Acceptance criteria
- [ ] No caller renders `error.message` from a server body.
- [ ] Each new code has `no` and `en` strings.
- [ ] Handler suites assert the codes.

### Verification
`npm run check` (i18n ratchet), handler suites, and a `client-invariants` guard against `error.message ||` in toasts.

### Dependencies
None.

### Related findings
A11Y-004, DOC-002

## [x] OBS-001 — Don't report DB or config failures as "logged out"
> **Done.** Only `jwt.verify` failures return null; config and DB errors propagate to `withApiHandler` (500 + report).

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Observability / Reliability

### Files
- `api/_shared/middleware.js` (`parseAuthToken` :309-344)
- `tests/api-security.test.mjs`

### Problem
One `try` covers `getJwtConfig()`, `jwt.verify` and the users SELECT, and its `catch` returns `null`. During a Neon outage, or with a bad `SESSION_SECRET`, every council request gets 401. The client then clears its auth cache, and no `api.error` or Sentry event is raised. Public endpoints silently downgrade to the anonymous response (see TRACE-001).

### Evidence
`.review/findings-quality.md` OBS-3 (harness probe) and a lead read of the code.

### Required change
Wrap only `jwt.verify` (token errors → `null`). Let DB and config errors propagate to `withApiHandler`, which returns 500 and reports them.

### Acceptance criteria
- [ ] A throwing `sqlClient` causes `parseAuthToken` to reject, and the handler returns 500 with `api.error` logged.
- [ ] Expired and invalid tokens still return 401.

### Verification
`node --test --experimental-test-module-mocks tests/api-security.test.mjs tests/auth-handler.test.mjs`.

### Dependencies
None.

### Related findings
TRACE-001

## [x] OBS-002 — Keep request ids intact in logs
> **Done.** `requestId`, `method`, `path`, `action`, `resource`, `role` (and cron `task`/`targetDate`/`stage`) keep their value when id-shaped; anything else is still redacted.

**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** S · **Area:** Observability

### Files
- `api/_shared/log.js` (:56-73, :98-107)
- `api/_shared/redact.js` (:9)
- `tests/observability.test.mjs` (:18)

### Problem
`scrub` runs phone-number redaction on every string. A realistic `x-vercel-id` such as `arn1::iad1::5wq9b-1759912345678-…` is therefore logged with `[redacted-phone]` in the middle, while the `X-Request-Id` header carries the raw id. A parent's quoted id cannot be matched to a log line.

### Evidence
`.review/findings-quality.md` OBS-1.

### Required change
Pass structural fields (requestId, method, path, action, resource, numeric ids, ISO timestamps) through a strict charset allow-list instead of free-text redaction. Use a realistic fixture in the test.

### Acceptance criteria
- [ ] The logged `requestId` equals the header value for a realistic Vercel id.
- [ ] Free-text fields are still redacted.

### Verification
`node --test --experimental-test-module-mocks tests/observability.test.mjs tests/telemetry-privacy.test.mjs`.

### Dependencies
None.

### Related findings
OBS-004

## [x] OBS-005 — Alert on media-purge and stage failures in the cron
> **Done.** `mediaPurgeFailed` / `unparseableDates` raise "Housekeeping problems in the reminders run"; a failing stage still writes `cron.run` with `stagesFailed`. Docs say how to alert on it.

**Priority:** P2 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Observability / Privacy

### Files
- `api/cron/event-reminders.js` (:674-729, :701-709)
- `docs/DEPLOYMENT.md` (:146-154)
- `tests/event-reminders.test.mjs`

### Problem
`mediaPurgeFailed` is not among the `mailProblems` alert keys. A failing stage throws an `AggregateError` without writing the `cron.run` line the docs promise. Expired private media of children can stay in R2 with nobody alerted.

### Evidence
`.review/findings-quality.md` OBS-5.

### Required change
Include purge failures in the alerting set. Always log `cron.run` with `stagesFailed` before rethrowing.

### Acceptance criteria
- [ ] A purge failure produces an error-level event.
- [ ] A failing stage still writes `cron.run`.

### Verification
Event-reminders suite.

### Dependencies
None.

### Related findings
TRACE-002

## [x] MAINT-002 — One error-handling convention: no local 500 envelopes, provider errors via `reportProviderError`
> **Done.** Local envelopes removed from contact.js/upload.js; the blacklist path uses `reportProviderError`; a `backend-invariants` guard rejects un-awaited captures.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability / Observability

### Files
- `api/contact.js` (:169-171, :309, :346, :379)
- `api/upload.js` (:203-205)
- `api/registrations.js` (:358-365)
- `tests/observability.test.mjs` (:133)

### Problem
Local `try/catch → handleError(…,500,req)` blocks make every 500 log twice (`api.error` and `api.request_failed`). The blacklist-check failure path logs `blacklistError.message` unredacted and calls `Sentry.captureException` un-awaited, which Vercel drops (`sentry.js:3-8`).

### Evidence
`.review/findings-quality.md` MAINT-2 (probe) and `.review/findings-sec-platform.md` PLAT-7.

### Required change
Delete the local envelopes and let `withApiHandler` handle unexpected errors. Replace `registrations.js:358-365` with `reportProviderError('Email blacklist check failed; skipped', err)`.

### Acceptance criteria
- [ ] A throwing DB in contact or upload produces exactly one log line and one Sentry event.
- [ ] No un-awaited `Sentry.captureException` remains in `api/`.

### Verification
Observability suite extended to contact and upload; a `backend-invariants` grep guard.

### Dependencies
None.

### Related findings
DOC-002, OBS-004

## [x] MAINT-003 — Map creation responses through allow-list mappers
> **Done.** Signup answers `{id, eventId, attendeeCount, confirmationEmail[, cancelUrl]}`; contact POST answers `{success:true}`; upload returns the public document shape (`PublicDocument` type); login returns `userId` like `me`.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability / Contract / Privacy

### Files
- `api/contact.js` (:124-168)
- `api/upload.js` (:185-199)
- `api/registrations.js` (:612-614)
- `api/documents.js` (:50-71, :122-126)
- `api/auth.js` (:211-218)
- `shared/schema.ts` (`Document` type :380)
- `client/src/components/RichTextEditor.tsx` (:262)

### Problem
Public signup returns the raw row minus `cancel_token`, a deny-list, so any future column is published to anonymous callers. Public contact POST echoes the full stored row, PII included. Upload returns a raw snake_case row including `uploaded_by` and `public_id`. The client `Document` type does not match the wire format. Login returns `id` while `me` returns `userId`.

### Evidence
`.review/findings-quality.md` MAINT-3 and `.review/findings-trace.md` TRACE-7.

### Required change
Add `mapPublicRegistration` (an allow-list) and `mapDocument`. Return `{success:true}` from contact POST. Fix the `Document` type and the login body.

### Acceptance criteria
- [ ] 201 bodies contain only allow-listed camelCase fields, pinned by a handler test.
- [ ] `tsc` passes with the corrected `Document` type.

### Verification
Handler suites; `npm run check`.

### Dependencies
None.

### Related findings
SEC-005

## [x] PERF-001 — Lazy-load the council editor modals on `/kalender`
> **Done.** The four editor modals are `React.lazy` and the editor block renders only for editors. `/kalender` static closure: 515 → 339 kB gzipped, no RichTextEditor. Guarded in client-invariants.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (measured) · **Effort:** S · **Area:** Performance / Frontend

### Files
- `client/src/components/calendar-editor-tools.tsx` (:24-27)
- `client/src/components/calendar-views.tsx` (:23-24, :381)
- `tests/client-invariants.test.mjs`

### Problem
`useCalendarEditor` statically imports the three editor modals, and two of them import TipTap's `RichTextEditor`. Every anonymous visitor to `/kalender` downloads 515 kB of gzipped JS, against about 205 kB on other public pages; RichTextEditor alone is 132 kB.

### Evidence
`dist/public/assets/calendar-views-*.js` contains `from"./RichTextEditor-….js"`. See `.review/findings-perf.md` PERF-1.

### Required change
Use `React.lazy` for the modals and render each only while its target is set, inside `Suspense`. Optionally lazy-load `EventRegistrationModal` too.

### Acceptance criteria
- [ ] The built `calendar-views` chunk has no static import of `RichTextEditor`.
- [ ] The `/kalender` static closure is under 300 kB gzipped.
- [ ] Editor focus-return tests still pass.

### Verification
`npm run build`, then inspect the chunk imports; `tests/editor-accessibility.test.mjs`. Add a guard in `client-invariants`.

### Dependencies
None.

### Related findings
PERF-004

## [ ] PERF-002 — Serve small previews in the media-share grid
**Priority:** P2 · **Severity:** Medium · **Confidence:** High · **Effort:** M · **Area:** Performance / Share page

### Files
- `client/src/share/share-page.tsx` (:277-286)
- `client/src/lib/media-upload.ts`
- `api/media.js` (:135-144, :357)
- `api/_shared/media-share.js` (:237-283)
- new migration (`media_files.preview_key`)
- `docs/mediedeling.md`

### Problem
Grid tiles are the original camera files, and the first 6 load eagerly: typically 15–35 MB and large decode memory on phones, with a crash risk on iOS Safari.

### Evidence
`.review/findings-perf.md` PERF-3.

### Required change
Get product sign-off first, because `docs/mediedeling.md` promises originals are never re-encoded. Then generate a roughly 480 px preview in the browser at upload time (canvas output strips EXIF), store it as a second R2 object, and return `previewUrl`. Include preview keys in quota and purge.

### Acceptance criteria
- [ ] The grid loads previews and the lightbox or download still serves the original.
- [ ] Previews carry no EXIF.
- [ ] Purge deletes both objects.

### Verification
`tests/media-handler.test.mjs`, `media-scrub`, `media-share`. Measure a 30-photo share with DevTools under mobile throttling.

### Dependencies
Product decision.

### Related findings
SEC-015

## [ ] PERF-003 — Verify and pin function and DB regions
**Priority:** P2 · **Severity:** Medium · **Confidence:** Unverified · **Effort:** S · **Area:** Performance / Platform

### Files
- `vercel.json` (deliberate change; call it out in the PR)
- `docs/DEPLOYMENT.md`
- `tests/deploy-config.test.mjs`

### Problem
Nothing records the function region or the Neon region. If functions run in the default `iad1` while Neon is in the EU, each of the up to 6 sequential queries per request pays roughly 80–100 ms.

### Evidence
`.review/findings-perf.md` PERF-4.

### Required change
Check Vercel → Settings → Functions → Region against the Neon project region. If they differ, add `"regions"` to `vercel.json` matching Neon and document the choice.

### Acceptance criteria
- [ ] The regions are documented, and co-located if they were not.
- [ ] A `deploy-config` test asserts `regions` if one is added.

### Verification
Compare p50/p95 `durationMs` of `POST /api/registrations` before and after (already logged).

### Dependencies
Dashboard access.

### Related findings
PERF-005

## [x] TEST-001 — Cover secure-settings mutation logic in the handler harness
> **Done.** New handler cases: users DELETE only matches member/staff; a reply is stored as sent only after Gmail accepts it (502 and no UPDATE when it refuses); no-address, empty-reply, missing and mail-not-configured refusals; blog update's three-state newsletter flag and HTML sanitizing; board-member and kindergarten validation. Checked: removing the role filter, or updating before sending, fails a test.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Tests

### Files
- `tests/secure-settings-handler.test.mjs`
- `api/secure-settings.js`

### Problem
These invariants are currently untested:
- users DELETE spares admins;
- a contact reply is marked responded only after the mail is sent (502 on mail failure);
- a reply to an anonymous inquiry returns 400;
- blog `notify_newsletter` three-state COALESCE and `sanitizeHtml`;
- board-member and kindergarten CRUD.

### Evidence
`.review/findings-quality.md` TEST-1.

### Required change
Add harness cases for each invariant.

### Acceptance criteria
- [ ] Removing `AND role IN (…)` from users DELETE fails a test.
- [ ] Reordering reply mail and UPDATE fails a test.

### Verification
`node --test --experimental-test-module-mocks tests/secure-settings-handler.test.mjs`.

### Dependencies
None.

### Related findings
TRACE-004

## [x] TEST-002 — Make the integration gate detect incomplete migrations
> **Done.** The base tables come from a frozen `tests/integration/baseline.sql` instead of the current `schema.ts`, and a new integration test compares the migrated database with the declaration (tables, columns, type, NOT NULL, indexes, unique and CHECK constraints). Checked: adding a column to `schema.ts` without a migration fails it.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** M · **Area:** Tests / DB

### Files
- `tests/integration/postgres-fixture.mjs` (:89-104)
- `tests/integration/database.test.mjs`

### Problem
The fixture creates the base tables from the current `schema.ts` before replaying migrations. Every `ADD COLUMN IF NOT EXISTS` is therefore a no-op in CI. A forgotten column, or a `schema.ts` change without a migration, passes CI and then breaks production, which only receives the SQL files.

### Evidence
`.review/findings-quality.md` TEST-2.

### Required change
Start from a frozen pre-0001 baseline DDL, apply all migrations, then diff `information_schema.columns`, indexes and constraints against the declaration.

### Acceptance criteria
- [ ] Adding a column to `schema.ts` without a migration fails the integration job.

### Verification
`npm run test:integration` (CI).

### Dependencies
DB-001 (to agree what the declaration should contain).

### Related findings
DB-001

## [x] DOC-002 — Fix the documented error convention to match `handleError`
> **Done.** AGENTS.md now describes the real convention.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Docs

### Files
- `AGENTS.md` (:65, :222)
- optionally `api/_shared/middleware.js` (:135)

### Problem
AGENTS.md says "Throw with a status, let `handleError` respond", but `withApiHandler` always passes 500 and never reads `error.status`. Following the doc turns intended 4xx responses into 500s plus Sentry noise.

### Evidence
`.review/findings-quality.md` DOC-2.

### Required change
Either document the real convention (write 4xx via `res.status(...).json({error, code})`; throw only for unexpected failures), or make `handleError` honour `error.status < 500` and test it.

### Acceptance criteria
- [ ] The doc and the code agree, and a test pins the chosen behaviour.

### Verification
Read-through, or the observability suite if the code changes.

### Dependencies
MAINT-002.

### Related findings
MAINT-002, TRACE-003

## [ ] DOC-005 — Update the privacy page for newsletter, media sharing, processors and cookies
**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed (legal adequacy is the association's call) · **Effort:** S · **Area:** Docs / Privacy

### Files
- `client/src/pages/privacy.tsx` (:15-110), or move the copy into `i18n.ts`

### Problem
The privacy page omits several things:
- newsletter subscriber data and the 90-day delivery records;
- private media sharing (R2, up to 365 days);
- Sentry and Vercel Analytics as processors;
- the `csrf-token` and `login-device` cookies, and the localStorage preferences.

### Evidence
`.review/findings-quality.md` DOC-5.

### Required change
Add the missing sections in both languages, after review by the board.

### Acceptance criteria
- [ ] Each data flow listed in `REPO_REVIEW.md` §2 is described.

### Verification
Review by the council; `npm run check`.

### Dependencies
None.

### Related findings
PERF-007 (Google Fonts IP disclosure)

## [x] A11Y-001 — Label the photo-day child-name inputs and show their errors inline
> **Done.** Child-name inputs are a fieldset with a legend, a Label per input, `aria-invalid` and an inline `role="alert"` error instead of the toast.

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Accessibility

### Files
- `client/src/components/event-registration-modal.tsx` (:170-180, :349-361)

### Problem
The child-name inputs have only a placeholder: no label or legend, and no `aria-invalid`. A missing name is reported only in a toast. This fails WCAG 1.3.1, 3.3.2 and 4.1.2 on the main public form.

### Evidence
`.review/findings-quality.md` A11Y-1.

### Required change
Reuse the sibling "other attendees" fieldset, legend and Label pattern (:366-386). Show the error inline with `role="alert"` and `aria-describedby`.

### Acceptance criteria
- [ ] Each input has an accessible name.
- [ ] An error is announced and tied to its field.

### Verification
An `editor-accessibility`/`client-invariants` style check; `npm run build`; a manual screen-reader pass.

### Dependencies
None.

### Related findings
A11Y-002, A11Y-004

## [x] A11Y-002 — Move hard-coded Norwegian form labels into `i18n.ts`
> **Done.** All signup-form labels, placeholders, the seats-left line and the dialog intro come from `i18n.ts` (i18n ratchet 31 → 30).

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Accessibility / i18n

### Files
- `client/src/components/event-registration-modal.tsx` (:279, :280, :292, :306, :431, :435)
- `client/src/pages/privacy.tsx` (local dictionary)
- optionally `scripts/check-i18n.mjs`

### Problem
"Fullt navn *", "E-post *", "Telefon", "Kommentarer" and similar are bare literals. In English the page is `lang="en"` but these accessible names are Norwegian (3.1.2). The i18n ratchet does not count bare literals.

### Evidence
Lead spot-check of `event-registration-modal.tsx` lines 278-308.

### Required change
Add `t.events.*` keys in both languages. Optionally extend the ratchet to Norwegian literals inside JSX labels.

### Acceptance criteria
- [ ] No Norwegian literal remains in `event-registration-modal.tsx` labels or placeholders.

### Verification
`npm run check`.

### Dependencies
None.

### Related findings
A11Y-001, TRACE-003

## [x] A11Y-003 — Add `autocomplete` to identity and credential fields
> **Done.** `autocomplete` on login, password change, signup and newsletter fields; `off` on the admin's create-user fields (they describe someone else).

**Priority:** P2 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Accessibility

### Files
- `client/src/components/login-modal.tsx` (:72-91)
- `client/src/components/password-change-modal.tsx` (:72-100)
- `client/src/components/event-registration-modal.tsx` (:280, :294, :308)
- `client/src/components/newsletter-signup.tsx` (:91-110)
- `client/src/components/staff-users-section.tsx`

### Problem
These fields have no `autocomplete` purpose (WCAG 1.3.5), which also weakens password-manager support (3.3.8). `contact.tsx:287-320` already does this correctly.

### Evidence
`.review/findings-quality.md` A11Y-3.

### Required change
Add `username`, `current-password`, `new-password`, `name`, `email` and `tel`.

### Acceptance criteria
- [ ] Every listed field has the matching token.

### Verification
`npm run build`; optionally a `client-invariants` check.

### Dependencies
None.

### Related findings
A11Y-001

---

## P3

## [ ] SEC-004 — Rate-limit the current-password check in change-password
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Authentication
### Files
`api/auth.js` (:260-296), `tests/auth-handler.test.mjs`
### Problem
A live session can make unthrottled, parallel guesses of the account password.
### Evidence
`.review/findings-sec-authz.md` AUTHZ-2.
### Required change
Apply a per-user atomic limit (about 5 per 15 min) before bcrypt.
### Acceptance criteria
- [ ] Once over the limit, attempts never reach bcrypt and nothing changes.
### Verification
Auth-handler case.
### Dependencies
SEC-001 (atomic pattern).
### Related findings
SEC-001

## [ ] SEC-007 — Require a click to confirm or unsubscribe from the newsletter
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Security / CSRF-by-scanner
### Files
`client/src/pages/newsletter.tsx` (:50-58), `api/_shared/newsletter.js`, `client/src/lib/i18n.ts`
### Problem
A `useEffect` POSTs as soon as the page loads. Mail scanners that execute JS can silently unsubscribe a recipient, or confirm an address someone else entered.
### Evidence
`.review/findings-sec-input.md` INPUT-4. The registration-cancel page already requires a click.
### Required change
Show a button and POST only on click. Optionally add `List-Unsubscribe-Post` (RFC 8058).
### Acceptance criteria
- [ ] No request is sent before user interaction.
### Verification
`client-invariants` guard; `npm run build`.
### Dependencies
None.
### Related findings
SEC-008

## [ ] SEC-008 — Expire newsletter confirmation tokens and purge stale pending rows
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Session management
### Files
`api/contact.js` (:272-349), `api/cron/event-reminders.js`
### Problem
Confirm tokens never expire, although the error message says "expired". Pending subscribers are never purged.
### Evidence
`.review/findings-sec-authz.md` AUTHZ-4.
### Required change
Refuse after about 7 days, refreshing the timestamp on re-arm. Purge stale pending rows in the morning cron. Treat a second confirm of an already-active address as success.
### Acceptance criteria
- [ ] An old token returns 400.
- [ ] Re-subscribe re-arms the token.
- [ ] A repeat confirm shows success.
### Verification
`tests/contact-handler.test.mjs`.
### Dependencies
None.
### Related findings
SEC-007

## [ ] SEC-009 — HMAC rate-limit keys
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Privacy
### Files
`api/_shared/rate-limit.js` (:28-44), `tests/rate-limit.test.mjs`
### Problem
Keys are unsalted SHA-256 of IP and e-mail, so anyone with read access to the DB can reverse them.
### Evidence
`.review/findings-sec-platform.md` PLAT-2.
### Required change
Use HMAC with an HKDF key derived from `SESSION_SECRET` (purpose `rate-limit-v1`), as `media-share.js:45-48` does.
### Acceptance criteria
- [ ] The key differs from a plain sha256 and is stable for a given secret.
### Verification
Rate-limit suite.
### Dependencies
None.
### Related findings
SEC-010

## [ ] SEC-010 — Key per-IP limits by IPv6 /64
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Security / Rate limiting
### Files
`api/_shared/rate-limit.js` (:11-37)
### Problem
One /64 gives an attacker 2^64 separate buckets for every per-IP limit.
### Evidence
`.review/findings-sec-input.md` INPUT-5.
### Required change
Normalise IPv6 to its /64 prefix and handle IPv4-mapped addresses.
### Acceptance criteria
- [ ] Two addresses in the same /64 produce the same key.
### Verification
Rate-limit suite.
### Dependencies
None.
### Related findings
SEC-001

## [ ] SEC-011 — Expire temporary passwords
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Security / Credentials
### Files
`api/secure-settings.js` (:672-700), `api/auth.js`, `api/_shared/password-policy.js`, migration + `shared/schema.ts`
### Problem
A temporary password mailed in clear text stays valid indefinitely, and whoever uses it first sets the permanent password.
### Evidence
`.review/findings-sec-platform.md` PLAT-3.
### Required change
Add `temp_password_expires_at` (7 days), refuse login after it with a code, and add an admin re-issue action.
### Acceptance criteria
- [ ] An expired temporary password is refused.
- [ ] An admin can re-issue one.
### Verification
Auth-handler and secure-settings cases.
### Dependencies
None.
### Related findings
—

## [ ] SEC-012 — Ignore all `.env*` files except the example
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Secrets
### Files
`.gitignore` (:12-17)
### Problem
`.env.production`, `.env.development` and `.env.preview` are not ignored.
### Evidence
`git check-ignore .env.production` returns nothing.
### Required change
Use `.env*` together with `!.env.example`.
### Acceptance criteria
- [ ] Those three files are ignored.
- [ ] `.env.example` is still tracked.
### Verification
`git check-ignore`.
### Dependencies
None.
### Related findings
—

## [ ] SEC-013 — Tighten the main CSP
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Headers
### Files
`vercel.json` (:76; deliberate change, mention it in the PR), `tests/deploy-config.test.mjs`
### Problem
The main CSP is wider than the site needs:
- `script-src` allows `https://browser.sentry-cdn.com`, which is unused because Sentry is bundled;
- `img-src` allows `https:`;
- `connect-src` allows `data:`.
### Evidence
`.review/findings-sec-platform.md` PLAT-5 and `.review/findings-sec-input.md` INPUT-8.
### Required change
Remove the unused sources. Narrow `img-src` after confirming every image host in use.
### Acceptance criteria
- [ ] A `deploy-config` test asserts that every `script-src` origin is referenced by the build.
### Verification
`npm run build`; deploy-config suite; check a preview deployment manually.
### Dependencies
None.
### Related findings
PERF-007

## [ ] SEC-014 — Don't truncate sanitized HTML mid-tag
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Security / Input handling
### Files
`api/_shared/middleware.js` (:527-589), `tests/sanitizer-runtime.test.mjs`, `client/src/lib/i18n.ts`
### Problem
The output is cut with `.substring` after sanitizing, which can leave an unterminated tag and silently lose trailing content.
### Evidence
`.review/findings-sec-input.md` INPUT-7.
### Required change
Refuse input over the limit with a coded 413, or sanitize again after truncating.
### Acceptance criteria
- [ ] The output always parses to balanced tags.
- [ ] Over-limit input returns a coded error.
### Verification
Sanitizer-runtime suite.
### Dependencies
None.
### Related findings
—

## [ ] SEC-015 — Serialize the media quota and file-count checks
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Security / Concurrency
### Files
`api/media.js` (:342-360)
### Problem
Concurrent `upload-init` calls can both pass the `SUM(size_bytes)` guard and the count check. The comment claims the opposite.
### Evidence
`.review/findings-sec-input.md` INPUT-3 and `.review/findings-trace.md` TRACE-10.
### Required change
Take `pg_advisory_xact_lock` inside the statement, or lock the share row `FOR UPDATE`. Fix the comment.
### Acceptance criteria
- [ ] In an integration test, two concurrent inits that each fit alone cannot both succeed past the quota.
### Verification
`npm run test:integration`.
### Dependencies
None.
### Related findings
PERF-002

## [ ] SEC-016 — Clear the source-map-js audit finding
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Security / Dependencies
### Files
`package.json` (`overrides`), `docs/DEPLOYMENT.md`
### Problem
`npm audit --omit=dev` reports a high-severity advisory that cannot be reached as wired (sanitize-html passes `map:false`). It keeps the audit red and could hide a real advisory.
### Evidence
`.review/findings-sec-platform.md` PLAT-6.
### Required change
Add an `overrides` entry once a patched version exists (let Dependabot handle the bump; don't hand-edit the lockfile), and record the triage.
### Acceptance criteria
- [ ] `npm audit --omit=dev` is clean, or the triage is documented.
### Verification
`npm audit --omit=dev`.
### Dependencies
An upstream release.
### Related findings
—

## [ ] TRACE-004 — Use one row selector for kindergarten info
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Correctness
### Files
`api/secure-settings.js` (:425-430, :479), `tests/secure-settings-handler.test.mjs`
### Problem
GET reads the newest row and PUT updates the oldest. With two rows, saves appear to revert.
### Evidence
`.review/findings-trace.md` TRACE-5.
### Required change
Run `SELECT count(*) FROM kindergarten_info` in production. Use the same ordering in GET and PUT, or enforce a single row.
### Acceptance criteria
- [ ] A harness case with two rows shows GET returning what PUT wrote.
### Verification
Secure-settings suite.
### Dependencies
None.
### Related findings
TEST-001

## [ ] TRACE-005 — Format stored values in outbound mail
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Correctness / Mail
### Files
`api/cron/event-reminders.js` (:138, :155), `api/contact.js` (:188, :198)
### Problem
Reminder mails print `Fototidspunkt: ["09:00","09:10"]` without names, and council mails print the raw subject enum.
### Evidence
`.review/findings-trace.md` TRACE-6 (probe).
### Required change
Use `resolvePhotoSlotsForRegistration` paired with child names, and `contactSubjectLabel`.
### Acceptance criteria
- [ ] A reminder mail lists times paired with names.
- [ ] The council mail shows the subject label.
### Verification
`tests/event-reminders.test.mjs`, `tests/emails.test.mjs`.
### Dependencies
SEC-003 (no child names in mail to unverified addresses; reminders go to the same address, so decide together).
### Related findings
SEC-003

## [ ] TRACE-006 — Invalidate seat counts after public signup and cancel
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Correctness / Cache
### Files
`client/src/pages/registration-cancel.tsx` (:176-184), `client/src/components/event-registration-modal.tsx` (:112-113)
### Problem
Seat counts and the "full" state stay stale for up to 5 minutes after a signup or cancel.
### Evidence
`.review/findings-trace.md` TRACE-8.
### Required change
Invalidate `['/api/events']` after cancel, and the eventId-prefixed registration keys after signup.
### Acceptance criteria
- [ ] Counts refresh immediately after either action.
### Verification
`npm run build`; manual check.
### Dependencies
None.
### Related findings
—

## [ ] TRACE-007 — Handle documents with a null URL or another category
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Correctness
### Files
`api/documents.js` (:96), `api/upload.js` (:171), `client/src/pages/files.tsx` (:42, :124)
### Problem
DELETE on a URL-less row returns 500, and documents in other categories are public but hidden from the UI, so they cannot be managed.
### Evidence
`.review/findings-trace.md` TRACE-9.
### Required change
Handle a null URL in DELETE. Validate the category server-side, or add an "other" section to the UI.
### Acceptance criteria
- [ ] Every listed document can be deleted from the UI.
### Verification
`tests/document-deletion.test.mjs`.
### Dependencies
None.
### Related findings
MAINT-003

## [ ] PERF-004 — Keep Drizzle out of the client bundle
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Performance
### Files
`client/src/components/event-registration-modal.tsx` (:14), `client/src/pages/contact.tsx` (:25), `client/src/components/event-creation-modal.tsx` (:19), `shared/schema.ts`
### Problem
`createInsertSchema` pulls drizzle-orm pg-core (67 kB gz) into public pages.
### Evidence
`.review/findings-perf.md` PERF-2.
### Required change
Write plain zod form schemas in a small shared module, keeping only `import type` from `schema.ts`. Add a key-parity test.
### Acceptance criteria
- [ ] No `Pg*Builder` code in any chunk reachable from `main` or `contact`.
### Verification
`npm run build`; parity test.
### Dependencies
PERF-001.
### Related findings
PERF-001

## [ ] PERF-005 — Bound `/api/events` and batch yearly-calendar reads
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** M · **Area:** Performance
### Files
`api/events.js` (:308-318), `api/yearly-calendar.js`, `client/src/hooks/useCalendarEntries.ts` (:28-38), `client/src/hooks/useUpcomingItems.ts`
### Problem
The public events list returns every event ever, and the calendar makes 4 calls with no caching.
### Evidence
`.review/findings-perf.md` PERF-5.
### Required change
Add a one-year cutoff or a `?from=` parameter, and accept `schoolYears=a,b,c` in one call. Consider a short `s-maxage` only after designing editor cache busting.
### Acceptance criteria
- [ ] The events payload is bounded.
- [ ] The calendar makes at most 2 API calls.
### Verification
`tests/events-handler.test.mjs`.
### Dependencies
PERF-003.
### Related findings
—

## [ ] PERF-006 — Don't silently drop newsletter overflow
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** M · **Area:** Reliability
### Files
`api/cron/event-reminders.js` (:33-34, :62, :305-323, :687-698), `vercel.json` (if a cron slot is added)
### Problem
Event and calendar deliveries deferred past the per-run cap are marked `skipped` the next night. Morning housekeeping has no deadline checks.
### Evidence
`.review/findings-perf.md` PERF-6.
### Required change
Add a follow-up run while `remaining > 0`, or allow one extra day for dated items. Add deadline checks and a smaller purge batch. Alert on overflow.
### Acceptance criteria
- [ ] A deadline expiring mid-batch leaves deliveries pending, and they are sent by the next run.
### Verification
`tests/newsletter-broadcast.test.mjs`, `tests/event-reminders.test.mjs`.
### Dependencies
None.
### Related findings
OBS-005

## [ ] PERF-007 — Self-host fonts and preload the landing hero
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** S · **Area:** Performance / Privacy
### Files
`client/index.html` (:22-23), `client/src/App.tsx` (:11), `client/src/index.css`, `vercel.json` (CSP)
### Problem
The Google Fonts stylesheet blocks rendering and sends visitor IPs to Google. The hero image is only discovered after the lazy route loads.
### Evidence
`.review/findings-perf.md` PERF-7.
### Required change
Self-host Manrope and Caveat as `/del` does, and import `Home` eagerly. Optionally preload the hero.
### Acceptance criteria
- [ ] No request to fonts.googleapis.com.
- [ ] Mobile LCP on `/` improves in Lighthouse.
### Verification
`npm run build`; Lighthouse.
### Dependencies
None.
### Related findings
SEC-013, DOC-005

## [ ] OBS-003 — Record the target id of admin mutations
**Priority:** P3 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Observability / Audit
### Files
`api/_shared/log.js` (:98-107), `api/_shared/middleware.js` (:123-131), `docs/DEPLOYMENT.md`
### Problem
`api.mutation` logs who acted but not on what. There is no audit table and no documented log drain.
### Evidence
`.review/findings-quality.md` OBS-2.
### Required change
Add `targetId` (and the created id) to the mutation log line. Document a log drain, or add an `audit_log` table for admin resources.
### Acceptance criteria
- [ ] A DELETE log line contains the target id.
### Verification
Observability suite.
### Dependencies
OBS-002.
### Related findings
OBS-004

## [ ] OBS-004 — Tag error events with request context and release; show the request id to users
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Observability
### Files
`api/_shared/sentry.js` (:26-53), `client/src/main.tsx` (:17-26), `api/_shared/provider-errors.js` (:16-18), `client/src/lib/queryClient.ts`
### Problem
Error events cannot be tied to a request or a deploy, and users never see the request id.
### Evidence
`.review/findings-quality.md` OBS-4.
### Required change
Send `requestFields` as tags and set the release from `VERCEL_GIT_COMMIT_SHA` on both tiers. Show `X-Request-Id` in the error UI. Route provider errors through `logEvent`.
### Acceptance criteria
- [ ] A server Sentry event carries requestId and release.
- [ ] The error UI shows the id.
### Verification
`tests/telemetry-privacy.test.mjs`, `tests/observability.test.mjs`.
### Dependencies
MAINT-002, OBS-002.
### Related findings
—

## [ ] MAINT-001 — Fingerprint backend type diagnostics instead of counting them
**Priority:** P3 · **Severity:** Medium · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability / Tooling
### Files
`scripts/check-backend-types.mjs` (:31), `tsconfig.api.json`, `api/_shared/email.js` (:94, :119), `api/_shared/middleware.js` (:290, :351, :381, :507-519), `tests/backend-type-gate.test.mjs`
### Problem
The gate only counts diagnostics. 27 of the 50 come from `schema.ts` under `strict:false`, so fixing noise frees headroom for real errors.
### Evidence
`.review/findings-quality.md` MAINT-1.
### Required change
Fix the 14 JSDoc-caused diagnostics, keep `schema.ts` out of the api program, and store a fingerprint baseline (file + code + message).
### Acceptance criteria
- [ ] Adding one diagnostic and removing another still fails the gate.
### Verification
`npm run check`; backend-type-gate suite.
### Dependencies
None.
### Related findings
—

## [ ] MAINT-004 — Remove or wire up dead exports
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Maintainability
### Files
`api/_shared/delivery.js` (:4), `api/cron/event-reminders.js` (:256, :603, :614), `api/_shared/turnstile.js` (:44), `shared/media.js` (:92), `api/media.js`
### Problem
Several exports have no callers or are disconnected:
- `DELIVERY_LEASE_MINUTES` is unused while the lease value is duplicated as a literal three times;
- `isTurnstileEnabled` has no callers;
- `MEDIA_ERROR_CODES` is not pinned to the codes `media.js` refuses with.
### Evidence
`.review/findings-quality.md` MAINT-4.
### Required change
Interpolate the lease constant, delete the unused function, and add a test pinning the media codes.
### Acceptance criteria
- [ ] No exported symbol in `api/_shared` or `shared` is left without a caller.
### Verification
`npm test`.
### Dependencies
None.
### Related findings
—

## [ ] MAINT-005 — Extract signup validation and the registration mail templates
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** M · **Area:** Maintainability
### Files
`api/registrations.js` (:281-616, :661-767), new `api/_shared/registration-emails.js`, `tests/emails.test.mjs`
### Problem
A 335-line inline POST branch and mail built by string concatenation make the most-sent public mail untestable. Date formatting there has no timezone.
### Evidence
`.review/findings-quality.md` MAINT-5.
### Required change
Add `validateSignupBody` and pure template functions, following `events.js` `validateEventBody` and `contact-emails.js`. Format dates with an explicit `timeZone: 'Europe/Oslo'`.
### Acceptance criteria
- [ ] Templates are unit-tested in both languages, including the cancel link and photo slots.
### Verification
`tests/emails.test.mjs`, `tests/registrations-handler.test.mjs`.
### Dependencies
None.
### Related findings
SEC-003, TEST-003

## [ ] TEST-003 — Add behavioural tests for council registration paths
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Tests
### Files
`tests/registrations-handler.test.mjs`, `tests/auth-handler.test.mjs`, `tests/document-deletion.test.mjs`
### Problem
The council list, council DELETE (seat release), `auth?action=csrf` and `documents?action=download` are guarded only by source regex.
### Evidence
`.review/findings-quality.md` TEST-3.
### Required change
Add handler-harness cases for these paths.
### Acceptance criteria
- [ ] Removing the seat-release clause fails a behavioural test.
### Verification
The suites above.
### Dependencies
MAINT-005 (easier afterwards).
### Related findings
TRACE-001

## [ ] DOC-001 — Correct handler/function counts and the media routing list
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Docs
### Files
`docs/architecture.md` (:8, :27-35), `docs/DEPLOYMENT.md` (:8), `api/_shared/log.js` (:6)
### Problem
The docs say "eight" or "nine" handlers; there are 9 handlers plus the cron, 10 functions. `media?action=` is missing from the routing list. `log.js` says four handlers multiplex; six do.
### Evidence
`.review/findings-quality.md` DOC-1.
### Required change
Fix the counts and the routing list.
### Acceptance criteria
- [ ] The docs agree with `ls api`.
### Verification
Read-through.
### Dependencies
None.
### Related findings
—

## [ ] DOC-003 — Correct the timestamptz rule in AGENTS.md
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Docs
### Files
`AGENTS.md` (:217-218)
### Problem
AGENTS.md names `api_rate_limits` as the only timestamptz table. `newsletter_deliveries`, `reminder_claimed_at`, `cancelled_at` and `photo_event_slots.created_at` are timestamptz too, and correctly use `NOW()`.
### Evidence
`.review/findings-quality.md` DOC-3.
### Required change
List the timestamptz columns, or state the rule per column type.
### Acceptance criteria
- [ ] AGENTS.md matches `schema.ts`.
### Verification
Read-through.
### Dependencies
None.
### Related findings
—

## [ ] DOC-004 — Refresh README
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Docs
### Files
`README.md`
### Problem
The README has a stale env list, misdescribes auth and CSRF (says session-based and SameSite), says "Drizzle-managed schema", and says `npm install`.
### Evidence
`.review/findings-quality.md` DOC-4.
### Required change
Point to `.env.example` and AGENTS.md, and correct the descriptions.
### Acceptance criteria
- [ ] The README contains nothing that contradicts AGENTS.md.
### Verification
Read-through.
### Dependencies
None.
### Related findings
—

## [ ] A11Y-004 — Show form errors inline, not only in toasts
**Priority:** P3 · **Severity:** Medium · **Confidence:** Possible · **Effort:** M · **Area:** Accessibility
### Files
`client/src/components/password-change-modal.tsx`, `client/src/components/login-modal.tsx`, `client/src/components/yearly-calendar-entry-modal.tsx` (:183-209, :270), `client/src/pages/settings.tsx`, `client/src/pages/content.tsx`, `client/src/hooks/use-toast.ts` (:8)
### Problem
Errors appear only in a 5-second, single-slot toast, with no `aria-invalid`. Save buttons are disabled with no reason given.
### Evidence
`.review/findings-quality.md` A11Y-4.
### Required change
Show inline `role="alert"` messages tied to fields with `aria-describedby`, as `share-page.tsx:207-224` does.
### Acceptance criteria
- [ ] Each form error persists next to its field and is announced.
### Verification
A manual screen-reader pass.
### Dependencies
TRACE-003.
### Related findings
A11Y-001

## [ ] A11Y-005 — Name the icon-only post-actions button
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Accessibility
### Files
`client/src/pages/content.tsx` (:506-509), `tests/client-invariants.test.mjs` (:80)
### Problem
The button has no accessible name, and the existing guard only checks the files it names.
### Evidence
`.review/findings-quality.md` A11Y-5.
### Required change
Add an `aria-label` from i18n, and widen the guard to all non-ui files.
### Acceptance criteria
- [ ] The widened guard passes.
### Verification
`client-invariants` suite.
### Dependencies
None.
### Related findings
—

## [ ] A11Y-006 — Replace raw palette colours with tokens where contrast fails
**Priority:** P3 · **Severity:** Low · **Confidence:** High · **Effort:** M · **Area:** Accessibility / Design system
### Files
`client/src/pages/content.tsx` (:554), `client/src/components/yearly-calendar-import-modal.tsx` (:487), plus other raw palette utilities
### Problem
The "(arkivert)" label measures about 3.6:1, and there are 127 raw palette utilities against the token rule.
### Evidence
`.review/findings-quality.md` A11Y-6.
### Required change
Fix the failing pair first, then migrate the raw utilities incrementally (read `docs/design/style-guide.md` first).
### Acceptance criteria
- [ ] "(arkivert)" is at least 4.5:1 in both themes.
### Verification
A contrast check in both themes.
### Dependencies
None.
### Related findings
A11Y-008

## [ ] A11Y-007 — Give month-grid chips text for cancelled and category
**Priority:** P3 · **Severity:** Low · **Confidence:** Possible · **Effort:** S · **Area:** Accessibility
### Files
`client/src/components/calendar-view.tsx` (:436-460)
### Problem
Cancelled is shown only by strike-through, and the category only by a dot hidden from assistive technology.
### Evidence
`.review/findings-quality.md` A11Y-7.
### Required change
Add sr-only "cancelled" text and the category label inside the chip.
### Acceptance criteria
- [ ] A screen reader announces both.
### Verification
A manual screen-reader pass.
### Dependencies
None.
### Related findings
—

## [ ] A11Y-008 — Fix the latent subtle-on-peach contrast pair
**Priority:** P3 · **Severity:** Low · **Confidence:** Confirmed · **Effort:** S · **Area:** Accessibility / Tokens
### Files
`client/src/index.css`, `client/src/components/site/page-hero.tsx` (:124)
### Problem
`--color-subtle` on `--color-peach` is 4.39:1. Nothing uses the pair today, but any eyebrow on the peach hero would fail.
### Evidence
`.review/findings-quality.md` A11Y-8.
### Required change
Darken the token for peach, or forbid the pair in `PageHero`.
### Acceptance criteria
- [ ] Every text token is at least 4.5:1 on every surface it can appear on.
### Verification
A contrast computation.
### Dependencies
None.
### Related findings
A11Y-006

---

## Dependency graph

```
SEC-001 ──> SEC-002
SEC-001 ──> SEC-004
DB-001  <──> TEST-002          (agree the declaration, then enforce it)
MAINT-002 ──> DOC-002
MAINT-002 ──> OBS-004 <── OBS-002 ──> OBS-003
TRACE-003 ──> A11Y-004
PERF-001 ──> PERF-004
PERF-003 ──> PERF-005
MAINT-005 ──> SEC-003 (eases), TEST-003 (eases)
SEC-003 ──> TRACE-005          (decide child names in mail together)
OBS-001 ── pairs with ── TRACE-001
```

## Can run in parallel

- **Phase 1:** SEC-001 and TRACE-001 are independent. SEC-002 starts once SEC-001's atomic reserve exists.
- **Independent of each other and of Phase 1:**
  - SEC-005, SEC-006, TRACE-002, TRACE-003
  - OBS-001, OBS-002, OBS-005
  - MAINT-003, PERF-001, PERF-003, TEST-001
  - A11Y-001/002/003 (one PR on the same form), DOC-005
  - SEC-007…016, TRACE-004…007
  - DOC-001/003/004, A11Y-005…008, MAINT-001, MAINT-004
- **Sequential chains:**
  - DB-001 → TEST-002
  - MAINT-002 → DOC-002 / OBS-004
  - PERF-001 → PERF-004
  - MAINT-005 → SEC-003 → TRACE-005
