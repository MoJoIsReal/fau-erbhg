# Repository Review Remediation Tasks

## Context and contribution rules

This backlog derives from the 2026-09-09 audit of the React/Vercel/Neon FAU
application. Read `AGENTS.md`, `docs/reviews/2026-09-09-repo-review.md`, `docs/architecture.md` and the
relevant trace row before starting. Do not weaken server-side RBAC, CSRF,
parameterized SQL or sanitization. Schema changes require both
`shared/schema.ts` and a staged `migrations/*.sql`; never test against production.
Every task must run `npm run check`, `npm test`, and `npm run build`, plus its
listed scenario. Preserve Norwegian and English strings and do not hand-edit
shadcn primitives.

Independent work streams: TRACE-001/002/004/005/006, SEC-002/004/005/006,
A11Y-002/003/004, PERF-001 and DOC-001 can run in parallel. DB-001, DB-002,
DB-003/004 and REL-001 should coordinate around TEST-001 and migration ownership.

## Dependency graph

```text
TEST-001 ─┬─ DB-001 ─ PERF-002
          ├─ DB-002
          ├─ DB-003 ─ DB-004
          ├─ REL-001 (prefer shared outbox with DB-001)
          └─ TRACE-007
MAINT-001 depends on contract tests from TEST-001
MAINT-002 follows shared request/response schema decisions in MAINT-001
```

## [x] TRACE-001 — Correct attendee-tooltip registration request

**Priority:** P1  
**Severity:** High  
**Confidence:** High  
**Effort:** Extra small  
**Area:** Traceability / Frontend correctness

### Files
- `client/src/components/attendee-tooltip.tsx`
- `client/src/lib/queryClient.ts`

### Problem
The multipart query key fetches `/api/events`, then interprets events as registrations.

### Evidence
`attendee-tooltip.tsx:27-49` conflicts with default query behavior at
`queryClient.ts:115-124`; the working URL is in `event-registrations-view.tsx:34-36`.

### Required change
Fetch the event-scoped registrations URL and type/map its authorized response.

### Acceptance criteria
- [ ] Tooltip calls `/api/registrations?eventId=<positive id>`.
- [ ] Named registrations render; loading/empty/403 states are stable.
- [ ] A behavior test fails with the old query key.

### Verification
Run `npm run check && npm test && npm run build`; component-test one populated event.

### Dependencies
None

### Related findings
TRACE-001, TR-09

## [ ] TEST-001 — Add deploy-equivalent test tiers

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Large  
**Area:** Testing / Infrastructure

### Files
- `package.json`
- `.github/workflows/ci.yml`
- `scripts/smoke-tests.mjs`
- new test configuration and test files

### Problem
Current smoke/source-regex tests do not execute API, PostgreSQL, browser, RBAC or concurrency behavior.

### Evidence
CI only check/test/build (`ci.yml:22-32`); source matching appears at
`smoke-tests.mjs:186-259`.

### Required change
Add pure-unit tests, ephemeral PostgreSQL handler integration, and Playwright/axe
smoke flows with injectable mail/storage adapters.

### Acceptance criteria
- [ ] CI starts an isolated PostgreSQL schema and exercises real parameterized SQL.
- [ ] Every role has authorized, wrong-role and missing-identity handler tests.
- [ ] Concurrent registration/cron tests can be expressed deterministically.
- [ ] Browser tests cover login, registration, admin CRUD and keyboard basics.
- [ ] Existing smoke checks remain or are replaced by stronger behavior tests.

### Verification
Run the new unit, integration and E2E commands twice from clean state, then the standard three commands.

### Dependencies
None

### Related findings
All P1 database/reliability tasks

## [ ] DB-001 — Make newsletter delivery durable and idempotent

**Priority:** P1  
**Severity:** High  
**Confidence:** High  
**Effort:** Large  
**Area:** Database / Reliability

### Files
- `api/cron/event-reminders.js`
- `shared/schema.ts`
- new migration

### Problem
Items are marked sent before fan-out; failed/capped recipients are never retried.

### Evidence
Claims occur at `event-reminders.js:142-164`; failures/cap only affect counters at `:169-205`.

### Required change
Introduce a per-item/per-subscriber outbox ledger with idempotency key, lease,
attempt/backoff and terminal state. Source completion follows fan-out completion.

### Acceptance criteria
- [ ] Mid-batch failure leaves only unsent deliveries retryable.
- [ ] Cap/timeout does not suppress remaining recipients.
- [ ] Repeated/concurrent workers never duplicate a successful delivery.
- [ ] Migration is safe for already-marked items and documented.
- [ ] Integration tests cover success, failure, cap and retry.

### Verification
Run isolated-DB concurrent worker tests with a fault-injecting mail adapter.

### Dependencies
TEST-001

### Related findings
DB-001, REL-001, PERF-002, TR-30

## [ ] DB-002 — Serialize or constrain photo-slot allocation

**Priority:** P1  
**Severity:** High  
**Confidence:** High  
**Effort:** Medium–Large  
**Area:** Database / Concurrency

### Files
- `api/registrations.js`
- `shared/schema.ts`
- new migration if slots are normalized

### Problem
Concurrent callers compute availability from the same pre-insert snapshot.

### Evidence
Read/assignment is at `registrations.js:214-227`; insert is later at `:234-285`;
only event/email uniqueness exists in migration 0001.

### Required change
Allocate after an event-scoped lock inside one transaction, or normalize slots
and enforce `UNIQUE(event_id, slot)` with safe conflict handling.

### Acceptance criteria
- [ ] Simultaneous distinct registrations receive disjoint slots.
- [ ] Capacity and registration remain atomic on conflict.
- [ ] Authorized/public behavior and email slot text remain unchanged.
- [ ] Concurrent PostgreSQL integration test is deterministic.

### Verification
Launch at least two synchronized registrations against one event and inspect committed rows.

### Dependencies
TEST-001

### Related findings
DB-002, TR-07

## [ ] DB-003 — Make registration deletion and counter update atomic

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small–Medium  
**Area:** Database / Correctness

### Files
- `api/registrations.js`

### Problem
Deletion and counter decrement are separate autocommit statements.

### Evidence
`api/registrations.js:343-357`.

### Required change
Use one CTE/transaction and return an explicit not-found result.

### Acceptance criteria
- [ ] Both changes commit or neither does.
- [ ] Counter cannot become negative.
- [ ] Missing registration returns 404.
- [ ] Fault-injection integration test proves rollback.

### Verification
Run deletion success/not-found/fault tests against PostgreSQL.

### Dependencies
TEST-001

### Related findings
DB-003, TR-10

## [ ] DB-004 — Enforce registration/event referential integrity

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Database / Schema

### Files
- `shared/schema.ts`
- `api/events.js`
- new migration

### Problem
No FK prevents orphan registrations; event deletion is count-then-delete.

### Evidence
`shared/schema.ts:39-55`, `api/events.js:199-219`, migration 0001.

### Required change
Audit existing orphans, decide/document RESTRICT versus CASCADE, add the FK and
make event deletion race-safe.

### Acceptance criteria
- [ ] Migration reports/resolves existing orphans before validation.
- [ ] Database enforces documented delete semantics.
- [ ] Concurrent register/delete cannot orphan a row.
- [ ] API translates constraint conflicts to a stable 409/400 response.

### Verification
Apply migration to populated fixture DB and run concurrency plus rollback tests.

### Dependencies
DB-003, TEST-001

### Related findings
DB-004, TR-06

## [ ] REL-001 — Prevent duplicate registration-reminder claims

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Reliability / Concurrency

### Files
- `api/cron/event-reminders.js`

### Problem
Overlapping workers may claim the same null-marked registration.

### Evidence
Candidate/update CTE at `event-reminders.js:261-293` lacks an update-side null
predicate or locked lease.

### Required change
Use the DB-001 lease/outbox design or atomic `SKIP LOCKED` claim with retry state.

### Acceptance criteria
- [ ] Two workers produce one successful delivery per registration.
- [ ] Failed leases expire/retry safely.
- [ ] Missing mail configuration does not strand claimed records.
- [ ] Claim age/attempts are observable.

### Verification
Run synchronized dual-worker PostgreSQL tests with success and failure adapters.

### Dependencies
TEST-001; coordinate with DB-001

### Related findings
REL-001, DB-001, TR-29

## [ ] PERF-002 — Bound and measure outbound mail concurrency

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium after outbox  
**Area:** Performance / Operations

### Files
- `api/cron/event-reminders.js`
- `vercel.json`

### Problem
Serial O(items × subscribers) SMTP awaits cannot reliably fit a 30-second function.

### Evidence
`event-reminders.js:173-199`, `vercel.json:5-8`.

### Required change
Process durable deliveries with provider-aware bounded concurrency/backoff and
metrics; do not merely increase timeout or use unbounded `Promise.all`.

### Acceptance criteria
- [ ] Configured concurrency respects provider limits.
- [ ] Timeout leaves retryable work.
- [ ] Queue age, duration, sent/failed/retried are measured.
- [ ] Load simulation demonstrates budget headroom.

### Verification
Run latency/failure simulation at and above the 400-delivery cap.

### Dependencies
DB-001, TEST-001

### Related findings
PERF-002

## [ ] SEC-001 — Validate and bind JWT configuration

**Priority:** P1  
**Severity:** Medium  
**Confidence:** Medium  
**Effort:** Small–Medium  
**Area:** Security / Authentication

### Files
- `api/auth.js`
- `api/_shared/middleware.js`
- new shared environment validator

### Problem
Any nonempty secret is accepted; tokens are not explicitly bound to algorithm, issuer and audience.

### Evidence
`auth.js:63-65,120-130`; `middleware.js:238-265`.

### Required change
Require ≥32 random bytes and explicit HS256/issuer/audience; rotate deployed key.

### Acceptance criteria
- [ ] Startup rejects absent, short and known placeholder secrets.
- [ ] Verification rejects wrong algorithm, issuer and audience.
- [ ] Valid login/logout/token-version behavior remains intact.
- [ ] Rotation/deployment steps are documented.

### Verification
Run token unit/integration tests and deploy-time configuration validation in staging.

### Dependencies
None

### Related findings
SEC-001, SEC-007

## [ ] SEC-002 — Redact provider errors before every log/capture

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small  
**Area:** Security / Privacy

### Files
- `api/contact.js`
- `api/registrations.js`
- `api/_shared/middleware.js`
- `api/_shared/sentry.js`

### Problem
Raw Nodemailer errors can contain parent envelope data and bypass shared redaction.

### Evidence
`contact.js:104-145,270-277`, `registrations.js:308-324` versus
`middleware.js:26-33`.

### Required change
Expose one redacted provider-error reporting API for console and Sentry; exclude bodies/envelopes.

### Acceptance criteria
- [ ] Synthetic email/phone/body content is absent from logs and Sentry payloads.
- [ ] Useful non-PII error code/context remains.
- [ ] Every mail failure call site uses the wrapper.
- [ ] User-visible errors remain generic and localized where applicable.

### Verification
Run unit tests with crafted provider error objects and inspect serialized capture payload.

### Dependencies
None

### Related findings
SEC-002, OBS-001

## [ ] SEC-003 — Bind upload claims to observed provider metadata

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Security / File handling

### Files
- `api/upload.js`
- `api/_shared/upload-validation.js`
- `api/documents.js`

### Problem
Client MIME/extension/size claims are independently allowlisted but not mutually
consistent or fully compared with Cloudinary metadata.

### Evidence
`upload.js:44-70,91-98,136-179`; `upload-validation.js:35-61`.

### Required change
Add MIME-extension mapping, finite non-negative size, observed-format comparison
and a documented safe download/content-inspection policy.

### Acceptance criteria
- [ ] Mismatched MIME/extension and negative/NaN sizes are rejected.
- [ ] Provider type/format disagreement is rejected before persistence.
- [ ] Existing allowed PDFs/images/documents still work.
- [ ] Download headers do not enable active-content execution.
- [ ] Integration tests mock and, where possible, stage Cloudinary metadata.

### Verification
Exercise renamed HTML, all allowlisted pairs, unexpected resource type and oversize.

### Dependencies
TEST-001 recommended

### Related findings
SEC-003, TR-12

## [ ] A11Y-001 — Provide keyboard calendar editing and movement

**Priority:** P1  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Accessibility / Calendar

### Files
- `client/src/pages/yearly-calendar.tsx`
- `client/src/lib/i18n.ts`

### Problem
Clickable div entries and mouse/touch-only drag sensors exclude keyboard users.

### Evidence
`yearly-calendar.tsx:328-348,429-434,840-850,931-938`.

### Required change
Use semantic edit controls and KeyboardSensor or explicit localized Move controls.

### Acceptance criteria
- [ ] Tab/Enter/Space opens edit without pointer input.
- [ ] All drag outcomes have a keyboard equivalent and are announced.
- [ ] Visible focus is not hidden by sticky UI.
- [ ] Pointer behavior is unchanged.
- [ ] Playwright keyboard and manual screen-reader scenarios pass.

### Verification
Complete create/edit/move using keyboard only at 200% zoom in both languages.

### Dependencies
None

### Related findings
A11Y-001, TR-26

## [x] TRACE-002 — Align `/messages` route with admin-only API

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Extra small  
**Area:** Traceability / Authorization UX

### Files
- `client/src/App.tsx`

### Problem
Members pass the page guard but every contact-message API call is admin-only.

### Evidence
`App.tsx:138-141`; `api/secure-settings.js:339-344`.

### Required change
Make page routing admin-only while retaining backend checks.

### Acceptance criteria
- [ ] Admin can navigate and load messages.
- [ ] Member and anonymous users see the established forbidden/redirect behavior.
- [ ] API remains ADMIN_ONLY.

### Verification
Run role-based route tests plus standard commands.

### Dependencies
None

### Related findings
TRACE-002, TR-21

## [ ] TRACE-004 — Define and validate calendar update semantics

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small  
**Area:** API contract / Validation

### Files
- `api/yearly-calendar.js`
- shared request schema/tests

### Problem
PUT can write absent school/year/month into NOT NULL columns and return 500.

### Evidence
`yearly-calendar.js:320-370`; `shared/schema.ts:173-179`.

### Required change
Choose full PUT or partial PATCH semantics and share strict server validation.

### Acceptance criteria
- [ ] Missing/null/range-invalid fields return documented 400/422, never DB 500.
- [ ] Current modal and drag payloads continue to work.
- [ ] Date/type-dependent invariants are tested.
- [ ] Auth/CSRF behavior is unchanged.

### Verification
Run handler contract boundary table against PostgreSQL.

### Dependencies
TEST-001 recommended

### Related findings
TRACE-004, TR-25

## [ ] TRACE-007 — Make Cloudinary deletion retryable

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Reliability / External storage

### Files
- `api/documents.js`
- `shared/schema.ts`
- new migration/cron integration if using outbox

### Problem
Metadata disappears before failed provider cleanup, losing the cleanup reference.

### Evidence
`api/documents.js:83-107`.

### Required change
Persist deletion intent and retry/reconcile idempotently; expose accurate state.

### Acceptance criteria
- [ ] Provider failure retains a durable cleanup job/reference.
- [ ] Retries are idempotent and observable.
- [ ] DB and Cloudinary eventually agree.
- [ ] Authorized/not-found/provider-failure tests exist.

### Verification
Fault-inject provider deletion, run retry, and assert both stores converge.

### Dependencies
TEST-001; may reuse DB-001 outbox

### Related findings
TRACE-007, TR-13

## [ ] PERF-001 — Lazy-load and budget the PDF renderer

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small  
**Area:** Frontend performance

### Files
- `client/src/pages/yearly-calendar.tsx`
- `client/src/lib/yearly-calendar-pdf.tsx`
- `vite.config.ts`

### Problem
Build emits a 1,424.62 kB minified PDF chunk.

### Evidence
`npm run build` bundle report and `yearly-calendar-pdf.tsx`.

### Required change
Dynamic-import at export invocation, show progress/error, and set a measured bundle budget.

### Acceptance criteria
- [ ] PDF code is absent from initial calendar route requests.
- [ ] First export loads once; hashed asset is browser-cacheable.
- [ ] Generated PDFs remain equivalent.
- [ ] CI records/enforces an agreed bundle threshold.

### Verification
Run build and browser network trace before/after; generate full and monthly PDFs.

### Dependencies
None

### Related findings
PERF-001, TR-28

## [ ] A11Y-002 — Add a localized skip link and main target

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Small  
**Area:** Accessibility / Navigation

### Files
- `client/src/components/layout.tsx`
- `client/src/lib/i18n.ts`

### Problem
Repeated sticky navigation has no bypass mechanism.

### Evidence
`layout.tsx:91-111,438-443`.

### Required change
Add a first-focusable skip link to a focusable main-content target.

### Acceptance criteria
- [ ] First Tab exposes a visible localized skip link.
- [ ] Activation places focus at main content on every route.
- [ ] Focus remains visible at 200%/400% zoom below sticky navigation.

### Verification
Keyboard-test representative public/admin routes in both languages.

### Dependencies
None

### Related findings
A11Y-002

## [x] A11Y-003 — Name the selected-file remove button

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Extra small  
**Area:** Accessibility / Upload

### Files
- `client/src/components/file-upload-modal.tsx`
- `client/src/lib/i18n.ts`

### Problem
The icon-only remove action has no accessible name.

### Evidence
`file-upload-modal.tsx:299-312`.

### Required change
Add a localized accessible name including the selected filename.

### Acceptance criteria
- [ ] Button has a unique role/name in Norwegian and English.
- [ ] It removes the selected file by keyboard.
- [ ] Accessible-name regression test exists.

### Verification
Query the button by role/name and activate with Enter/Space.

### Dependencies
None

### Related findings
A11Y-003

## [ ] MAINT-001 — Extract tested domain transaction scripts

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Large  
**Area:** Maintainability / Architecture

### Files
- `api/secure-settings.js`
- `api/registrations.js`
- `client/src/pages/yearly-calendar.tsx`

### Problem
Large modules mix HTTP, authorization, SQL, provider side effects, algorithms and UI.

### Evidence
The files are respectively 647, 467 and 1,252 lines with the listed mixed responsibilities.

### Required change
After contract tests, extract thin adapters, explicit domain commands/transaction
scripts, provider ports and pure calendar view models one flow at a time.

### Acceptance criteria
- [ ] Extracted dependencies are explicit and injectable.
- [ ] Authorization remains at the HTTP boundary and is regression-tested.
- [ ] Transaction boundaries remain visible, not hidden by a generic repository.
- [ ] No public API contract changes without migration notes.
- [ ] Complexity/line counts improve without duplicating handlers.

### Verification
Run contract/integration/E2E suites after each vertical extraction.

### Dependencies
TEST-001

### Related findings
MAINT-001, docs/architecture.md

## [ ] MAINT-002 — Bring backend contracts under static typing

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Large/incremental  
**Area:** Type safety / API contracts

### Files
- `tsconfig.json`
- `api/**/*.js`
- shared schema/contract modules

### Problem
`allowJs` plus disabled `checkJs` excludes backend handlers from strict checking.

### Evidence
`tsconfig.json:2-18`.

### Required change
Adopt checked JSDoc or TypeScript incrementally and explicit Zod request/response contracts.

### Acceptance criteria
- [ ] One domain at a time has typed request, auth principal, SQL result and response.
- [ ] Mutation/GET response casing is compile/contract checked.
- [ ] CI prevents regression in migrated directories.
- [ ] Runtime validation remains at trust boundaries.

### Verification
Run strict type check plus handler contract tests after each domain migration.

### Dependencies
MAINT-001 contract decisions; TEST-001

### Related findings
MAINT-002, TRACE-005

## [ ] OBS-001 — Add correlation, metrics and mutation audit events

**Priority:** P2  
**Severity:** Medium  
**Confidence:** High  
**Effort:** Medium  
**Area:** Observability / Security operations

### Files
- `api/_shared/middleware.js`
- sensitive mutation handlers
- schema/migration if durable audit table is chosen

### Problem
Errors are centralized, but requests/deliveries cannot be correlated and admin changes lack audit history.

### Evidence
`middleware.js:83-113`.

### Required change
Generate/propagate request IDs, structured completion/latency metrics and low-PII
actor/resource/action/outcome audit events.

### Acceptance criteria
- [ ] Response and logs share a request ID.
- [ ] Route duration/status and mail queue metrics exist.
- [ ] Sensitive admin mutations produce tamper-resistant audit records.
- [ ] Bodies, tokens, emails and phone numbers are excluded/redacted.
- [ ] Logging failure does not silently authorize or corrupt mutations.

### Verification
Exercise success/failure requests and inspect structured/redacted output and audit rows.

### Dependencies
SEC-002 recommended

### Related findings
OBS-001, SEC-002

## [ ] SEC-004 — Derive upload attribution from authenticated identity

**Priority:** P2  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** Security / Audit integrity

### Files
- `api/upload.js`
- upload clients if request field is removed

### Problem
An authenticated council member can supply another `uploadedBy` value.

### Evidence
`upload.js:25-42,154-179`.

### Required change
Persist authenticated username/user ID and ignore/reject client attribution.

### Acceptance criteria
- [ ] Spoofed body value cannot change attribution.
- [ ] Admin/member uploads record their actual principal.
- [ ] Backward-compatible handling is documented.

### Verification
Handler integration test with conflicting principal/body values.

### Dependencies
None

### Related findings
SEC-004

## [ ] DB-005 — Add staged domain/range constraints

**Priority:** P2  
**Severity:** Low  
**Confidence:** High  
**Effort:** Medium  
**Area:** Database / Integrity

### Files
- `shared/schema.ts`
- new migration

### Problem
Roles, statuses, types and calendar ranges are valid only by application convention.

### Evidence
`shared/schema.ts:13,28-31,72-73,87-89,176-203`.

### Required change
Audit production values, then add staged CHECK constraints with documented enums/ranges.

### Acceptance criteria
- [ ] Data audit query and remediation are documented.
- [ ] Migration avoids a surprise long lock and validates constraints deliberately.
- [ ] API translates violations to stable errors.
- [ ] Valid historical rows remain representable.

### Verification
Apply to production-like fixture data and attempt every invalid boundary directly and via API.

### Dependencies
TEST-001; production data audit

### Related findings
DB-005

## [ ] TRACE-005 — Normalize mutation response DTOs

**Priority:** P3  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** API contracts

### Files
- `api/secure-settings.js`
- shared response schemas/tests

### Problem
Mutation `RETURNING *` is snake_case while GET/shared client models are camelCase.

### Evidence
`secure-settings.js:69-109,197-243,313-332`.

### Required change
Use explicit SELECT/RETURNING aliases or centralized per-resource mappers.

### Acceptance criteria
- [ ] GET/POST/PUT for a resource serialize the same field names/null semantics.
- [ ] Contract tests validate each response schema.
- [ ] Existing refetch behavior remains intact.

### Verification
Snapshot/parse all resource responses through shared schemas.

### Dependencies
None

### Related findings
TRACE-005

## [ ] TRACE-006 — Standardize delete ID and not-found behavior

**Priority:** P3  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** API / Error handling

### Files
- `api/secure-settings.js`

### Problem
Several deletes accept textual IDs and report success when no row exists.

### Evidence
`secure-settings.js:113-125,246-259,467-480`.

### Required change
Use one positive-integer parser, `RETURNING id`, 404 on absence and the common error envelope.

### Acceptance criteria
- [ ] Missing/malformed/nonpositive IDs return 400.
- [ ] Missing rows return 404; deleted rows return the documented success status.
- [ ] Board/blog/message behavior is consistent.

### Verification
Run a shared table-driven handler contract suite.

### Dependencies
None

### Related findings
TRACE-006

## [ ] SEC-005 — Hash account-only rate-limit identifiers

**Priority:** P3  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** Security / Privacy

### Files
- `api/auth.js`
- `api/_shared/rate-limit.js`

### Problem
The account-only rate-limit key persists normalized usernames in cleartext.

### Evidence
`auth.js:67-86`; `rate-limit.js:10-38`.

### Required change
Use the existing opaque hashing approach or keyed HMAC without changing limit scope.

### Acceptance criteria
- [ ] Persisted key reveals no username/email.
- [ ] Same normalized account maps consistently across IPs.
- [ ] Different accounts do not collide in tests.

### Verification
Inspect adapter calls and fixture rows for representative identifiers.

### Dependencies
None

### Related findings
SEC-005

## [ ] SEC-006 — Harden GitHub Actions trust and permissions

**Priority:** P3  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** Supply chain / CI

### Files
- `.github/workflows/ci.yml`

### Problem
Actions use mutable major tags and the job relies on implicit token permissions.

### Evidence
`ci.yml:9-23`.

### Required change
Set `contents: read`, SHA-pin reviewed actions, retain dependabot/update guidance.

### Acceptance criteria
- [ ] Workflow token has only required permissions.
- [ ] Third-party/action references are immutable SHAs with version comments.
- [ ] Pull-request CI still passes without secrets.

### Verification
Validate workflow syntax and run it on a test pull request.

### Dependencies
None

### Related findings
SEC-006

## [ ] SEC-007 — Normalize login identity once

**Priority:** P3  
**Severity:** Low  
**Confidence:** Medium  
**Effort:** Small  
**Area:** Security / Authentication correctness

### Files
- `api/auth.js`
- `api/secure-settings.js`

### Problem
Rate limiting lowercases login identifiers while database lookup uses raw input.

### Evidence
`auth.js:67-104`; account creation at `secure-settings.js:503-515`.

### Required change
Document case semantics and normalize once before lookup and all limiter keys.

### Acceptance criteria
- [ ] Intended mixed-case login behavior is explicit and tested.
- [ ] Equivalent spellings consume the same limiter buckets.
- [ ] Generic failure/timing protections remain.

### Verification
Run mixed-case success/failure/rate-limit integration cases.

### Dependencies
None

### Related findings
SEC-007

## [ ] A11Y-004 — Respect reduced-motion preferences

**Priority:** P3  
**Severity:** Low  
**Confidence:** Medium  
**Effort:** Small  
**Area:** Accessibility / Motion

### Files
- `client/src/components/layout.tsx`
- `client/src/index.css`
- spinner call sites

### Problem
Route fades and indefinite animations have no repository-wide reduced-motion path.

### Evidence
`layout.tsx:440-443`; no `prefers-reduced-motion` rule found.

### Required change
Disable/minimize nonessential transitions and spinner animation under the OS preference.

### Acceptance criteria
- [ ] Reduced-motion media query changes nonessential animation.
- [ ] Loading state remains perceivable without motion.
- [ ] Normal preference retains intended animation.

### Verification
Use browser emulation for both preference values on representative routes.

### Dependencies
None

### Related findings
A11Y-004

## [ ] DOC-001 — Correct runtime/PDF documentation and add API matrix

**Priority:** P3  
**Severity:** Low  
**Confidence:** High  
**Effort:** Small  
**Area:** Documentation

### Files
- `README.md`
- `client/src/index.css`
- `docs/README.md`

### Problem
React version and PDF architecture claims are stale; API method/auth contracts are implicit.

### Evidence
`README.md:14-18`, `index.css:261-269`, manifest and client PDF module.

### Required change
Correct implementation facts and document endpoint/action, method, role, CSRF and principal response shapes.

### Acceptance criteria
- [ ] Framework versions match the lock/manifest.
- [ ] PDF generation is accurately described as client-side.
- [ ] All eight routes and cron action are in an auth/method matrix.
- [ ] Difficult public interfaces include concise JSDoc purpose, inputs, output,
  errors, side effects and edge cases rather than duplicating implementation.

### Verification
Cross-check docs against `package.json`, `vercel.json`, API dispatch branches and build output.

### Dependencies
None

### Related findings
DOC-001

## [ ] ARCH-001 — Decide the fate of `site_settings`

**Priority:** P3  
**Severity:** Informational  
**Confidence:** Medium  
**Effort:** Small investigation  
**Area:** Architecture / Dead code

### Files
- `shared/schema.ts`
- migrations/docs depending on decision

### Problem
The schema/type has no repository caller but external/legacy consumers are unverified.

### Evidence
`shared/schema.ts:114-120,219,232,244`; reverse repository search found no SQL/API/UI use.

### Required change
Check production catalog/data/history and external consumers; document ownership or safely deprecate/migrate/remove.

### Acceptance criteria
- [ ] Production row count and known consumers are recorded.
- [ ] Retain/remove decision and rollback are documented.
- [ ] Removal, if chosen, is staged and does not silently destroy needed data.

### Verification
Run catalog/query audit in approved environment and repository reverse search.

### Dependencies
Production database access

### Related findings
ARCH-001
