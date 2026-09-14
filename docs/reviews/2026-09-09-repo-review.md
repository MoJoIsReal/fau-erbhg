# Comprehensive Repository Review

**Review date:** 2026-09-09  
**Verification:** static/manual review plus successful type-check, smoke-test and
production build. Production infrastructure and provider integrations were not
available.

## 1. Executive summary

The repository has a coherent small-system architecture and notably good
security foundations: server-side RBAC, revocable JWT sessions, double-submit
CSRF, parameterized SQL, layered HTML sanitization, restrictive security
headers, upload ownership checks and login throttling. No Critical security
vulnerability or supported authentication/authorization bypass was found.

It is **not yet safe to describe the system as predictably reliable end to end**.
The highest risks are correctness rather than conventional compromise:
newsletter work is irreversibly marked complete before delivery, concurrent
photo registrations can receive the same slot, a tooltip calls the wrong API,
and several multi-step database/provider workflows lack durable atomicity.
Testing is too shallow to catch those failures. Calendar controls also exclude
keyboard users.

**Verdict: Requires significant remediation.** Existing architecture need not be
replaced, but P1 delivery, concurrency, broken-contract and test work should
precede substantial feature development.

## 2. Repository architecture

The browser runs React 19/Vite/Wouter/TanStack Query. Eight Vercel handlers
perform HTTP dispatch, server-side policy and direct tagged Neon SQL. A ninth
cron handler performs mail and retention work. Shared TypeScript schema/types
describe PostgreSQL; migrations are manually applied through Neon. External
systems are Cloudinary, Gmail SMTP, Sentry and Vercel Analytics. There is no
queue, distributed cache, backend framework, service/repository layer, trigger,
view or stored procedure in tracked source. See [../architecture.md](../architecture.md).

Principal trust path:

```text
untrusted browser -> Vercel route -> JWT/RBAC + CSRF + sanitization
                  -> parameterized Neon SQL -> mapped JSON -> Query cache/UI
                  -> Cloudinary/Gmail/Sentry where applicable
```

## 3. Review coverage and method

| Area | Coverage |
|---|---:|
| Tracked frontend TS/TSX inventoried | 101 |
| Authored non-shadcn TS/TSX reviewed/search-audited | 54 |
| Feature/page TSX | 42 |
| API/shared/cron JS | 21/21 |
| Top-level API routes | 8/8 |
| Scheduled handlers | 1/1 |
| SQL migrations | 7/7 |
| Grouped UI/system trace flows | 30 (16 PASS, 12 PARTIAL, 2 FAIL) |
| Active application tables traced | 12; 1 possible legacy orphan |

Reconnaissance covered manifests/lockfile, root configuration, CI/deployment,
routes, all SQL call sites, schema/migrations, API calls, interactive controls,
error/logging paths, tests and documentation. Automated checks were not treated
as proof of runtime behavior. Detailed trace evidence is in
[2026-09-09-traceability-matrix.md](2026-09-09-traceability-matrix.md).

## 4. Scorecard

| Category | Score | Justification |
|---|---:|---|
| Security | 7/10 | Strong RBAC/CSRF/SQL/XSS/header baseline; configuration, PII logging and upload binding gaps remain. |
| Performance | 6/10 | Route splitting/caching are good; sequential mail and a 1.42 MB PDF chunk are material. |
| Maintainability | 5/10 | Clear directories, but very large mixed-responsibility handlers/pages and untyped backend JS. |
| Architecture | 6/10 | Appropriate small serverless stack; side effects lack an outbox and invariants lack DB enforcement. |
| Code quality | 6/10 | Thoughtful sanitizers/mapping/CTEs coexist with inconsistent validation and responses. |
| Testability | 3/10 | Smoke tests pass, but core DB/API/browser/concurrency behavior has no harness. |
| Traceability | 6/10 | Most paths align; one proven wrong call and several partial transaction/contract paths. |
| Accessibility | 6/10 | Radix/form foundation is good; keyboard, bypass and naming failures remain. |
| Observability | 5/10 | Sentry/redaction exist; request correlation, metrics and mutation audit trails do not. |
| Documentation | 6/10 | Useful operations guidance, but stale runtime/PDF claims and no API contracts. |
| **Overall** | **5.5/10** | Reliability and regression-detection weaknesses dominate otherwise sound security fundamentals. |

## 5. Findings summary

Totals count unique findings below: **Critical 0; High 3; Medium 19; Low 9;
Informational 1.** Security: 7; trace/correctness/database/reliability: 10;
performance: 2; accessibility: 4; testing: 1; maintainability: 2;
observability: 1; documentation: 1. Some findings deliberately cross categories.

### Prioritized top findings

1. **DB-001:** newsletter recipients can permanently miss reminders.
2. **DB-002:** concurrent bookings can allocate duplicate photo slots.
3. **TRACE-001:** attendee tooltip deterministically calls the wrong endpoint.
4. **DB-003/DB-004:** attendance and event relationships can drift/orphan.
5. **REL-001:** overlapping cron execution can duplicate reminders.
6. **TEST-001:** no test tier exercises any of the above conditions.
7. **SEC-001:** deployed JWT secret quality is not enforced.
8. **SEC-002:** provider errors can bypass PII redaction.
9. **SEC-003:** upload claims are not bound to provider-observed type.
10. **A11Y-001:** primary calendar editing is pointer-only.
11. **TRACE-004:** calendar PUT can turn bad input into a database 500.
12. **TRACE-007:** document deletion can leak external assets.
13. **PERF-001:** sequential delivery conflicts with the serverless time budget.
14. **MAINT-001:** large mixed-responsibility modules make safe change difficult.

## 6. Detailed findings

Each status is `CONFIRMED`, `HIGH CONFIDENCE`, `POSSIBLE`, or `UNVERIFIED`.
Unless stated otherwise verification was static/manual; suggested tests are not
currently present.

### DB-001 — Newsletter completion is lossy

**Category / priority / severity:** Reliability, database / P1 / High  
**Confidence / status:** High / CONFIRMED  
**Affected files/symbols:** `api/cron/event-reminders.js:124-205`, `broadcastNewsletter`  
**Description/evidence:** Both source tables are stamped before any recipient is
contacted (`:142-164`). Failed sends merely increment a counter and the cap exits
the loop (`:169-199`), leaving every item stamped.  
**Current → expected:** transient errors, timeout or recipient cap silently make
work non-retryable → each intended delivery must have durable, idempotent state.  
**Impact/root cause:** parents miss time-sensitive information; a single item
marker cannot represent per-recipient delivery and no outbox exists.  
**Remediation/implementation:** add an outbox/delivery table keyed by
`item-kind:item-id:subscriber-id`, with pending/claimed/sent/failed, lease,
attempt count and backoff. Mark source complete only when fan-out is complete.
A reset-on-partial patch is acceptable only as an interim control.  
**Tests:** injected mid-batch failure, cap, timeout/retry and two concurrent runs.  
**Dependencies / risk / effort:** TEST-001; medium migration/regression risk; Large.

### DB-002 — Photo-slot assignment races

**Category / priority / severity:** Correctness/concurrency / P1 / High  
**Confidence / status:** High / HIGH CONFIDENCE  
**Affected:** `api/registrations.js:214-285`, `assignPhotoSlots`; `migrations/0001_production_hardening.sql:14-15`  
**Evidence:** existing slots are read and computed before the atomic capacity CTE;
the only uniqueness constraint is event/email. Two requests can compute the same
free slots.  
**Current → expected:** duplicate appointments are possible → allocation must be
serialized per event or constrained per normalized slot.  
**Impact/root cause:** conflicting child appointments; application-side
read/compute/write has no lock/invariant.  
**Remediation:** transaction plus event row/advisory lock and recomputation, or
normalized slot rows with `UNIQUE(event_id, slot)`.  
**Tests:** simultaneous distinct-email registrations assert disjoint slots and
correct capacity.  
**Dependencies / risk / effort:** TEST-001; medium; Medium–Large.

### TRACE-001 — Attendee tooltip fetches events, not registrations

**Category / priority / severity:** Traceability/correctness / P1 / High  
**Confidence / status:** High / CONFIRMED (build verified)  
**Affected:** `client/src/components/attendee-tooltip.tsx:27-49`,
`client/src/lib/queryClient.ts:115-124`, `api/events.js:49-57`  
**Evidence:** the tooltip key is `['/api/events', eventId, 'registrations']`; the
default query function fetches only `queryKey[0]`, receives `Event[]`, then reads
registration names. The correct URL exists in `event-registrations-view.tsx:34-36`.  
**Current → expected:** wrong/undefined tooltip values → fetch
`/api/registrations?eventId=…` and use the authorized result shape.  
**Impact/root cause:** broken council UI; query key was mistaken for URL assembly.  
**Tests:** component/contract test with an event and named registrations.  
**Dependencies / risk / effort:** none; low; Extra small.

### DB-003 — Registration deletion is non-atomic

**Category / priority / severity:** Database correctness / P1 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/registrations.js:343-357`  
**Evidence:** registration DELETE and attendee decrement are separate autocommit
queries.  
**Current → expected:** interruption leaves an overstated counter → both changes
commit or roll back together.  
**Impact/root cause:** false capacity and rejected signups; missing transaction.  
**Remediation/tests:** one CTE/transaction returning both effects; force failure
after delete and assert no state change.  
**Dependencies / risk / effort:** TEST-001; low-medium; Small–Medium.

### DB-004 — Registration/event referential integrity is absent

**Category / priority / severity:** Database / P1 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `shared/schema.ts:39-55`, `api/events.js:199-219`, migration 0001  
**Evidence:** `event_id` is a plain integer; the migration creates indexes but no
FK; event deletion uses count then delete.  
**Current → expected:** concurrency/manual writes can orphan registrations → DB
must enforce the chosen RESTRICT/CASCADE rule.  
**Impact/root cause:** data integrity and retention failures.  
**Remediation/tests:** audit orphans, add FK in a staged migration, make delete
atomic, test concurrent delete/register and chosen cascade semantics.  
**Dependencies / risk / effort:** DB-003; medium migration risk; Medium.

### REL-001 — Overlapping cron runs may double-claim reminders

**Category / priority / severity:** Reliability/concurrency / P1 / Medium  
**Confidence / status:** High / HIGH CONFIDENCE  
**Affected:** `api/cron/event-reminders.js:261-293`  
**Evidence:** the candidate CTE checks a null marker but the UPDATE neither
reasserts null nor uses row locks/`SKIP LOCKED`. Exact Neon behavior needs a
concurrency test.  
**Current → expected:** overlap may send duplicates → claims must be exclusive
and retryable.  
**Remediation/tests:** lease-based outbox or atomic locked claim; run two workers
against PostgreSQL and assert one delivery.  
**Dependencies / risk / effort:** DB-001, TEST-001; medium; Medium.

### SEC-001 — JWT configuration does not enforce key quality or context

**Category / priority / severity:** Security/authentication / P1 / Medium  
**Confidence / status:** Medium / POSSIBLE  
**Mappings:** CWE-321/326; OWASP A02; ASVS V6  
**Affected:** `api/auth.js:63-65,120-130`; `api/_shared/middleware.js:238-265`  
**Attack prerequisite/path:** a deployment uses a short, reused or placeholder
HMAC secret; an attacker guesses it offline and forges user ID/token version.
Database role refresh limits claims but then grants the selected account's role.  
**Impact:** potential administrative impersonation; production entropy is
unverified.  
**Remediation:** startup config schema requiring ≥32 random bytes; explicitly
bind HS256, issuer and audience; rotate production secret.  
**Tests:** reject absent/short/placeholder/wrong alg/aud/iss and accept a valid
token.  
**Regression risk / effort:** medium (existing tokens rotate); Small–Medium.

### SEC-002 — Mail-provider failures can bypass PII redaction

**Category / priority / severity:** Security/privacy / P1 / Medium  
**Confidence / status:** High / HIGH CONFIDENCE  
**Mappings:** CWE-532; OWASP A09; ASVS V14  
**Affected:** `api/contact.js:104-145,270-277`;
`api/registrations.js:308-324`; compare `middleware.js:26-33`  
**Attack prerequisite/path:** public PII enters mail; Nodemailer returns an error
containing envelope/rejected-recipient data; raw error goes to console/Sentry.  
**Impact:** parent data may enter third-party telemetry retention. Exact provider
payload is runtime-dependent.  
**Remediation/tests:** one shared sanitized mail-error logger/Sentry wrapper;
synthetic envelope/body errors must contain no email/phone after capture.  
**Regression risk / effort:** low; Small.

### SEC-003 — Upload type claims are not bound to observed asset metadata

**Category / priority / severity:** Security/file handling / P1 / Medium  
**Confidence / status:** High / HIGH CONFIDENCE gap, exploitability POSSIBLE  
**Mappings:** CWE-434; OWASP A04/API8  
**Affected:** `api/upload.js:44-70,91-98,136-179`;
`api/_shared/upload-validation.js:35-61`; `api/documents.js:13-66`  
**Attack prerequisite/path:** authenticated council user submits mismatched
filename/MIME/size; completion verifies provider ID and bytes but persists the
client MIME without checking provider format/resource type.  
**Impact:** misleading/public file content; Cloudinary behavior limits but does
not prove safety.  
**Remediation:** MIME-extension map, finite non-negative size, compare provider
metadata, safe download disposition, and consider malware/content inspection.  
**Tests:** renamed HTML, mismatch, negative/NaN/oversize and unexpected provider
metadata.  
**Regression risk / effort:** medium for existing formats; Medium.

### TRACE-002 — Messages frontend guard disagrees with API policy

**Category / priority / severity:** Authorization contract / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `client/src/App.tsx:138-141`; `api/secure-settings.js:339-344`  
**Evidence/current behavior:** members pass the direct route guard, then every
request returns 403; the menu correctly hides the route.  
**Expected/remediation:** make route admin-only and render a stable forbidden or
redirect state; retain backend enforcement.  
**Impact:** confusing broken navigation, not an authorization bypass.  
**Tests / risk / effort:** member/admin route tests; low; Extra small.

### TRACE-004 — Yearly-calendar PUT omits required field validation

**Category / priority / severity:** API contract / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/yearly-calendar.js:320-370`; `shared/schema.ts:173-179`  
**Evidence:** POST validates school/year/month, PUT checks only type/title and can
send null to NOT NULL columns. Current UI sends complete objects, but old or
crafted clients receive 500.  
**Remediation:** choose full-replacement PUT or partial PATCH semantics, validate
with one shared server schema, return 400/422.  
**Tests / risk / effort:** missing/null/range/date boundaries plus current full
body; low; Small.

### TRACE-007 — Document deletion can orphan Cloudinary assets

**Category / priority / severity:** External consistency / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/documents.js:83-107`, DELETE handler  
**Evidence:** DB metadata is deleted first; provider cleanup failures are caught
and success is returned, removing the only durable cleanup reference.  
**Remediation:** durable deletion state/outbox with retries, or provider-first
workflow plus idempotent reconciliation.  
**Tests / risk / effort:** simulated provider failure and retry; medium; Medium.

### PERF-001 — PDF chunk is exceptionally large

**Category / priority / severity:** Frontend performance / P2 / Medium  
**Confidence / status:** High / CONFIRMED by build  
**Affected:** `client/src/lib/yearly-calendar-pdf.tsx`; Vite output  
**Evidence:** production build emitted `yearly-calendar-pdf` at 1,424.62 kB
minified / 478.77 kB gzip and warned above 500 kB.  
**Current → expected:** calendar users may download the PDF renderer before use →
load it only when export is invoked, and measure.  
**Remediation:** ensure the PDF module and fonts are dynamic-imported at the
button boundary; key is route/export action, lifetime browser cache, immutable
hash invalidation, public/no tenant data.  
**Tests / risk / effort:** bundle budget and network trace; low; Small.

### PERF-002 — Newsletter network work is serial under 30 seconds

**Category / priority / severity:** Performance / P1 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/cron/event-reminders.js:173-199`; `vercel.json:5-8`  
**Evidence:** O(items × subscribers) sequential SMTP awaits run inside a
30-second function.  
**Impact:** high at growth and compounds DB-001.  
**Remediation:** durable outbox worker with bounded concurrency and provider rate
limits; capture queue age, attempts and duration. Avoid an in-memory cache.  
**Tests / risk / effort:** latency simulation at cap; medium; Large with DB-001.

### A11Y-001 — Calendar edit/move controls are pointer-only

**Category / priority / severity:** Accessibility / P1 / Medium  
**Confidence / status:** High / CONFIRMED static  
**WCAG:** 2.1.1, 4.1.2  
**Affected:** `client/src/pages/yearly-calendar.tsx:328-348,429-434,840-850,931-938`  
**Evidence:** clickable `div` has no button semantics/tab/key handling and DnD
sensors are mouse/touch only.  
**Impact:** keyboard/switch users cannot perform a primary administrative task.  
**Remediation:** semantic edit button plus KeyboardSensor/coordinate getter or
explicit Move controls; preserve pointer behavior.  
**Tests / risk / effort:** keyboard-only create/edit/move and screen-reader name;
medium; Medium.

### A11Y-002 — No bypass link for repeated sticky navigation

**Category / priority / severity:** Accessibility / P2 / Medium  
**Confidence / status:** High / CONFIRMED static  
**WCAG:** 2.4.1 (focus obscuration requires runtime verification)  
**Affected:** `client/src/components/layout.tsx:91-111,438-443`  
**Remediation:** first-focusable localized skip link and focusable
`#main-content`; test at 200%/400% zoom with sticky header.  
**Risk / effort:** low; Small.

### A11Y-003 — File remove icon lacks an accessible name

**Category / priority / severity:** Accessibility / P2 / Medium  
**Confidence / status:** High / CONFIRMED; **WCAG:** 4.1.2  
**Affected:** `client/src/components/file-upload-modal.tsx:299-312`  
**Remediation/tests:** localized `aria-label` including filename; role/name test
in both languages. Low risk; Extra small.

### TEST-001 — Tests do not exercise the deployed stack

**Category / priority / severity:** Testing / P1 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `scripts/smoke-tests.mjs:186-259`; `.github/workflows/ci.yml:22-32`  
**Evidence:** CI only type-checks, runs one smoke script and builds; several
"tests" regex source text instead of behavior. There are no API+PostgreSQL,
browser, concurrency, RBAC matrix or automated accessibility tests.  
**Impact/root cause:** the three High findings compile and pass CI.  
**Remediation:** Vitest pure-unit tests, ephemeral PostgreSQL handler integration,
Playwright/axe flows; inject DB/mail/storage adapters.  
**Tests:** the harness itself must run deterministically in CI with assertions
for authorized/unauthorized/missing identity and concurrent workflows.  
**Risk / effort:** low production risk; Large.

### OBS-001 — Request and administrative audit telemetry is insufficient

**Category / priority / severity:** Observability / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/_shared/middleware.js:83-113`  
**Evidence:** centralized catch/redacted error/Sentry exist, but no request ID,
latency/status metric or durable actor/resource/outcome security event exists.  
**Remediation:** accept/generate correlation ID, structured low-PII completion
logs, latency/error/delivery metrics and append-only admin mutation events.  
**Tests / risk / effort:** propagation/redaction tests; avoid recording bodies;
medium privacy risk; Medium.

### MAINT-001 — Domain modules mix too many responsibilities

**Category / priority / severity:** Maintainability/architecture / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/secure-settings.js` (647 lines), `api/registrations.js` (467),
`client/src/pages/yearly-calendar.tsx` (1,252)  
**Description:** dispatch, policy, SQL, email, algorithms, state and rendering are
co-located, increasing coupling and test setup.  
**Before → after:** monolithic handler/page → thin HTTP adapter + explicit domain
transaction scripts and pure calendar view models → transactional boundaries
and dependencies become testable.  
**Pattern:** Command/transaction-script plus ports/adapters. It fits discrete
serverless operations; a generic Repository alternative hides SQL invariants and
adds ceremony. Drawback is more files/interfaces; migrate one tested flow at a
time.  
**Risk / effort:** high without TEST-001; Large.

### MAINT-002 — Backend JavaScript is outside strict type checking

**Category / priority / severity:** Type safety / P2 / Medium  
**Confidence / status:** High / CONFIRMED  
**Affected:** `tsconfig.json:2-18`, all `api/**/*.js`  
**Evidence:** JavaScript is allowed but `checkJs` is false, so request/SQL/DTO
contract mismatches escape `npm run check`.  
**Remediation:** incremental checked JSDoc or TypeScript conversion, explicit
Zod request/response schemas and typed adapter interfaces.  
**Tests / risk / effort:** enable by directory with no-error gate; medium; Large.

### DB-005 — Domain values and ranges lack database constraints

**Category / priority / severity:** Database / P2 / Low  
**Confidence / status:** High / CONFIRMED  
**Affected:** `shared/schema.ts:13,28-31,72-73,87-89,176-203`  
**Evidence:** roles/statuses/types/month/week/weekday are free text/integers.  
**Remediation:** measure/audit live data, then staged NOT VALID/validated CHECK
constraints; preserve write cost/selectivity and translate violations.  
**Tests / risk / effort:** invalid direct SQL and API boundaries; medium
migration risk; Medium.

### TRACE-005 — Mutation response casing is inconsistent

**Category / priority / severity:** API contract / P3 / Low  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/secure-settings.js:69-109,197-243,313-332`  
**Evidence:** GET aliases camelCase while mutation `RETURNING *` yields snake_case.
Current callers mostly refetch.  
**Remediation/tests:** centralized resource mappers and response-schema contract
tests; low risk; Small.

### TRACE-006 — Several deletes accept malformed IDs and false-success

**Category / priority / severity:** API/error semantics / P3 / Low  
**Confidence / status:** High / CONFIRMED  
**Affected:** `api/secure-settings.js:113-125,246-259,467-480`  
**Remediation:** strict positive integer parser, `RETURNING id`, 404 on absence,
consistent error envelope. Invalid/stale ID tests. Low risk; Small.

### SEC-004 — Document attribution is request-controlled

**Category / priority / severity:** Security/audit integrity / P2 / Low  
**Confidence / status:** High / CONFIRMED; **CWE:** 345  
**Affected:** `api/upload.js:25-42,154-179`  
**Attack path/impact:** any council user supplies another `uploadedBy`; audit
history is misleading. Derive it from authenticated identity. Spoof regression
test. Low risk; Small.

### SEC-005 — Account rate-limit keys persist cleartext identifiers

**Category / priority / severity:** Security/privacy / P3 / Low  
**Confidence / status:** High / CONFIRMED; **CWE:** 359/532  
**Affected:** `api/auth.js:67-86`; `api/_shared/rate-limit.js:10-38`  
**Evidence:** ordinary keys hash identifiers but account-only key embeds username.
Use a hashed/keyed IP-independent key and assert adapter input is opaque. Low
risk; Small.

### SEC-006 — CI uses mutable action tags and implicit permissions

**Category / priority / severity:** Supply chain / P3 / Low  
**Confidence / status:** High / CONFIRMED; **CWE:** 829  
**Affected:** `.github/workflows/ci.yml:9-23`  
**Remediation:** `permissions: contents: read`, SHA-pin reviewed checkout/setup
actions and document update cadence. No secrets/dynamic shell currently limit
impact. Low risk; Small.

### SEC-007 — Login identifier normalization is inconsistent

**Category / priority / severity:** Security/correctness / P3 / Low  
**Confidence / status:** Medium / POSSIBLE; **CWE:** 178  
**Affected:** `api/auth.js:67-104`; `api/secure-settings.js:503-515`  
**Evidence:** limiter lowercases while login lookup uses raw value and creation
normalizes email. Normalize once before both; test mixed case. Actual intended DB
case semantics are unverified. Low risk; Small.

### A11Y-004 — Reduced-motion behavior is absent

**Category / priority / severity:** Accessibility / P3 / Low  
**Confidence / status:** Medium / HIGH CONFIDENCE static  
**Affected:** `client/src/components/layout.tsx:440-443`, global styles  
**Evidence:** route fade and indefinite spinners exist; repository search found
no `prefers-reduced-motion`. Add reduced-motion variants and runtime preference
test. Low risk; Small.

### DOC-001 — Runtime and PDF documentation is stale

**Category / priority / severity:** Documentation / P3 / Low  
**Confidence / status:** High / CONFIRMED  
**Affected:** `README.md:14-18`; `client/src/index.css:261-269`;
`client/src/lib/yearly-calendar-pdf.tsx`; `package.json`  
**Evidence:** README says React 18 while manifest is 19.2.7; CSS refers to a
nonexistent server Puppeteer renderer although PDF generation is client-side.
Update claims and add an API/auth matrix. Extra small.

### ARCH-001 — `site_settings` is an apparent legacy orphan

**Category / priority / severity:** Architecture/dead code / P3 / Informational  
**Confidence / status:** Medium / POSSIBLE  
**Affected:** `shared/schema.ts:114-120,219,232,244`  
**Evidence:** repository-wide reverse trace found schema/types but no endpoint or
UI/SQL caller. Confirm production consumers/history before removal. Document or
deprecate/migrate it. Medium regression uncertainty; Small investigation.

## 7. Security audit and verification matrix

| Control | Reviewed | Result/findings | Confidence |
|---|---|---|---|
| Access control / API1, API5 / ASVS V8 | Yes, every sensitive method | No bypass; TRACE-002 UI mismatch | High |
| Authentication/session / ASVS V6 | Yes | SEC-001, SEC-007 | Medium–High |
| CSRF/CORS/browser headers | Yes | No confirmed defect | High |
| Injection/SQL / A05 | Yes, all SQL call sites | Tagged parameter bindings; no concatenated input | High |
| XSS/content / A05 | Yes | Server allowlist + DOMPurify retained | High |
| Upload/file / API8 | Yes | SEC-003, SEC-004 | High gap; medium exploit confidence |
| Secrets/PII/logging / A09 | Current tree/history spot-check | SEC-002, SEC-005; no committed secret found | Medium–High |
| Cryptography | JWT/CSRF/tokens/passwords | SEC-001; sound crypto RNG/bcrypt patterns | Medium–High |
| Business logic/concurrency | registration, mail, deletes | DB-001–004, REL-001 | High |
| Supply chain/CI / A08 | Manifest/lock/workflow | SEC-006; CVE scan blocked | Medium |
| SSRF/XXE/command/deserialization | All external input/request paths | No supported sink found | High static |

Positive controls worth retaining include the explicit CORS allowlist and Vary
header (`middleware.js:41-59`); random timing-safe CSRF (`:171-214`); Secure,
HttpOnly, Strict cookies (`auth.js:25-39`); current-role/token-version refresh
(`middleware.js:238-315`); generic login failures, dummy bcrypt and multi-axis
limits (`auth.js:67-113`); public registration aggregates instead of PII
(`registrations.js:47-83`); server HTML allowlist plus client DOMPurify; global
CSP/HSTS/frame/MIME/referrer policies (`vercel.json:26-63`); and production cron
fail-closed authorization (`event-reminders.js:13-18,240-247`).

## 8. Performance and database audit

The capacity CTE is a strong pattern: reserve, insert and rollback happen within
one statement. Existing indexes support registration-by-event/email, subscriber
status, document category, blog category/status and calendar year/month. The
material risks are network-bound batch delivery, concurrency and denormalized
counter integrity—not micro-optimizations. Index recommendations require live
plans/selectivity and were intentionally not invented. APIs globally use
`no-store`; static hashed assets use immutable one-year caching. TanStack Query's
five-minute cache is appropriate and mutation invalidations are generally clear.

## 9. Maintainability, architecture and API consistency

The single backend and shared constants/schema are strengths. Error handling is
centralized and production responses suppress details. However raw JavaScript
handlers and raw SQL result shapes create a contract gap; several `RETURNING *`
paths demonstrate it. Refactor only behind tests. The preferred outbox and
transaction-script patterns solve observed side-effect/atomicity problems;
introducing a generic repository or mediator everywhere would not.

## 10. Accessibility audit

Static WCAG 2.2 AA inspection found keyboard, bypass and accessible-name issues
listed above. Radix dialogs/menus and React Hook Form primitives offer a good
semantic/focus foundation, and existing smoke guards cover a few icon names.
Color contrast, 200/400% reflow, focus-not-obscured, modal focus return, target
size, touch behavior and screen-reader announcements require browser and
assistive-technology verification; no automated scanner can settle those alone.

## 11. Testing, observability and documentation

`npm run check`, `npm test` and `npm run build` pass. The smoke suite does test
useful pure sanitization, password, slot and calendar helpers, but source-regex
assertions do not protect runtime behavior. There is no deploy-equivalent
database integration suite. Sentry and redaction are positive; correlation,
latency/delivery metrics and an admin audit ledger are missing. Deployment docs
are useful, while API contracts and two current implementation facts are stale.

## 12. Remediation roadmap

### Phase 1 — Stop-the-line risks

No supported Critical exploit exists. Treat DB-001, DB-002 and TRACE-001 as the
immediate reliability stop line; add narrow regression/concurrency tests while
fixing them. SEC-001 production configuration validation can proceed in parallel.

### Phase 2 — Functional integrity

Complete TEST-001's integration foundation, then DB-003/004, REL-001,
TRACE-002/004/007 and SEC-002/003. Database constraints depend on a production
data audit. Provider workflows depend on injectable adapters.

### Phase 3 — Reliability and performance

Implement the shared durable outbox for newsletter delivery and asset cleanup,
bounded mail concurrency, retry metrics and reconciliation. Lazy-load/measure PDF
generation. This phase builds on Phase 2's integration harness.

### Phase 4 — Maintainability

Extract tested domain commands and typed contracts one vertical flow at a time;
enable checked backend types incrementally. Do not perform a big-bang rewrite.

### Phase 5 — Quality

Finish keyboard/skip/name/motion work, Playwright/axe/manual AT runs, CI pinning,
documentation and legacy schema disposition.

The atomic implementation backlog and dependency graph are in
[../review-backlog.md](../review-backlog.md).

## 13. Blocked and unverified areas

* `npm audit --omit=dev --audit-level=low` received HTTP 403 from the npm advisory
  endpoint; current dependency CVE status is **BLOCKED**, not clean.
* No production Neon connection/catalog/data/plans: privileges, RLS, schema drift,
  production-only triggers and data compatibility are **UNVERIFIED**.
* Gmail/Cloudinary/Sentry configuration, latency, error payload and retention are
  **UNVERIFIED**.
* Vercel overlapping execution and timeout behavior was manually reasoned, not
  integration tested.
* No live browser, penetration, CSP, screen-reader, keyboard, zoom/reflow,
  contrast, target-size or reduced-motion session was performed.
* Git history was spot-searched for likely secret patterns, not exhaustively
  scanned with a dedicated secret scanner.

## 14. Final engineering assessment

* **Security:** trustworthy as a good baseline, but not fully assured until
  deployment config, dependency CVEs, upload metadata and PII telemetry are
  verified.
* **Correctness:** ordinary primary flows mostly trace, but newsletter, photo
  concurrency and attendee tooltip cannot yet be trusted.
* **Performance:** acceptable at kindergarten scale except mail fan-out and the
  PDF payload; both have clear growth limits.
* **Maintainability:** engineers can modify localized areas, but high-risk modules
  need tests and decomposition before broad work.
* **Testability:** regressions are likely to escape current CI, especially across
  database/provider/concurrency boundaries.
* **Operational confidence:** moderate-low for deploying workflow changes;
  routine static frontend changes have higher confidence.
* **Technical debt:** moderate and partly architectural around side-effect
  durability, contracts and test infrastructure.
* **Recommendation:** **Requires significant remediation** before substantial
  feature work; no evidence warrants emergency shutdown for a security breach.
