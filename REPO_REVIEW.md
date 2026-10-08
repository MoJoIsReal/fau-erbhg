# Repository Review — FAU Erdal Barnehage

Commit reviewed: `041e0cf` (main, 2026-10-08). Read-only audit; no production code changed.
Working notes and full per-specialist evidence: [`.review/`](.review/) (`01-inventory.md`, `02-architecture.md`, `04-verification.md`, `findings-*.md`). Tasks: [`REVIEW_TASKS.md`](REVIEW_TASKS.md). Flow matrix: [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).

## 1. Executive summary

This is a small, coherent and unusually well-guarded codebase. Authentication, authorization, CSRF, SQL parameterization, HTML sanitization, upload verification and telemetry scrubbing were all traced end to end and hold. Every check passes: 515 of 515 offline tests, `npm run check` and `npm run build`. No critical finding and no data-corrupting defect was found.

The one material security weakness is the PIN that guards private media shares (photos and video of the children):

- **SEC-001 (P1, confirmed by running the real handler):** concurrent requests bypass the PIN lockout. One IP gets 120 guesses per 10 minutes instead of 5, so a 4-digit PIN can be exhausted in about 14 hours.
- **SEC-002 (P1):** even guessing one at a time, the per-share cap resets daily and 4-digit PINs are allowed. That gives about a 27% chance of hitting a random 4-digit PIN over the default 90-day lifetime. The same cap also lets any holder of the link lock every parent out.

The one broken core flow is the council attendee list:

- **TRACE-001 (P1, confirmed):** an expired council session gets `200 {count}` instead of an array or a 401. The view then throws, and the app-wide error boundary blanks the whole site.

The remaining work is targeted, not structural:

- **Correctness:** server error text shown untranslated (TRACE-003); retention SQL that would stop running on one bad legacy date (TRACE-002); `schema.ts`/migration drift that makes `db:push` dangerous (DB-001).
- **Mail abuse:** the association's Gmail repeats attacker-chosen text to unverified addresses (SEC-003); one caller can use up the shared daily mail cap (SEC-006).
- **Performance:** the public calendar ships the council editor to every visitor (PERF-001).
- **Diagnosability:** a database outage looks like "logged out" (OBS-001); request ids are mangled in logs (OBS-002).
- **Accessibility:** gaps on the public signup form (A11Y-001–003).

**Overall rating: Requires targeted remediation.** One focused security change (atomic, cumulative PIN attempt limits plus a longer minimum PIN) and one small contract fix (TRACE-001) remove the P1s. Everything else can follow incrementally.

## 2. Architecture overview

- **Frontend:** a React 19 SPA (Wouter, TanStack Query, RHF + zod, Tailwind 4 tokens), with a separate locked-down share page (`client/del.html`).
- **Backend:** 9 Vercel serverless handlers (`api/*.js`) plus 1 cron. Each one runs `withApiHandler` → `requireRole`/`requireCsrf` → `sanitize*` → Neon tagged-template SQL → a `map*` row mapper.
- **Database:** PostgreSQL on Neon. 18 tables and 20 hand-applied migrations.
- **Integrations:** Cloudinary (signed direct upload), R2 (presigned multipart for private media), Gmail SMTP, Turnstile and Sentry.
- **Background work:** PostgreSQL-backed outbox and claim columns, run by two daily crons.

The deliberate constraints — one backend, no ORM queries, query-param multiplexing under the 12-function cap — are documented in `AGENTS.md` and are respected. Existing architecture docs are current apart from small count drift (DOC-001), so no `ARCHITECTURE_REVIEW.md` was produced. The full map is in `.review/02-architecture.md`.

## 3. Coverage

All counts come from grep or `ls` over the repository.

| Item | Count | Reviewed |
|---|---|---|
| Source files (JS/TS/TSX/MJS/SQL, excluding `components/ui`, `node_modules`) | 212 (~41.5k lines) | all by grep; ~60 key files read in the cited ranges |
| SPA pages / feature components / `site` + other components | 14 pages, 43 components (non-`ui`), 19 shadcn primitives (excluded) | pages and form components for a11y and trace |
| HTML entry points | 2 (`index.html`, `del.html`) | both |
| Serverless functions | 10 (9 handlers + 1 cron) | 10 |
| Endpoint operations (method × action/resource, from dispatch lines) | 65: auth 5, contact 4, documents 3, events 7, media 11, registrations 6, secure-settings 19, upload 2, yearly-calendar 6, cron 2 | 65 for authz (matrix + trace); 15 flows end to end |
| `api/_shared` modules / exported functions | 21 / 116 | all modules |
| SQL tagged-template statements in `api/` | 111 | all for injection (grep); hot paths read |
| DB tables / migrations | 18 / 20 | all |
| SPA routes | 27 | all, via reverse trace |
| Test suites | 46 offline (515 tests) + 1 integration | offline run; integration not run |
| Traced flows | 15 | 6 PASS · 8 PARTIAL · 1 FAIL · 0 DEAD · 0 ORPHANED |

## 4. Scorecard

| Dimension | Score | Evidence |
|---|---|---|
| Security | 7/10 | Strong authN/Z (DB-reloaded identity, token_version revocation, constant-time CSRF, full role matrix test), no injection, XSS or SSRF. Docked for the confirmed PIN brute-force path (SEC-001/002) and mail abuse (SEC-003/006). |
| Performance | 7/10 | Set-based SQL, short locks, lazy routes, stale-chunk recovery. `/kalender` ships 515 kB gz incl. the editor (PERF-001); the share grid loads full-resolution originals (PERF-002). |
| Maintainability | 7/10 | Small, consistent handlers and explicit field lists. Three error-handling conventions (MAINT-002), mapper bypass on creates (MAINT-003), a type ratchet counting noise (MAINT-001). |
| Architecture | 8/10 | One backend, a clear `shared/` boundary, documented trade-offs, durable outbox. Schema declaration vs migrations drift (DB-001). |
| Code quality | 7/10 | Careful comments and invariants. A few comments contradict the code (`contact-emails.js:48`, `media.js:351`, `media.js:94-96`). |
| Testability | 7/10 | 515 offline tests, a handler harness, authz meta-test, isolated PostgreSQL job. Gaps: secure-settings mutations (TEST-001), migration completeness (TEST-002), concurrency of rate limits. |
| Traceability | 7/10 | Every client URL resolves and enums agree across tiers. 1 FAIL (TRACE-001) and untranslated error contracts (TRACE-003). |
| Accessibility | 6/10 | Good base (Radix dialogs, skip link, 44px tokens, dark-theme contrast ≥4.5:1). Unlabelled child-name inputs, hard-coded Norwegian labels and missing autocomplete on the main public form. |
| Observability | 6/10 | Structured, redacted logs with request ids. The ids themselves get redacted (OBS-002), a DB outage is masked as 401 (OBS-001), there is no target id in the audit trail, and media-purge failure is not alerted. |
| Documentation | 7/10 | Extensive AGENTS/docs. Drift on handler counts, the error convention (DOC-002) and timestamptz tables; README stale; privacy page behind features (DOC-005). |
| **Overall** | **7/10** | A trustworthy small system with one sensitive-data security gap and a short list of contract/diagnosability fixes. |

## 5. Prioritized findings

Confidence: CONF = CONFIRMED, HIGH, POSS = POSSIBLE, UNVER = UNVERIFIED. "Verified" means independently reproduced in Phase 4 (see `.review/04-verification.md`).

| ID | P | Sev | Conf | Title | Location |
|---|---|---|---|---|---|
| SEC-001 | P1 | High | CONF (verified) | PIN and account-wide lockouts are check→bcrypt→record; concurrent guesses bypass them | `api/media.js:192-214`, `api/auth.js:151-183`, `api/_shared/rate-limit.js:75-88` |
| SEC-002 | P1 | Medium | CONF (verified) | Media PIN: no cumulative failure cap, 4-digit minimum, share-wide lock denies all viewers | `api/media.js:97-100,200,210-214,288-292`, `shared/media.js:77-89` |
| TRACE-001 | P1 | Medium | CONF | Registrations GET answers an expired council session with `200 {count}` → `.reduce` TypeError blanks the app | `api/registrations.js:232-277`, `client/src/components/event-registrations-view.tsx:35,137`, `attendee-tooltip.tsx:27,43` |
| SEC-003 | P2 | Medium | CONF (verified) | Confirmation and contact receipts echo attacker-chosen name/child names to unverified addresses | `api/registrations.js:661-767`, `api/_shared/contact-emails.js:56-98` |
| SEC-006 | P2 | Low | CONF | One caller can exhaust the shared public-mail cap; dropped mail held the only cancel link | `api/_shared/rate-limit.js:102-117` |
| SEC-005 | P2 | Low | CONF | Public yearly-calendar GET exposes `createdBy` (staff names, e-mail fallback) | `api/yearly-calendar.js:69,183-207` |
| TRACE-002 | P2 | Medium | POSS | Retention casts text dates; one bad legacy value stops GDPR deletion daily | `api/cron/event-reminders.js:529-552` |
| DB-001 | P2 | Medium | POSS | `schema.ts` omits the unique `(event_id, lower(email))` index and other migration-only objects; `db:push` could drop them; `registered_at` default non-ISO | `shared/schema.ts:43-69`, `migrations/0001_production_hardening.sql:8,14`, `package.json:17` |
| TRACE-003 | P2 | Medium | CONF | Server `error` text shown untranslated in most mutation toasts (no `code`) | `client/src/lib/queryClient.ts:15` + 15 callers |
| OBS-001 | P2 | Medium | CONF | DB outage / bad `SESSION_SECRET` answered as 401 "logged out", no error event | `api/_shared/middleware.js:309-344` |
| OBS-002 | P2 | Medium | HIGH | Request ids mangled by phone-number redaction in logs | `api/_shared/log.js:58-64`, `redact.js:9` |
| OBS-005 | P2 | Low | CONF | Media-purge and stage failures never reach the cron alert | `api/cron/event-reminders.js:674-729` |
| MAINT-002 | P2 | Medium | CONF | Three error-handling conventions; 500s logged twice; un-awaited Sentry capture | `api/contact.js:169-171…`, `api/upload.js:203-205`, `api/registrations.js:358-365` |
| MAINT-003 | P2 | Medium | CONF | Creation endpoints bypass `map*`: raw rows, PII echo, deny-list on public signup | `api/contact.js:124-168`, `api/upload.js:185-199`, `api/registrations.js:612-614`, `api/documents.js:50-60` |
| PERF-001 | P2 | Medium | CONF | `/kalender` statically loads the council editor (TipTap + modals) for every visitor | `client/src/components/calendar-editor-tools.tsx:24-27` |
| PERF-002 | P2 | Medium | HIGH | Share grid renders full-resolution originals as thumbnails | `client/src/share/share-page.tsx:277-286` |
| PERF-003 | P2 | Medium | UNVER | Function and Neon regions are not pinned or recorded | `vercel.json`, `api/_shared/database.js:27` |
| TEST-001 | P2 | Medium | CONF | secure-settings mutations tested only for authorization | `api/secure-settings.js` (CRUD branches) |
| TEST-002 | P2 | Medium | CONF | Integration fixture builds base tables from `schema.ts`, so incomplete migrations pass CI | `tests/integration/postgres-fixture.mjs:89-104` |
| DOC-002 | P2 | Medium | CONF | AGENTS.md "throw with a status" is not honoured by `handleError` | `AGENTS.md:65,222`, `api/_shared/middleware.js:135` |
| DOC-005 | P2 | Medium | CONF | Privacy page omits newsletter data, R2 media sharing, Sentry/Analytics, two cookies | `client/src/pages/privacy.tsx:15-110` |
| A11Y-001 | P2 | Medium | CONF | Photo-day child-name inputs have no label; errors toast-only | `client/src/components/event-registration-modal.tsx:349-361` |
| A11Y-002 | P2 | Medium | CONF | Hard-coded Norwegian labels on the public signup form | `event-registration-modal.tsx:279-306,431-435` |
| A11Y-003 | P2 | Medium | CONF | Identity and credential fields lack `autocomplete` | `login-modal.tsx:72-91`, `password-change-modal.tsx:72-100`, signup, newsletter |
| SEC-004 | P3 | Low | CONF | change-password current-password check has no attempt limit | `api/auth.js:260-296` |
| SEC-007 | P3 | Low | POSS | Newsletter confirm/unsubscribe POST on page load (mail scanners) | `client/src/pages/newsletter.tsx:50-58` |
| SEC-008 | P3 | Low | CONF | Newsletter confirmation tokens never expire | `api/contact.js:314-349` |
| SEC-009 | P3 | Low | CONF | Rate-limit keys are unsalted SHA-256 of IP/e-mail (reversible) | `api/_shared/rate-limit.js:28-44` |
| SEC-010 | P3 | Low | POSS | Per-IP limits key on the full IPv6 address | `api/_shared/rate-limit.js:11-37` |
| SEC-011 | P3 | Low | CONF | Temporary passwords mailed in clear and never expire | `api/secure-settings.js:672-700` |
| SEC-012 | P3 | Low | CONF | `.gitignore` misses `.env.production/.development/.preview` | `.gitignore:12-17` |
| SEC-013 | P3 | Low | CONF | CSP allows unused `browser.sentry-cdn.com`, `img-src https:`, `connect-src data:` | `vercel.json:76` |
| SEC-014 | P3 | Low | CONF | `sanitizeHtml` truncates after sanitizing (cut mid-tag) | `api/_shared/middleware.js:527-589` |
| SEC-015 | P3 | Low | HIGH | Media quota and file-count checks race under concurrent `upload-init` | `api/media.js:342-360` |
| SEC-016 | P3 | Low | HIGH | `npm audit` high (source-map-js) unreachable as wired; audit stays red | `package-lock.json` (postcss ← sanitize-html) |
| TRACE-004 | P3 | Low | POSS | Kindergarten info GET reads newest row, PUT updates oldest | `api/secure-settings.js:425-430,479` |
| TRACE-005 | P3 | Low | CONF | Reminder and council mails print raw stored values (`["09:00"]`, enum `concern`) | `api/cron/event-reminders.js:138,155`, `api/contact.js:188,198` |
| TRACE-006 | P3 | Low | CONF | Cache-invalidation gaps after public signup/cancel | `registration-cancel.tsx:176-184`, `event-registration-modal.tsx:112-113` |
| TRACE-007 | P3 | Low | POSS | Documents with null URL or other category can't be managed | `api/documents.js:96`, `client/src/pages/files.tsx:42,124` |
| PERF-004 | P3 | Low | CONF | Drizzle pg-core ships to `/contact` and `/kalender` (67 kB gz) for form schemas | `event-registration-modal.tsx:14`, `contact.tsx:25` |
| PERF-005 | P3 | Low | HIGH | Public reads uncached; `/api/events` unbounded; calendar fans out to 4 calls | `api/events.js:308-318`, `useCalendarEntries.ts:28-38` |
| PERF-006 | P3 | Low | HIGH | Nightly mail per-run cap; overflowed event mail is later skipped | `api/cron/event-reminders.js:33-34,305-323` |
| PERF-007 | P3 | Low | HIGH | Render-blocking Google Fonts CSS; hero discovered after lazy route | `client/index.html:22-23`, `App.tsx:11` |
| OBS-003 | P3 | Medium | CONF | Audit log records actor but not target id; no drain/audit table | `api/_shared/log.js:98-107` |
| OBS-004 | P3 | Low | CONF | Error events lack request context and release; users never see request id | `api/_shared/sentry.js:26-53`, `client/src/main.tsx:17-26` |
| MAINT-001 | P3 | Medium | CONF | Backend type ratchet counts totals; 27 of 50 are schema.ts config noise | `scripts/check-backend-types.mjs:31` |
| MAINT-004 | P3 | Low | CONF | Dead/disconnected: `DELIVERY_LEASE_MINUTES`, `isTurnstileEnabled`, `MEDIA_ERROR_CODES` | `api/_shared/delivery.js:4` … |
| MAINT-005 | P3 | Low | CONF | Signup branch (~335 lines) and confirmation mail inline, untested | `api/registrations.js:281-616,661-767` |
| TEST-003 | P3 | Low | CONF | Council registration list/DELETE and confirmation mail only source-regex guarded | `api/registrations.js:228-270,617-651` |
| DOC-001 | P3 | Low | CONF | Handler/function counts and media routing wrong in docs | `docs/architecture.md:8,27-35`, `DEPLOYMENT.md:8`, `log.js:6` |
| DOC-003 | P3 | Low | CONF | AGENTS.md says only `api_rate_limits` is timestamptz | `AGENTS.md:217-218` |
| DOC-004 | P3 | Low | CONF | README env list, auth and ORM descriptions stale | `README.md` |
| A11Y-004 | P3 | Medium | POSS | Several forms show errors only in a 5 s single-slot toast | `use-toast.ts:8`, login/password/yearly modals |
| A11Y-005 | P3 | Low | CONF | Icon-only mobile post-actions button unnamed | `client/src/pages/content.tsx:506-509` |
| A11Y-006 | P3 | Low | HIGH | Raw Tailwind colours bypass tokens (e.g. "(arkivert)" ≈3.6:1) | `content.tsx:554` + 127 utilities |
| A11Y-007 | P3 | Low | POSS | Month-grid chips show cancelled/category visually only | `client/src/components/calendar-view.tsx:436-460` |
| A11Y-008 | P3 | Low | CONF | `--color-subtle` on `--color-peach` is 4.39:1 (latent) | `client/src/index.css` tokens |

Totals: 57 findings — P0 0 · P1 3 · P2 21 · P3 33. By area: SEC 16 · TRACE 7 · DB 1 · PERF 7 · OBS 5 · MAINT 5 · TEST 3 · DOC 5 · A11Y 8.

## 6. Security

**What holds (verified):**
- **Identity:** reloaded from the DB on every request, with HS256/iss/aud pinned and `token_version` revocation (`middleware.js:292-345`).
- **Cookies:** HttpOnly, SameSite=Strict, Secure.
- **CSRF:** constant-time double-submit on every session mutation, including login.
- **Authorization matrix:** covers every `requireRole` route × role, with a meta-test (`tests/api-authorization.test.mjs:107-116`).
- **Login:** dummy-hash timing equalisation, three limits and a known-device cookie.
- **Mass assignment:** none (explicit field lists).
- **Capability tokens:** 244–256-bit CSPRNG. Media tokens are stored hashed and AES-GCM sealed; view grants are HMACs with constant-time compare.
- **Injection, XSS and SSRF:**
  - Only tagged-template SQL, and LIKE wildcards are escaped.
  - Two-layer HTML sanitizing: sanitize-html on the server, DOMPurify in `SafeHtml`, the only `dangerouslySetInnerHTML`.
  - The server never fetches user URLs.
- **Uploads:** owned Cloudinary URL and provider metadata are verified. For R2, type and length are signed into the URLs and magic bytes are checked.
- **Secrets:** none in the tree, history or `dist`. Errors are redacted unless `NODE_ENV=development`. CI uses `contents: read`.

**What doesn't:**
- **The media PIN is the weak link** (SEC-001, SEC-002). The lockout is not atomic: the verifier ran 1,200 concurrent guesses across 10 IPs with zero lockouts. The sequential budget never accumulates, the PIN may be 4 digits, and the share-wide lock can be turned against legitimate parents. The asset is private photos and video of children; the precondition is holding a forwarded link.
- **Public mail can be abused:** phishing text relayed through FAU's Gmail (SEC-003), and starvation of confirmation mail that carries the only cancel link (SEC-006).
- **The rest are Low** (SEC-004…016) and defence in depth.

**Open questions:**
- **Turnstile** is fail-open by design, and production enablement is unverified.
- **`x-real-ip` trust** assumes Vercel's edge overwrites the header.

## 7. Traceability

15 flows traced UI → DB → UI: 6 PASS, 8 PARTIAL, 1 FAIL, 0 DEAD, 0 ORPHANED (see `TRACEABILITY_MATRIX.md`).

**The FAIL is F-05** (council attendee list, TRACE-001): the public-aggregate fallback answers a lapsed council session with a different JSON shape, under a 200 status.

**Contract drift:**
- Untranslated server refusals (TRACE-003), contrary to AGENTS.md's "key off `code`".
- Creation endpoints returning raw rows (MAINT-003).
- Wrong client `Document` type (in MAINT-003).
- Kindergarten info GET and PUT selecting different rows (TRACE-004).

**Hidden DB effects:**
- Retention casts on text dates (TRACE-002).
- `db:push` against a declaration missing a constraint the signup race relies on (DB-001).

**Reverse trace:**
- Every client URL and e-mail link resolves to a route.
- Three exports have no callers (MAINT-004).
- `site_settings` is deliberately unused.

## 8. Performance / DB

**At this scale (hundreds of users) the DB is not a concern:**
- Writes are single set-based statements with short locks (signup CTE, import `jsonb_to_recordset`).
- Claims use `SKIP LOCKED` plus leases.
- Predicates are covered by indexes.
- Retention keeps tables small.

**Material items are frontend and network:**
- PERF-001 (measured): `/kalender` is 515 kB gz against about 205 kB on other pages.
- PERF-002: full-resolution originals in the share grid, a crash risk on iOS.
- PERF-003 (unverified): a possible transatlantic function↔DB round trip on every query. It is cheap to check in the Vercel/Neon dashboards.
- Cron capacity overflow (PERF-006) is silent rather than slow.

## 9. Architecture / maintainability

The architecture fits the problem, and its constraints are written down. Improvements, current → proposed:

- **Error handling (MAINT-002):** three styles of error handling and Sentry reporting → let `withApiHandler` own unexpected errors and send provider errors through `reportProviderError`. Benefit: one log line per failure, no lost events.
- **Creation endpoints (MAINT-003):** they return raw rows → use allow-list mappers. Benefit: new columns are no longer published by default.
- **Type ratchet (MAINT-001):** a count-based type budget → a fingerprinted baseline. Benefit: real regressions cannot hide behind fixed noise.
- **Signup code (MAINT-005):** an inline 335-line signup branch and string-built mail → `validateSignupBody` plus `registration-emails.js`. Benefit: testable like `contact-emails.js`.

## 10. Accessibility (WCAG 2.2 AA)

Strong base: Radix dialogs with titles, a skip link, `lang` that follows the language, 44px targets via tokens, dark-theme text ≥4.5:1, and a correctly wired share-page PIN form.

**Static-verifiable defects** sit on the public signup form, the highest-traffic form:
- unlabelled child-name inputs (A11Y-001, 1.3.1/3.3.2/4.1.2);
- Norwegian-only accessible names in English (A11Y-002, 3.1.2);
- no `autocomplete` (A11Y-003, 1.3.5).

**Toast-only errors (A11Y-004)** need runtime and screen-reader confirmation.

**Not reviewed (needs a browser or AT):** focus return, reflow at 320px, 2.4.11 focus not obscured, live announcements.

## 11. Testing / observability

**Tests:** 515/515 pass. The handler harness, authz matrix, source invariants and isolated PostgreSQL job are good practice. Gaps:
- secure-settings mutation logic (TEST-001);
- migration completeness, since the fixture seeds base tables from `schema.ts` (TEST-002);
- concurrency of rate limits — the harness can't model it, which is why SEC-001 slipped.

**Observability:** logs are structured and redacted, with no query strings. But:
- request ids are corrupted by redaction (OBS-002);
- a DB outage is reported as 401 with no `api.error` (OBS-001);
- media-purge failures are not alerted (OBS-005);
- the audit trail has no target ids (OBS-003);
- Sentry events have no release or request tags (OBS-004).

## 12. Documentation

AGENTS.md and the docs are detailed and mostly accurate. Fix:
- DOC-002: the error convention as documented would turn 400s into 500s;
- DOC-003: the timestamptz rule;
- DOC-001: function/handler counts;
- DOC-004: the README;
- DOC-005: the privacy page, which predates private media sharing. Its legal adequacy is for the association to judge.

## 13. Positive findings

- The authorization meta-test makes an unguarded new route fail CI.
- Signup, cancel and outbox are each a single atomic statement with DB-level uniqueness backstops; the cron reconcile is race-safe.
- Telemetry privacy: replay is off, transports are scrubbed, and the share page loads no third-party code (test-guarded). The CSP script hash is verified against the built HTML.
- Stale-chunk recovery after deploy, immutable assets, and a missing asset returning 404 instead of the SPA.
- Every client URL, e-mail link, enum and query key is consistent across tiers.
- Thoughtful, documented trade-offs: Turnstile fail-open, provider-first document deletion, at-least-once mail.

## 14. Roadmap

| Phase | Items | Depends on |
|---|---|---|
| 1 Stop-the-line (security, correctness) | SEC-001, SEC-002, TRACE-001 | — (SEC-002 builds on SEC-001's atomic reserve) |
| 2 Functional integrity | SEC-003, SEC-006, SEC-005, TRACE-002, DB-001 (+TEST-002), TRACE-003, MAINT-003, A11Y-001/002 (same form as SEC-003) | DB-001 before any `db:push`; TRACE-003 before A11Y-004 |
| 3 Reliability and performance | OBS-001, OBS-002, OBS-005, MAINT-002, PERF-001, PERF-002 (product sign-off), PERF-003 (check first), PERF-004…007 | MAINT-002 before OBS-004; PERF-001 before PERF-004 |
| 4 Maintainability | MAINT-001, MAINT-004, MAINT-005, TRACE-004…007, SEC-004, SEC-007…016 | MAINT-005 eases TEST-003 |
| 5 Tests, a11y, docs, DX | TEST-001, TEST-002 (with DB-001), TEST-003, A11Y-003…008, DOC-001…005, OBS-003, OBS-004 | DOC-002 after MAINT-002 decides the convention |

## 15. Blocked / unverified

| Item | Why | Effect on confidence |
|---|---|---|
| `npm run test:integration` | Needs an isolated PostgreSQL (CI runs it) | SQL races, casts and indexes (TRACE-002, DB-001, SEC-015) are reasoned, not executed. Kept at POSSIBLE/HIGH. |
| Live Vercel/Neon/R2/Cloudinary/Gmail/Sentry | No runtime or dashboard access | PERF-003 UNVERIFIED. Turnstile enablement, `x-real-ip` overwrite, env scoping for previews and log retention unknown. |
| Production data | None available | TRACE-002 (bad legacy dates), TRACE-004 (multiple kindergarten rows), TRACE-007 are POSSIBLE. Each task includes a check query. |
| True concurrency on Neon | Harness models atomic upserts in memory | SEC-001 reproduced against the real handler with an in-memory counter. Real timing will differ, but the ordering defect is structural. |
| Browser and assistive-technology a11y | No browser session in scope | A11Y-004/007 POSSIBLE; reflow, focus order and announcements unreviewed. |
| Live `npm audit` advisory database | Offline at triage | SEC-016 reachability verified; whether a patched version exists is unknown. |

## 16. Verdict

- **Security:** trustworthy for its threat model once the media-share PIN limits are made atomic and cumulative (SEC-001/002). Everything else is defence in depth.
- **Correctness:** primary flows hold end to end. One council view crashes on session expiry (TRACE-001), and retention depends on clean legacy dates.
- **Performance:** no material scaling concern at this size. Frontend weight on `/kalender` and the share page is the user-visible cost.
- **Maintainability:** engineers can change it safely. The conventions are documented and mostly followed; error handling and creation mappers need consolidating.
- **Testability:** most regressions would be caught. Concurrency, migration completeness and secure-settings mutations would not.
- **Operational confidence:** high for deploys (CI, CSP hash guard, stale-chunk recovery). Moderate for incident diagnosis until OBS-001/002 are fixed.
- **Technical debt:** localized.

**Overall: Requires targeted remediation.**
