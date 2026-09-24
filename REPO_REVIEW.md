# Repository review — FAU Erdal Barnehage

Reviewed 2026-09-24 at `c5cdecd` (branch `claude/zen-lovelace-2g1nmu`) using the repository's own `repo-review` skill (`.claude/skills/repo-review/`). This review changed no production code. Working notes are in `.review/`, and every tooling run is logged in `.review/04-verification.md`.

> **Remediation status:** the P1 and P2 findings below were fixed after this review, on the same branch; `REVIEW_TASKS.md` records what changed. This document is the audit as found at `c5cdecd`.

## 1. Executive summary

This is a small, deliberately simple system, and it is mostly trustworthy. It has one backend tier of 9 Vercel functions writing parameterized SQL, strong session security, two layers of HTML sanitization and a well-guarded upload path. Its failure handling is more thorough than usual for a site this size. All offline gates pass: typecheck, 370/370 unit tests, the build, 5/5 PostgreSQL integration tests and a clean `npm audit`.

The most important problem is a **correctness bug in the nightly newsletter job**, reproduced on a real PostgreSQL 16 instance (**DB-001**, P1). The cron marks a delivery as `'failed'` after five attempts, but the production CHECK constraint from migration 0008 does not allow that value. The first permanently undeliverable subscriber therefore turns every evening run into an HTTP 500. That delivery row is retried forever, and flagged news posts are never marked as sent. CI did not catch this because its PostgreSQL fixture builds a looser schema than production (**TEST-001**). A related defect means failed reminders are re-sent after the event has passed or been cancelled (**TRACE-001**, also reproduced on the database).

The P2 security findings are business-logic and abuse issues, not injection or auth bypass:
- One anonymous signup can take every seat or photo slot (**SEC-001**).
- Anyone can lock a council member out of login (**SEC-002**), using login e-mails that the public document list exposes (**SEC-003**).
- The public forms can be used to send FAU-branded mail containing attacker-chosen text (**SEC-004**).

Separately, public visitors download about 90 kB (gzip) of the council-only rich-text editor on every page load (**PERF-001**, measured).

**Overall rating: Requires targeted remediation.** One migration fixes the P1. The P2s are local changes with clear tests.

## 2. Architecture overview

- **Front end:** a React 19 SPA (Wouter, TanStack Query, React Hook Form + zod, Tailwind 4) served from Vercel.
- **Back end:** 8 `api/*.js` handlers plus 1 cron handler. They run unbundled on Node 22 and multiplex resources through `?action=` and `?resource=` because of the Hobby plan's 12-function cap.
- **Database:** Neon PostgreSQL over HTTP. There are 16 tables and no views, procedures or triggers. Each statement is its own transaction, and multi-step writes are single CTEs.
- **Authentication:** a JWT in an HttpOnly cookie, `token_version` revocation and a double-submit CSRF token. Roles are admin, member and staff.
- **Background work:** a PostgreSQL outbox (`newsletter_deliveries`) and reminder claims, driven by two daily Vercel Cron runs.
- **Providers:** Gmail SMTP, Cloudinary (signed direct upload with server re-verification) and Sentry.
- **Schema definition is split:** `shared/schema.ts` (Drizzle; types and zod only) and 16 hand-applied SQL migrations. **This seam is where the P1 lives.**

The full map, state machines and flows F-01…F-16 are in `.review/02-architecture.md`. The existing `docs/architecture.md` is accurate, so no `ARCHITECTURE_REVIEW.md` was written.

## 3. Coverage

All counts come from the repository (`git ls-files`, `grep`).

| Item | Count | Reviewed |
|---|---|---|
| Client pages / routes | 13 pages, 26 `<Route>` entries | all routes traced to a caller |
| Client components (excluding `components/ui`) | 38 (+19 shadcn primitives, not reviewed) | the 16 involved in traced flows, read for data flow |
| Client API call sites (`apiRequest` / `useQuery`) | 107 | every `/api/*` route mapped to a caller (reverse trace) |
| Serverless entry points | 9 (8 handlers + 1 cron) | 9/9 read in full |
| Endpoint operations (method × action/resource) | 54 | 54/54 authZ and validation checked |
| Shared backend modules / exported functions | 17 / 68 | all read; `sentry.js` and `contact-emails.js` in part |
| SQL call sites in `api/` | 86 | all read; 3 statements executed on PostgreSQL 16 |
| DB tables / migrations / views / procs / triggers | 16 / 16 / 0 / 0 / 0 | all migrations scanned for DDL and constraints |
| Offline test suites / integration suites | 39 / 1 | all run; 10 suites read the source files they guard |
| Traced flows | 16 | complete: 16 · runtime-verified: 4 (F-03, F-12 on DB, F-01 unit, F-14 a11y) · blocked: 0 |

## 4. Scorecard

| Dimension | Score | Evidence |
|---|---|---|
| Security | 7 | No injection, XSS or authZ bypass found. DB-sourced roles, CSRF and upload binding are solid. There are four medium abuse/business-logic gaps (SEC-001…004). |
| Performance | 7 | Queries are bounded and indexed, and the cron has a time budget. First-load JS is 35 % larger than necessary (measured), and some public reads are unbounded. |
| Maintainability | 7 | Small, consistent and heavily commented. Validation is duplicated (MAINT-001), there are two wire shapes per resource in a 750-line multiplexer (MAINT-002), and the backend type gate still tolerates 52 diagnostics. |
| Architecture | 8 | Deliberate single backend, atomic CTEs and a durable outbox. The weak seam is the schema split between Drizzle and the migrations (DB-001). |
| Code quality | 8 | Defensive code, with failure paths designed and documented in place. |
| Testability | 6 | 370 fast tests, a real-PostgreSQL gate and an authZ matrix. However, the PostgreSQL fixture diverges from production (TEST-001), many guards assert source text, and there is no signup handler test (TEST-002). |
| Traceability | 7 | 16 flows: 10 PASS, 5 PARTIAL, 1 FAIL. Error contracts partly rely on free text (TRACE-004). |
| Accessibility | 8 | One axe violation in 16 runtime scans across two themes and widths, plus good static semantics. Authenticated pages were not scanned. |
| Observability | 7 | Structured, redacted logs with request id, actor and a mutation audit line, plus Sentry. There is no aggregate signal for failed mail (OBS-001). |
| Documentation | 8 | AGENTS.md, the architecture and subsystem docs, and the migration README are current and precise. The delivery state set is documented in code but not in the schema. |
| **Overall** | **7** | Sound design and hygiene. One real production bug slipped past the test gate. |

## 5. Prioritized findings

| ID | P | Sev | Conf | Title | Location |
|---|---|---|---|---|---|
| DB-001 | P1 | High | CONFIRMED (db) | Outbox writes `status='failed'`, which the production CHECK forbids → nightly 500, endless retry, items never marked sent | `api/cron/event-reminders.js:330-338`; `migrations/0008_delivery_outbox.sql:16-17` |
| TRACE-001 | P2 | Medium | CONFIRMED (db) | Newsletter retries ignore source status and date → reminders for past or cancelled events | `api/cron/event-reminders.js:223-266` |
| TEST-001 | P2 | Medium | CONFIRMED (db) | Integration fixture builds tables from Drizzle before the migrations, so production CHECKs are absent in CI | `tests/integration/postgres-fixture.mjs:84-88` |
| SEC-001 | P2 | Medium | CONFIRMED (unit) | One anonymous signup can take every seat (≤100 attendees server-side vs 10 in the UI) or photo slot; foto events have no capacity check | `api/registrations.js:248,398-404`; `shared/photo-slots.js:138-146` |
| SEC-002 | P2 | Medium | HIGH | Per-account login limit is checked before the password → anyone can lock a council account; the raw e-mail is used as the key | `api/auth.js:75,87-99` |
| SEC-003 | P2 | Medium | CONFIRMED | Public `GET /api/documents` returns `uploadedBy` = council login e-mail | `api/documents.js:58`; `api/upload.js:296` |
| SEC-004 | P2 | Medium | HIGH | Public forms send FAU mail containing attacker-chosen text to any address (quota and reputation risk) | `api/registrations.js:492-503,607-617`; `api/contact.js:145-158` |
| PERF-001 | P2 | Medium | CONFIRMED (measured) | `manualChunks` `/react/` substring puts TipTap/ProseMirror in the eager chunk: +302 kB min / +90 kB gzip per visit | `vite.config.ts:25-37` |
| SEC-005 | P3 | Low | CONFIRMED (unit) | Wrong-typed input gives 500 instead of 400 (`sanitizeNumber` allows fractions; untyped login fields) | `api/_shared/middleware.js:609-613`; `api/auth.js:58-113` |
| SEC-006 | P3 | Low | HIGH | Check-then-insert on unique columns → 500 on double submit | `api/contact.js:261-287`; `api/secure-settings.js:618-630` |
| SEC-007 | P3 | Low | POSSIBLE | Error redaction, Secure cookies and CORS all depend on `NODE_ENV === 'production'` | `api/_shared/middleware.js:45,155-167,209` |
| SEC-008 | P3 | Low | POSSIBLE | Cron bearer secret compared with `===` | `api/cron/event-reminders.js:64-68` |
| TRACE-002 | P3 | Low | HIGH | Flagged news posts are never marked sent while there are no subscribers, then go out months later | `api/cron/event-reminders.js:387-400` |
| TRACE-003 | P3 | Low | HIGH / POSSIBLE | `NOW()` stored into text timestamp columns (PostgreSQL format, not ISO) | `api/contact.js:118`; `api/upload.js:315` |
| TRACE-004 | P3 | Low | CONFIRMED | Signup errors are localized by substring-matching English server text | `client/src/components/event-registration-modal.tsx:91-137` |
| TRACE-005 | P3 | Low | HIGH | Documents list is limited to 500 rows before editor images are filtered out → real documents can drop off `/files` | `api/documents.js:48-63`; `client/src/pages/files.tsx:124` |
| TRACE-006 | P3 | Low | CONFIRMED | Orphans: `site_settings`, the `staff-users` alias, unread `reminder_attempts` | `shared/schema.ts:177`; `api/secure-settings.js:739` |
| PERF-002 | P3 | Low | HIGH | Homepage fetches up to 500 full posts to show 3 | `client/src/pages/home.tsx:98-102` |
| PERF-003 | P3 | Low | HIGH | Year-calendar import runs ≤500 sequential, non-atomic statements in a 30 s function | `api/yearly-calendar.js:247-352` |
| TEST-002 | P3 | Low | CONFIRMED | No handler test for public signup rules | `tests/` |
| OBS-001 | P3 | Low | HIGH | Mail failures are visible only per message; no aggregate or alert | `api/_shared/provider-errors.js`; cron `:561` |
| MAINT-001 | P3 | Low | CONFIRMED | Event POST and PUT validation duplicated (~50 lines) | `api/events.js:222-272,288-338` |
| MAINT-002 | P3 | Low | CONFIRMED | Inline column aliases alongside `map*` functions in `secure-settings.js` | `api/secure-settings.js:253,264,376,565` |
| A11Y-001 | P3 | Low | CONFIRMED (runtime) | "UKE" week label at 3.85:1 contrast (`opacity-80`) | `client/src/components/calendar-entry-list.tsx:216` |

Full evidence is in `.review/findings-{sec,trace,perf,quality}.md`, and the tasks are in `REVIEW_TASKS.md`.

## 6. Security

**How identity reaches the data (F-02).** `requireRole` verifies the JWT (HS256 with iss/aud pinned) and then re-reads the user from the database. The role and `token_version` come from the database, not from the token. Users whose password has expired or must be changed are refused with a 403 until they change it. Every state-changing session route also passes `requireCsrf`, which compares the double-submit token in constant time. `tests/api-authorization.test.mjs` covers every protected route against every role and against a missing CSRF token. The authorization matrix matches the role model in AGENTS.md: admin-only settings, members, and staff limited to the yearly calendar. There is no tenancy and no per-owner resource, so there is no IDOR surface.

**Findings:**
- **SEC-003 + SEC-002 together** are the most practical attack. `GET /api/documents` publishes the login e-mail of anyone who uploaded a file, including images inserted in posts. The per-account login limit then lets an anonymous caller hold that account at 429 by sending about 21 bad attempts per hour. This limit is checked before the password, so the real owner is refused too.
- **SEC-001:** the only limit on attendee count is the UI's `max(10)`. The server accepts up to 100, and photo ("foto") events skip the capacity predicate entirely. When the photo day is full, `assignPhotoSlots` returns fewer slots than children, but the insert still succeeds.
- **SEC-004:** the confirmation e-mail repeats the submitted name and a free-text comment (up to 1,000 characters) to whatever address was entered, with no proof of ownership. Rate limits are per IP. This turns the site's Gmail account into a relay whose shared daily quota also carries every legitimate reminder.

**Positive (verified):**
- Parameterized SQL only: no `sql.unsafe`, `sql.raw` or `sql(` anywhere.
- HTML is sanitized with sanitize-html on write and re-sanitized with DOMPurify on read. Images are limited to Cloudinary and video frames to YouTube-nocookie, with the frame rebuilt from the video id.
- ICS output is escaped and folded.
- Uploads are bound to our cloud name, the `fau-documents/` prefix, the public id and the resource type, and are re-verified through the Cloudinary Admin API.
- Capability tokens are 256-bit, sent by POST and rate-limited, and cancellation is a two-step flow.
- `npm audit` is clean. CI runs with `contents: read`. No secrets appear in any commit.

## 7. Traceability

There are 16 flows (see `TRACEABILITY_MATRIX.md`): 10 PASS, 5 PARTIAL, 1 FAIL.
- **The FAIL is F-12, the newsletter broadcast.** The database side-effect hop (`UPDATE … status='failed'`) is rejected by `newsletter_deliveries_status_check` (DB-001). The claim hop also selects stale or cancelled items (TRACE-001).
- **The PARTIALs** are:
  - F-03, signup: the validation hop is weaker than the UI.
  - F-08, documents: the return mapping leaks `uploadedBy`, and the 500-row limit is applied before editor images are filtered out.
  - F-09, contact: a non-ISO `created_at` is stored.
  - F-14, public reads: over-fetching, and `createdBy` is public.
  - F-15, import: runs outside a transaction and one statement at a time.
- **Reverse trace:** every route has a client caller except the `staff-users` alias. `site_settings` is declared but unused. `reminder_attempts` is written but never read.
- **Contract checks that hold:** camelCase mapping, removal of `cancel_token` from responses, ISO deadlines and Oslo-date cancellation guards, the error code for a required password change, and 401 session recovery.

## 8. Performance and database

- **PERF-001 (measured):** first-load JS is 855 kB min / 262 kB gzip. With an exact-path chunk rule it is 553 kB / 172 kB. The difference is TipTap/ProseMirror, pulled into `vendor-react` by `id.includes("/react/")`.
- **PERF-002 / PERF-003 (need production metrics):** the homepage fetches the whole blog archive, and the year-calendar import runs one round trip per row with no transaction inside a 30 s limit.
- **Checked and fine:**
  - Signup is about 6 round trips.
  - The calendar feed is bounded to one year and edge-cached.
  - Cron batches are bounded, stop at 23 s and use pooled SMTP with a socket deadline.
  - Every hot filter has an index: registration event id, cancel token, delivery claim, blog category/status, and the pending-newsletter partial index.
  - Capacity is enforced under `FOR UPDATE` in a single statement, and duplicate signups are blocked by a unique index plus `ON CONFLICT`.
  - A nightly reconcile repairs counter drift and is safe to run against live traffic.

## 9. Architecture and maintainability

The single-backend rule, the `map*` convention and the shared JS + `.d.ts` boundary are all followed.

Debt:
- **Schema defined in two places.** CHECK constraints live only in migrations, while types and the CI fixture come from Drizzle. This is why DB-001 could exist and why TEST-001 hid it. **Proposed:** make the migrations the single source of the runtime schema in CI, and either add a `0017` that encodes the delivery state set, or declare the CHECKs in `schema.ts` too.
- **`secure-settings.js`** (750 lines, 6 resources) mixes the mappers with inline column aliases (MAINT-002).
- **Event validation** is copied between POST and PUT (MAINT-001).
- **The backend type ratchet** is at 52 diagnostics.

None of this is systemic.

## 10. Accessibility (WCAG 2.2 AA)

- **Runtime:** axe-core ran on 8 public routes at 375 px (light) and 1280 px (dark). The dark theme was confirmed active (`html.dark`). There was one violation: A11Y-001, a contrast ratio of 3.85:1 on the week label in `/kalender`.
- **Static checks:** no clickable non-interactive elements, `alt` on every image, a skip link to a focusable `<main>`, the `lang` attribute kept in sync, named icon-only controls (guarded by `client-invariants`), and live regions for status messages.
- **Not covered:** authenticated editor pages, focus trapping in dialogs, screen-reader output and 200 % zoom.

## 11. Testing and observability

**Tests.** There are 370 offline tests (3.7 s) and 5 integration tests on a real PostgreSQL instance.
- *Strengths:* the handler harness runs production middleware, the authZ matrix is complete, and the concurrency, lease and retention tests run on a real database.
- *Gaps:*
  - The integration schema is not the production schema (TEST-001).
  - 10 of 39 suites assert source text. One of them, `backend-invariants.test.mjs:76-77`, asserts the code that causes DB-001.
  - The public signup rules have no handler test (TEST-002).

**Observability.**
- *Present:* JSON log lines with `x-vercel-id`, actor id and role, redaction and a 200-character cap; an audit line for each successful mutation; awaited Sentry capture on 500s; a structured `cron.run` summary.
- *Missing:* an aggregate signal for failed mail or quota exhaustion (OBS-001). Once DB-001 is fixed, the `newsletter.delivery_abandoned` log line becomes reachable.

## 12. Documentation

AGENTS.md, `docs/architecture.md`, `docs/subsystems.md`, `docs/DEPLOYMENT.md` and `migrations/README.md` match the code. They even document the at-least-once delivery and deployment ordering.

Gaps:
- Nothing states that CHECK constraints live only in migrations and must be updated when code adds a new state.
- `migrations/README.md` needs the `0017` entry once DB-001 is fixed.

AGENTS.md also asks for review reports to be folded into the operating docs and then removed, so these three files are meant to be temporary.

## 13. Positive findings

- Atomic single-statement business operations: signup with capacity and slots, cancellation with history and counter update, and event deletion guarded by a materialized CTE plus the foreign key.
- The durable outbox recovers leases, has a deadline-bounded sender, uses Message-IDs and keeps retention.
- Security controls are layered and tested: DB-sourced roles, token revocation, CSRF matrix, dual sanitizers and upload re-verification.
- Every tricky branch carries a comment explaining *why*, which made this review fast and reliable.
- Ratchets for inline i18n and backend type diagnostics.
- Supply chain is clean: `npm ci` in CI, 0 audit findings, Dependabot with cooldowns, least-privilege CI.

## 14. Roadmap

| Phase | Items | Notes |
|---|---|---|
| 1 — stop the line | DB-001 (migration 0017), then TRACE-001 | Apply 0017 on Neon before or with the deploy. TRACE-001 depends on DB-001 to make abandonment work. |
| 2 — functional integrity | SEC-001, SEC-003, SEC-002, SEC-004 | SEC-003 before SEC-002 (removes the username source). SEC-004 may need a council decision on captcha. |
| 3 — reliability and performance | TEST-001, PERF-001, TRACE-002, TRACE-005, PERF-002, PERF-003, SEC-006 | Do TEST-001 soon after DB-001 so CI would have caught it. |
| 4 — maintainability | MAINT-001, MAINT-002, TRACE-004, TRACE-003, TRACE-006, SEC-005, SEC-007, SEC-008 | Independent of each other. |
| 5 — tests, a11y, docs, DX | TEST-002, OBS-001, A11Y-001, docs note on CHECK constraints | TEST-002 pairs with SEC-001. |

## 15. Blocked / unverified

| Item | Why | Effect on confidence |
|---|---|---|
| Production Neon schema | No database access. DB-001 assumes the 0008 CHECK exists as written; migration 0010 depends on the same auto-generated constraint naming. | High, not certain: if production was built with `db:push`, DB-001 would not trigger, but TEST-001 still stands. Check with `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'newsletter_deliveries_status_check';` |
| Production env (`NODE_ENV`, `CRON_SECRET`), Gmail quota tier, Vercel firewall | Not in the repo | SEC-007 stays POSSIBLE; SEC-004's impact is reasoned |
| Non-Chromium date parsing | Only Chromium available | TRACE-003 browser impact is POSSIBLE |
| Authenticated UI, screen readers, zoom | No session or assistive technology | Accessibility score covers public pages only |
| Production data volumes and query plans | No metrics | PERF-002 and PERF-003 thresholds are estimates |

## 16. Verdict

- **Security:** trustworthy for its threat model. No bypass or injection was found. Fix the abuse and lockout gaps (SEC-001…004).
- **Correctness:** the primary flows hold end to end except the newsletter outbox, which breaks permanently after the first undeliverable address (DB-001) and can mail stale reminders (TRACE-001).
- **Performance:** no material scaling concern at kindergarten scale. There is one measured, cheap win of 35 % less first-load JS.
- **Maintainability:** high. The code is small, consistent and explained, and the debt is local.
- **Testability:** good breadth, but the database gate checks a different schema than production, and several guards test code text rather than behaviour.
- **Operational confidence:** good. There are clear logs, awaited Sentry capture and documented deployment ordering. Hand-applied migrations are the main operational risk.
- **Technical debt:** localized.

**Overall: Requires targeted remediation.**
