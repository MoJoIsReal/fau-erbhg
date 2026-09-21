# Comprehensive Repository Review — FAU Erdal Barnehage

**Review date:** 2026-09-18
**Commit:** `0b38ac5` (branch `claude/gallant-johnson-2hos4k`, based on `main`)
**Method:** lead reconnaissance and architecture mapping, then five parallel specialist
reviews (security; frontend/traceability; performance/database; domain logic, testing and
observability; accessibility), then lead verification of the highest-severity claims.
**Verification performed:** `npm ci`, `npm run check`, `npm test`, `npm run build` all run
and passing; runtime reproductions executed against the real modules; **a throwaway
PostgreSQL 16 cluster was stood up specifically to execute the registration CTE**, which
turned the single most serious finding from inference into observed fact.
**Not available:** the production Neon database, Vercel runtime configuration, Cloudinary
and Gmail credentials, and a browser or screen reader.

---

## 1. Executive summary

This is a small, coherent, unusually well-documented system. The security *foundations* are
real and were verified rather than assumed: every SQL statement is parameterized through the
Neon tagged template with no string concatenation anywhere; JWT verification pins `HS256`
and checks issuer and audience; token revocation is checked against the database on every
request; `npm audit --omit=dev` reports zero vulnerabilities; no secrets are committed; and
the document-upload chain verifies the asset against Cloudinary's own metadata before
persisting anything. `AGENTS.md` and `docs/subsystems.md` were checked claim by claim and
are accurate on nearly every falsifiable statement — that is rarer than it should be.

It is nevertheless **not safe to describe the system as behaving correctly and predictably
today.** Three confirmed defects break core promises, and all three fail *silently*, with a
plausible-looking success response:

1. **Event capacity is corrupted by ordinary duplicate signups, and real parents are then
   refused.** Executed against PostgreSQL 16: a second signup from an already-registered
   email increments `events.current_attendees` and the compensating `rollback_capacity` CTE
   **never fires** — PostgreSQL will not update the same row twice in one statement. On a
   two-seat event, one duplicate submit was enough to make a genuinely new parent get
   *"Event is at capacity"* while one seat stood empty.
2. **An unauthenticated request can take the whole API offline.** `sanitizeText` backtracks
   quadratically and runs *before* rate limiting, so a ~420 KB contact-form message consumes
   the entire 30-second function budget. Measured: 256 KB → 11.2 s.
3. **The newsletter cannot deliver to more than roughly 150 subscribers, and never retries.**
   nodemailer is unpooled (a fresh TCP+TLS+AUTH per message), the run is capped at 400 in a
   30-second function, and the outbox claim query is scoped to a single `event_date` while
   the cron runs once a day — so anything not sent in that one window is stranded forever.
   Registration reminders have the same shape with a hard cap of 25 per event.

Two further issues compound these: a missing import in the cron handler makes the *first*
failed email abort the entire run (confirmed by runtime reproduction), and `checkJs` is off,
so **no tool in this repository can see an undefined identifier in the backend** — which is
precisely why that missing import shipped.

There is also a total accessibility blocker for the one role that exists to use it: the
`staff` role's sole purpose is editing the yearly calendar, and that surface responds to
neither Enter, Space, nor arrow keys.

Real progress has been made since the 2026-09-09 review: **11 of that audit's open tasks are
implemented**, including the durable newsletter outbox, the photo-slot unique index, the
registration foreign key, JWT configuration hardening and provider-metadata upload binding.
The backlog file was never updated to reflect it, which is itself a finding.

**Verdict: Requires significant remediation.** The architecture does not need replacing.
Phase 1 below is five changes, four of them small, and they remove every confirmed
availability and data-correctness defect.

---

## 2. Architecture overview

### 2.1 What actually exists

```text
Browser  —  React 19 · Vite · Wouter · TanStack Query v5 · React Hook Form + Zod
   │        client/src/lib/queryClient.ts: credentialed fetch, X-CSRF-Token from cookie,
   │        ApiError with parsed body. Query key[0] IS the URL the default queryFn fetches.
   │  HTTPS/JSON · HttpOnly `jwt` cookie (2 h, HS256) · double-submit `csrf-token` cookie
   ▼
Vercel  —  9 serverless functions, 51 distinct operations (query-param multiplexed
   │        to stay under the Hobby 12-function cap; 9 of 12 used)
   │        withApiHandler → security headers → CORS preflight → handler → handleError
   │        requireRole(COUNCIL_ROLES | ADMIN_ONLY | YEARLY_CALENDAR_EDITORS) → requireCsrf
   │        → sanitize* → tagged-template SQL → map*(row) → JSON
   ├──────────────► Neon PostgreSQL (15 tables; SQL text, no ORM at runtime)
   ├──────────────► Cloudinary (signed direct browser upload, then server-side verification)
   ├──────────────► Gmail SMTP (nodemailer, unpooled)
   └──────────────► Sentry (hand-rolled envelope client, fire-and-forget)
        ▲
        │  Vercel Cron — 07:00 UTC: registration reminders + GDPR retention + rate-limit GC
        │                19:00 UTC: newsletter broadcast via the newsletter_deliveries outbox
```

There is deliberately **no** service layer, repository layer, second backend, queue, cache
or ORM at runtime. Drizzle is used only to declare `shared/schema.ts`, from which the typed
client and the `drizzle-zod` form schemas are generated; `api/` never imports it. This is the
right shape for the problem and should be preserved.

### 2.2 Trust boundaries

| Boundary | Enforces | Verified state |
|---|---|---|
| Browser → API | Nothing. All values untrusted; UI route guards are convenience only | Correct — confirmed that authenticating never makes an endpoint *more* permissive (`api/registrations.js:67-91` is the model: a non-council session falls through to the same public aggregate an anonymous caller gets) |
| `withApiHandler` | Security headers, CORS allowlist, error funnelling | Sound, except it converts a malformed cookie into a 500 (REL-003) |
| `requireRole` → `requireCsrf` | Role gate before every side effect | Verified across all 51 operations. Order is consistent everywhere except `handleLogout`, which is benign |
| Sanitizers | `sanitizeText/Html/Email/Phone/Number` | `sanitizeHtml` is strong; `sanitizeText` is the P0 (SEC-001) and a leaky denylist (SEC-005) |
| Neon | Uniqueness, FK, atomic CTEs, rate-limit state | Good constraints; one CTE is semantically impossible (DB-001) |
| Cloudinary / Gmail / Sentry | External | Upload verification strong; mail throughput and Sentry delivery both inadequate |

### 2.3 Where the architecture strains

`api/secure-settings.js` is 645 lines multiplexing seven resources behind `?resource=`, with
six independent re-implementations of the same CRUD shape and no `map*(row)` function —
which is exactly where the response-shape drift (TRACE-002) and the inconsistent delete
semantics (TRACE-006) live. `api/registrations.js` (503 lines) mixes dispatch, spam policy,
rate limiting, a nine-CTE transaction and email composition in one function. These are the
two files where new defects will appear.

---

## 3. Review coverage

Counts generated from the repository, not estimated.

| Area | Reviewed | Total | Notes |
|---|---:|---:|---|
| Serverless route files | 9 | 9 | 8 × `api/*.js` + 1 cron |
| Distinct endpoint operations | 51 | 51 | method × action/resource; full inventory traced |
| `api/_shared/` modules | 15 | 15 | |
| `shared/` runtime modules | 7 | 7 | plus `schema.ts` |
| SQL migrations | 11 | 11 | cross-checked against `schema.ts` |
| Tables in `schema.ts` | 15 | 15 | 1 confirmed orphan (`site_settings`) |
| Pages (`client/src/pages`) | 14 | 14 | 6 read in full, 8 by targeted pattern audit |
| Components (excl. `ui/`) | 24 | 24 | 13 read in full/substantially, 11 by targeted audit |
| shadcn `ui/` primitives | 0 hand-audited | 46 | audited by *usage*; `git log` confirms none forked from stock |
| Test suites | 10 | 10 | 68 unit tests + smoke tier, all passing |
| End-to-end flows traced | 57 | — | 46 PASS · 7 PARTIAL · 3 FAIL · 1 UNVERIFIED · 1 DEAD · 2 ORPHANED |
| Contrast pairs computed | 63 | — | 21 light + 16 dark tokens + 26 component-level |

**Explicitly not covered, and why it limits confidence:**

- **No production database.** Index existence, actual row counts, whether migrations were
  applied, and any query plan are unverifiable. The registration CTE finding (DB-001) was
  reproduced on a *local* PostgreSQL 16 against a schema transcribed from `migrations/`, so
  the semantics are certain but the production data state is not.
- **No browser or screen reader.** Focus order, focus visibility, reflow at 320 px, and
  whether live regions actually announce are marked NEEDS RUNTIME / AT VERIFICATION and are
  not claimed as failures.
- **No Vercel runtime.** Whether Vercel appends to or replaces a client-supplied
  `X-Forwarded-For` decides whether SEC-002 is High or Low. Whether `?lang=en` survives the
  `/kalender.ics` rewrite is untestable locally. Actual Sentry ingest behaviour likewise.
- **No Cloudinary or Gmail credentials.** SMTP latency — and therefore the true newsletter
  throughput ceiling — is reasoned from protocol round trips, not measured.
- **`docs/reviews/**` and `docs/superpowers/**`** were not read whole, per `CLAUDE.md`.

---

## 4. Scorecard

Scores reflect *verified* state, not impressions, and are not a mean of each other.

| Category | Score | Justification |
|---|---:|---|
| Security | **5/10** | Genuinely strong baseline — parameterized SQL everywhere, pinned JWT algorithm with DB-checked revocation, 256-bit newsletter tokens, a provider-verified upload chain, zero dependency vulnerabilities, no committed secrets. Pulled down by one *confirmed, unauthenticated, site-wide* DoS (SEC-001), a rate-limit bypass affecting every public endpoint (SEC-002), a cron that fails open when `CRON_SECRET` is unset (SEC-004), and a sanitizer whose comment claims a tenant check it does not perform (SEC-006). |
| Performance | **5/10** | Bundles are healthy and correctly split (281 kB gz entry; the 1.19 MB PDF renderer is dynamically imported). Reads have no N+1. But the newsletter physically cannot do its job past ~150 subscribers, reminders hard-cap at 25 per event, and `/kalender.ics` is uncached under repeated calendar-client polling. |
| Maintainability | **5/10** | Clear directories and strong internal consistency in the newer code, undermined by a 645-line seven-resource multiplexer with six copies of the same CRUD, an untyped backend, and inconsistent delete/response semantics across handlers. |
| Architecture | **6/10** | The serverless-with-no-service-layer choice is right for the scale and is applied consistently. The durable outbox was a good addition. Two real design errors: a compensating transaction that PostgreSQL cannot execute, and a retry mechanism whose window is narrower than its own schedule. |
| Code quality | **6/10** | Thoughtful work throughout — the event-delete CTE handles its FK race correctly, the rate limiter is a single atomic upsert, the ICS folding is octet-correct, Oslo DST is handled in both directions. Sits beside `RETURNING *` shape drift and denylist sanitization. |
| Testability | **4/10** | 68 passing tests, and the best of them (`api-security`, `calendar-feed`) assert invariants rather than implementation. But `checkJs: false` means the backend is statically unchecked; the 07:00 cron half is structurally untestable; and the two highest-risk shared modules (`yearly-calendar-utils.js` 468 lines, `photo-slots.js`) have **no test file at all**. Only 9 of 68 assertions drive an error path — which is exactly the distribution that produced the shipped ReferenceErrors. |
| Traceability | **6/10** | 57 flows traced end to end including error paths; 46 PASS. Three genuine FAILs and a systemic snake_case/camelCase drift wherever `secure-settings.js` returns `RETURNING *`. |
| Accessibility | **4/10** | Real strengths — an exemplary rich-text toolbar, correct `<html lang>` switching, a deliberately contrast-corrected primary palette, no clickable-div antipattern anywhere. But three Level A failures, one of which completely blocks the `staff` role from its only task. |
| Observability | **4/10** | The newsletter outbox is a genuine observability asset (per-delivery `last_error`, persisted and redacted). Everything else is thin: Sentry events are fire-and-forget from a runtime that freezes on response, no log line carries a request id/route/actor, and the cron leaves no record that it ran. |
| Documentation | **6/10** | `AGENTS.md` and `docs/subsystems.md` are accurate on essentially every falsifiable claim — verified individually. Offset by a backlog whose state is wrong on 11 of 28 items, a README that misdescribes the auth model and omits five required env vars, and an architecture doc recommending an outbox that already exists. |
| **Overall** | **5/10** | Sound bones, careful documentation, and visible recent progress — carrying three confirmed silent-failure defects on core flows and one unauthenticated availability risk. |

---

## 5. Prioritized findings

### P0 — Stop the line

| ID | Finding | Confidence | Evidence |
|---|---|---|---|
| **SEC-001** | Quadratic backtracking in `sanitizeText` gives an unauthenticated CPU-exhaustion DoS, reachable *before* rate limiting | **CONFIRMED** (measured twice, independently) | `api/_shared/middleware.js:335,350-359`; reached at `api/contact.js:63` (line 63) while the rate limit is at line 80 |
| **DB-001** | `rollback_capacity` never fires; duplicate signups permanently consume event capacity and then refuse real parents | **CONFIRMED** (executed on PostgreSQL 16) | `api/registrations.js:255-266, 292-299` |
| **REL-001** | `api/cron/event-reminders.js` references `Sentry` and `reportProviderError` without importing them; the first failed email aborts the whole run | **CONFIRMED** (runtime repro) | `:249`, `:435`; imports at `:1-15` |
| **TEST-001** | `checkJs: false` — no tool in the repo can detect an undefined identifier in `api/**` or `shared/**`. This is the *root cause* of REL-001 | **CONFIRMED** (reproduced with a scan config) | `tsconfig.json`; no ESLint in the repo |
| **A11Y-001** | The yearly-calendar editing surface responds to no keyboard input at all, and there is no non-dragging alternative | **CONFIRMED** (static) | `client/src/pages/yearly-calendar.tsx:463-466, 316-335` |

#### SEC-001 — ReDoS in `sanitizeText`

`INLINE_EVENT_HANDLER = /on\w+\s*=\s*["'][^"']*["']/gi` has no `=` to anchor on. For input
`"ondata".repeat(n)` the engine starts at each `on`, lets `\w+` consume the rest, then
backtracks a character at a time. The length cap does not help, because
`.substring(0, maxLength)` runs *after* both `removeUntilStable` passes.

Measured independently by the lead, separate harness, same module:

```
 32KB ( 32766 chars) ->   175 ms
 64KB ( 65538 chars) ->   711 ms
128KB (131070 chars) ->  2779 ms
256KB (262146 chars) -> 11192 ms      ← clean quadratic: 2× input ≈ 4× time
```

Extrapolates to the full `maxDuration: 30` budget at roughly 420 KB. In `api/contact.js`,
`sanitizeText(message, 5000)` is line 63 and the first `checkRateLimit` is line 80, so the
limiter never sees the request until the CPU is already spent — the 4th and the 400th
request from one IP each cost a full function slot. A handful of concurrent requests
saturates function concurrency and takes down every endpoint, including `GET /api/events`,
which is the uptime monitor's target. `POST /api/registrations` (`name`, `comments`, and
`childrenNames` × 100) has the same shape.

**`sanitizeHtml` does not have this bug** — `middleware.js:381` truncates *first*. The fix is
to make `sanitizeText` match the ordering its sibling already uses, then move rate limiting
above sanitization.

#### DB-001 — The compensating CTE PostgreSQL cannot run

`capacity_update` and `rollback_capacity` both `UPDATE events` for the same `id` in one
statement. PostgreSQL §7.8.2: *"Trying to update the same row twice in a single statement is
not supported."* The second update is silently skipped — no error, no returned row. And
because `rollback_capacity`'s qual contains `EXISTS (SELECT 1 FROM capacity_update)`, the
ordering is forced: the rollback always loses, in exactly the case it exists to handle.

Executed against a real PostgreSQL 16 cluster with the schema transcribed from
`migrations/0001` and `0009`, `max_attendees = 2`:

```
--- 1st signup (new email) ---
 capacityReserved | inserted | rolledBack      current_attendees = 1   ✓
                1 |        1 |          0
--- 2nd signup: SAME email (duplicate) ---
 capacityReserved | inserted | rolledBack      current_attendees = 2   ✗
                1 |        0 |          0      ← rollback should be 1 here
--- ground truth ---
 real_registrations = 1 | real_attendees = 1
--- can a genuine NEW parent register? ---
 capacityReserved | inserted | rolledBack      → handler returns "Event is at capacity"
                0 |        0 |          0      while 1 of 2 seats is actually free
```

A parent who double-submits — or who resubmits to check whether they were registered — burns
a seat permanently. `tests/` has zero coverage of this counter
(`grep -rl "rollback_capacity\|capacity_update\|current_attendees" tests/ scripts/` is empty),
which is why it survived. A second, independent defect in the same CTE: all CTEs share one
snapshot, so even if the rollback did apply it would compute `snapshot − N` rather than
`(snapshot + N) − N`, double-subtracting.

#### REL-001 / TEST-001 — The missing imports, and the hole that let them through

```
$ node scratch/cron-proof.mjs     # failing SMTP, NODE_ENV=production
Failed to send newsletter delivery: SMTP 421 rejected
THREW: ReferenceError - Sentry is not defined
```

The throw escapes `runWithConcurrency`, so one transient SMTP failure aborts the entire
evening broadcast; on the 07:00 path the same shape (`reportProviderError`, not env-gated,
so it throws on the *first* failed reminder in any environment) also skips GDPR retention and
rate-limit cleanup.

These are the **only two instances in the repository** — verified by running `tsc` with
`checkJs: true` over `api/**`, `shared/**`, `scripts/**` and `tests/**`:

```
api/cron/event-reminders.js(249,9): error TS2552: Cannot find name 'Sentry'.
api/cron/event-reminders.js(435,9): error TS2304: Cannot find name 'reportProviderError'.
```

`client/src/**` is `.ts`/`.tsx` throughout and genuinely type-checked, so the class cannot
exist there. Fixing the two imports without closing the hole leaves the next one free to
ship. The existing failure test *does* inject a throwing `send` — it misses the bug only
because the reference sits behind `if (process.env.NODE_ENV === 'production')`, which is dead
under `node --test`. Re-running that one existing test with `NODE_ENV=production` would have
caught it.

#### A11Y-001 — WCAG 2.1.1 Keyboard (Level A)

`useSensors` registers only `MouseSensor` and `TouchSensor`; `KeyboardSensor` is absent, and
the draggable `<div>` carries `onClick` with **no `onKeyDown`**. dnd-kit's `attributes` supply
`role="button"` and `tabIndex={0}`, so the entry is focusable — and then does nothing. Not
Enter, not Space, not arrows. The edit modal contains a date field that would satisfy the
2.5.7 single-pointer alternative, but it is unreachable from the entry.

The `staff` role exists, per `AGENTS.md`, *solely* to edit yearly-calendar entries. A
keyboard-only or switch user in that role cannot perform the only task their account is for.

### P1 — High

| ID | Finding | Confidence |
|---|---|---|
| SEC-002 | Rate limiting keys on the client-controlled left-most `X-Forwarded-For` entry; every per-IP limit is bypassable by rotating a header | HIGH CONFIDENCE |
| REL-002 | Newsletter outbox retry is inert: the claim query is scoped `WHERE event_date = ${targetDate}` while the cron runs daily, so any row not sent in its one window is stranded forever | CONFIRMED (static) |
| PERF-001 | nodemailer is unpooled — a fresh TCP+TLS+AUTH per message. 400 emails in 30 s is not physically achievable; realistic band is 90–250, and truncation strands the remainder via REL-002 | HIGH CONFIDENCE |
| MAINT-001 | The Excel import matches existing entries by **title alone**; three planning days sharing a title all bind to one row, destroying two of them | CONFIRMED (repro) |
| MAINT-002 | Import "update" unconditionally sets `weekday_start`/`weekday_end` to `NULL`, and the preview diff cannot show it | CONFIRMED |
| MAINT-003 | An event whose `time` is not `H:MM` (e.g. the Norwegian `17.00`) silently vanishes from the public `/kalender.ics` feed — no log, no counter | CONFIRMED (repro) |
| TRACE-001 | After the 2 h token expires the UI still shows the user as logged in and renders **empty states** instead of errors — the inbox and the whole blog look deleted | HIGH CONFIDENCE |
| OBS-001 | `Sentry.captureException` is fire-and-forget from a runtime that freezes on response; production errors will frequently never reach Sentry | CONFIRMED |
| OBS-002 | No log line carries a request id, route, method, actor or resource — and four handlers multiplex many resources behind one function | CONFIRMED |
| TEST-002 | The entire 07:00 cron half — reminder claim/send, GDPR retention deletion, rate-limit GC — is untested *and structurally untestable* (it uses the imported `sendEmail` directly inside the default handler) | CONFIRMED |
| A11Y-002 | No skip link anywhere, and `<main>` is not a focus target — ~10 header tab stops on every page load *and* every client-side navigation (WCAG 2.4.1, Level A) | CONFIRMED |
| A11Y-003 | `TimeInput24h` renders `name` but never `id`, so every `htmlFor` pointing at it dangles — and inside `<FormControl>` it discards the injected `id`, `aria-describedby` and `aria-invalid` (WCAG 1.3.1/4.1.2/3.3.2, Level A) | CONFIRMED |
| A11Y-004 | `--destructive` fails AA in light mode wherever it is used: `#fafaf9` on `#ef4444` = **3.60:1**, and `#ef4444` on white = **3.76:1** (needs 4.5:1). In dark mode as text it is **1.97:1** | CONFIRMED (computed) |

### P2 — Normal

| ID | Finding | Confidence |
|---|---|---|
| SEC-004 | `isAuthorizedCron` fails **open** when `CRON_SECRET` is unset and `NODE_ENV !== 'production'`; an anonymous GET then triggers mail sends and the irreversible GDPR retention `DELETE`, with a caller-chosen `?date=` | CONFIRMED (code) |
| SEC-005 | `sanitizeText`'s scheme/handler filters are bypassable (`java<TAB>script:`, unquoted and backtick handlers, `-javascript:`), and the test that appears to prove otherwise re-uses the sanitizer's own regex, so it asserts only that the regex agrees with itself | CONFIRMED |
| SEC-006 | `isCloudinaryImageSrc` checks the *hostname* but `res.cloudinary.com` is multi-tenant — the account is the first path segment. An image from a stranger's Cloudinary account passes with its `src` intact, which is exactly what the comment above it claims to prevent | CONFIRMED (verified twice) |
| SEC-007 | `handleDownload` 302-redirects to a stored URL with no read-time revalidation. The write path is currently sound, so this is residual — but any legacy or hand-inserted row becomes an open redirect on the site's own origin | CONFIRMED (code) |
| REL-003 | `parseCookies` calls `decodeURIComponent` outside the try block; one malformed percent-sequence returns `500` on **every** endpoint, including logout, so the user cannot self-recover | CONFIRMED (runtime repro) |
| DB-002 | `events.current_attendees` has three drift sources and no reconciliation path anywhere | HIGH CONFIDENCE |
| DB-003 | `newsletter_deliveries` grows unbounded and copies each item body per subscriber | HIGH CONFIDENCE |
| DB-004 | A truncated news broadcast leaves a permanently unstamped post that is re-queued every night forever | HIGH CONFIDENCE |
| PERF-002 | `MAX_REMINDERS_PER_RUN = 25` silently drops reminders for any event with more registrations — and `sent: 25` looks healthy. Throughput is not the constraint (25 messages ≈ 3–5 s); the cap is arbitrary | CONFIRMED |
| PERF-003 | `/kalender.ics` is public, polled repeatedly by calendar clients, uncached, two queries per hit. **Confirmed against production 2026-09-21:** it returns `cache-control: public, max-age=0, must-revalidate` — the `no-store` rule in `vercel.json` targets `/api/(.*)` and never matches, because header rules are evaluated on the pre-rewrite path. Either way there is no CDN caching. **Fixed in Phase 3** by setting `Cache-Control` in the handler, which is post-rewrite; `vercel.json` is unchanged and every other API route stays `no-store` | CONFIRMED |
| PERF-004 | `news-post.tsx` fetches up to 500 full posts (each body capped at 50 000 chars) to render one article — paid by exactly the traffic the permalink exists for | CONFIRMED |
| TRACE-002 | Blog-post save writes the raw snake_case `RETURNING *` row into render state; the four fields the card renders go `undefined`, and a subsequent archive/homepage toggle then **resets the post's publish date to today** | CONFIRMED (verified) |
| TRACE-003 | Registration delete optimistically mutates two caches but snapshots one; on failure the attendee count stays wrong until reload | CONFIRMED |
| TRACE-004 | Deleting a FAU member/staff user has no `onError` and no success toast — every failure is silent | CONFIRMED |
| TRACE-005 | Board-member save is a sequential `mutateAsync` loop; a mid-loop failure persists the prefix, skips the invalidation, and leaves the UI showing everything as saved | CONFIRMED |
| TRACE-006 | 8 sites pass an unvalidated `req.query.id` string into an integer column (→ 500, not 400); 3 DELETE branches in `secure-settings.js` return `200 "deleted successfully"` without checking affected rows | CONFIRMED |
| MAINT-004 | Duplicate titles *within one sheet* all create, then become permanently `ambiguous` — the sheet can never update those entries again, only add more. Self-compounding | CONFIRMED (repro) |
| MAINT-005 | Import update clears `showOnHomepage`/`showForParents` on any non-`day_event`, and reports every unchanged sheet as dirty | CONFIRMED |
| MAINT-006 | `validateImportDecision` throws a `TypeError` on a prototype-named `status` (`DECISION_ACTIONS['toString']` is truthy); request-reachable, aborts the whole import batch with a 500 | CONFIRMED (repro) |
| MAINT-007 | The photo-slot allocator drops stored slots that are negative or off the 5-minute grid from its occupancy set, and `formatMinutesOffset` wraps past midnight | CONFIRMED (repro) |
| MAINT-008 | `runWithConcurrency`: a throwing worker rejects the batch while the other workers keep consuming the queue, so their `UPDATE`s can be cut off mid-write when the instance freezes | CONFIRMED (repro) |
| MAINT-009 | `GET /api/registrations?eventId=` returns two different shapes from one URL; the client types it unconditionally as the array. Guarded today only by client-side role state, which TRACE-001 shows can be stale | HIGH CONFIDENCE |
| OBS-003 | `redactSensitiveText`'s phone pattern destroys timestamps, Cloudinary public_ids and epoch values in logs (`"at 2026-03-29 18:30:00"` → `"at [redacted-phone]:30:00"`). Over-redaction, not a leak | CONFIRMED |
| OBS-004 | Sentry frames cram the whole source line into `function` with no `filename`/`lineno`, so grouping falls back to the message and unrelated `Internal server error`s merge into one issue. No release, tags or request context | CONFIRMED |
| DOC-001 | `docs/review-backlog.md` marks 28 items open; **11 are implemented**. `AGENTS.md` repeats the wrong count, and both instruct agents to trust the file | CONFIRMED |
| DOC-002 | `README.md` describes "session-based authentication" (it is a 2 h HS256 JWT) and lists an env set missing `CRON_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and both Sentry DSNs — a deployment following it has no email at all and both crons 401 forever, silently | CONFIRMED |
| A11Y-005…A11Y-013 | Colour-preset contrast on calendar chips; seven forms surfacing validation only through a toast with no `aria-invalid`/`aria-describedby`; unnamed mobile navigation sheet; rich-text images that can never have alt text; missing `autocomplete` on login and contact; div-based month grid with no grid semantics; no `prefers-reduced-motion`; cancelled events conveyed by colour alone; nine unassociated labels in the entry modal | CONFIRMED (static/computed) |

### P3 — Improvement

`SEC-008` (unbounded temporary-password validity; no rate limit on `?action=change-password`;
global logout as the only revocation granularity; CI actions pinned to mutable major tags) ·
`DB-005` index drift between `schema.ts` and `migrations/` in both directions · `DB-006`
`contact_messages.created_at` written as a PG timestamp rather than the ISO text the rest of
the codebase uses · `DB-007` retention cleanup ordered last, so a parse failure starves
rate-limit GC · `DB-008` polymorphic `item_id` orphans · `PERF-005` duplicate `users` lookup
on `?action=me` · `MAINT-010` `nextAttemptAt` throws `RangeError` on a non-numeric
`attempts` — inside a catch block, the same failure shape as REL-001 · `MAINT-011`
`truncatePlainText` splits surrogate pairs, putting a lone surrogate in outgoing newsletter
bodies · `MAINT-012` untranslated Norwegian toasts on three surfaces, invisible to the i18n
ratchet because they are plain strings rather than ternaries · `MAINT-013` registration
errors classified by substring-matching the message when structured bodies are already
returned · `MAINT-014` `Document`/`EventRegistration` types promise fields the API never
returns · `ARCH-001` `site_settings` declared in `schema.ts` with zero readers or writers ·
`TRACE-007` logout has no error path, so clicking "Logg ut" on an expired session silently
does nothing · `TRACE-008` public signup does not invalidate the council's registrations list ·
`DOC-003` `docs/architecture.md` still recommends building the outbox that shipped in
migration 0008 · `A11Y-014…A11Y-022` Norwegian text inside `lang="en"` pages, language toggle
named "NO", sticky header obscuring focused elements, missing `<h1>` on `content.tsx`,
sub-3:1 borders, sub-minimum target sizes on day-cell buttons, `TOAST_LIMIT = 1` swallowing a
second status message.

---

## 6. Security review

**Attack surface.** 51 operations across 9 functions. Public and unauthenticated: `GET
/api/events` (+ the ICS feed), `GET /api/documents` and its download redirect, `GET
/api/yearly-calendar`, the public branch of `GET /api/registrations`, `POST
/api/registrations`, `POST /api/contact` and its three newsletter actions, and the public
`GET` branches of four `secure-settings` resources. Everything else is gated by
`requireRole` + `requireCsrf`.

**Authorization was traced end to end for every operation** — identity → endpoint → resource
→ data operation. The role gate precedes every side effect without exception. Two points
worth recording as *correct*: authenticating never makes an endpoint stricter or more
permissive than anonymous (the registrations GET falls through to the same public aggregate
for a non-council session), and `resource=users`/`resource=staff-users` share one
`ADMIN_ONLY` handler whose every statement is scoped `role IN ('member','staff')` — so no
admin account can be enumerated, deleted or created through it.

**No SQL injection candidate exists.** `grep -rnE 'sql\(|\.unsafe|\.raw' api/` is empty and
every interpolation across all nine handlers is a `${value}` placeholder. No dynamic
identifier or operator construction anywhere.

**The real security problems are availability and trust-of-input, not access control:**
SEC-001 (unauthenticated site-wide DoS, P0), SEC-002 (every per-IP limit bypassable, which
also turns the contact form into an unbounded Gmail-quota drain and unbounded
`api_rate_limits` growth), SEC-004 (cron fails open), SEC-006 (tenant check the comment
claims but the code omits). The one control that survives SEC-002 is the deliberately
IP-agnostic per-account login limit (`api/auth.js:75`, 20/hour) — which is what keeps
password spraying bounded and SEC-002 High rather than Critical.

**`parseCloudinaryDeliveryUrl` was attacked with ten crafted URLs and held.** `new URL()`
normalizes dot segments before the parser sees them, so `…/upload/../../OTHER/image/upload/x.png`
resolves to `cloudName = 'OTHER'` and is rejected. The one input producing a traversal-looking
publicId is closed by the provider round-trip (`cloudinary.api.resource()` plus a
`public_id` equality check). Asking the provider rather than trusting the string is the right
design and should be kept.

---

## 7. Traceability review

57 flows traced UI → handler → client call → endpoint → handler branch → SQL → response
mapping → cache → render, plus the error path, with cross-layer compatibility checked for
names, types, nullability, enums, date semantics and status codes. Full matrix in
[`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).

**46 PASS · 7 PARTIAL · 3 FAIL · 1 UNVERIFIED · 1 DEAD · 2 ORPHANED.**

The three FAILs are TR-09 (registration delete, broken optimistic rollback), TR-25 (blog-post
save, raw row into render state) and TR-53 (logout, silent no-op on failure).

**The systemic issue is response-shape drift.** `api/events.js` and `api/yearly-calendar.js`
each have a single `map*(row)` that defines the wire shape, exactly as `AGENTS.md` requires,
and every flow through them passes cleanly. `api/secure-settings.js` has no mapper and
returns raw `RETURNING *` rows from six write paths. This is harmless in five of them because
the caller discards the body — and a genuine defect in the sixth, where `content.tsx` feeds
it straight into render state.

**Reverse traceability** found no client call to a non-existent endpoint or parameter, and no
unused export in `client/src/lib` or `client/src/hooks`. Three handler branches have no
caller: `?resource=staff-users` (documented alias), `?action=me` (alias), and the public
aggregate branch of `GET /api/registrations` — the last being genuinely dead *and* the reason
MAINT-009 is a latent crash rather than a live one.

One deliberate difference worth recording as safe: `POST /api/auth?action=login` returns
`{user: {id, …}}` while `GET /api/auth` returns `{userId, …}`. The login body is never stored
— the client invalidates and refetches — so the mismatch is inert. The change-password
response, which *is* stored, correctly uses the `userId` shape.

---

## 8. Performance and database review

**Bundles (measured).** Entry critical path ~980 kB raw / **~281 kB gzip**; total
`dist/public/assets` 3.8 MB. The 1.19 MB PDF renderer and the Excel parser are correctly
behind dynamic imports and are not preloaded. This is healthy and needs no work.

**Reads are clean.** No N+1 in any read path across all nine handlers. The only per-row query
loop is the Excel import commit, capped at 500 admin-triggered decisions a year or two.
`parseAuthToken`'s per-request `users` lookup is the price of immediate token revocation and
is the right trade at this scale.

**The database problems are correctness, not speed.** DB-001 (above) is the headline. DB-002
follows from it: three writers touch `current_attendees` — the registration CTE (inflates on
every duplicate), the delete CTE (correct, because its two CTEs touch *different* tables), and
the GDPR retention cleanup (deletes registrations without adjusting the counter) — and nothing
ever reconciles the value against `SUM(attendee_count)`. The clean fix is to stop storing it.

**Mail throughput is the other structural problem.** `pool` is unset on the transporter, so
every `sendMail()` opens a new TCP+TLS+AUTH — roughly 300 ms best case, 600 ms–1.5 s typical.
At `DELIVERY_CONCURRENCY = 5` inside a 30-second function that is 90–250 messages, against a
cap of 400 that is presented in the source as a safety margin. Worse, the claim query flips
**all** claimed rows to `processing` *before* any email is sent, so a 30-second kill leaves
150–300 rows claimed-but-unsent — and REL-002's `event_date` scoping means the 10-minute
lease reclaim can never see them again. Adding `pool: true, maxConnections: 5,
maxMessages: 100` to a cron-only transporter is the single highest-leverage performance
change available, plausibly a 4–8× improvement.

**Verified as genuinely well-built:** both `FOR UPDATE SKIP LOCKED` claim patterns are
textbook-correct (the `LIMIT`ed locking `SELECT` in its own CTE, the `UPDATE` keyed off it, so
concurrent invocations claim disjoint sets, and every status transition is guarded); the
event-delete CTE recognises *and* handles its FK race; the registration duplicate check is
exactly served by `event_registrations_event_email_unique_idx (event_id, lower(email))`; the
rate limiter is a single atomic upsert with window rollover in the `CASE`; and
`blog_posts_newsletter_pending_idx` is a properly justified partial index. No additional
index is recommended — none could be justified from an access pattern.

---

## 9. Architecture and maintainability review

The one-backend, no-service-layer decision is correct for this system and is applied
consistently. Do not add a repository tier.

Three refactors are worth their cost:

**`api/secure-settings.js` (645 lines, 7 resources, 6 copies of CRUD).**
*Current:* six sub-handlers each re-implementing id validation, affected-row checking and
response shaping, inconsistently — which is precisely where TRACE-002 and TRACE-006 live.
*Proposed:* one `mapBlogPost`/`mapBoardMember`/… per resource plus a shared
`requireIntId(req, res)` helper. *Benefit:* removes two confirmed defect classes at the
source and makes the sixth copy impossible to get wrong.

**`api/cron/event-reminders.js` (443 lines).**
*Current:* `broadcastNewsletter` is exported with injectable `sql` and `send` and has five
tests; the entire 07:00 half lives inside the default handler, uses the imported `sendEmail`
directly, and has none. *Proposed:* extract `sendEventReminders(sql, targetDate, send)` and
`cleanupPrivacyRetention(sql)` the same way. *Benefit:* makes irreversible GDPR deletion and
the reminder claim/stamp path testable, and would have caught REL-001's second instance.

**`tsconfig.json`.** *Current:* `checkJs: false` leaves the whole backend statically
unchecked. *Proposed:* a second `tsconfig.api.json` with `checkJs: true, strict: false`, added
to `npm run check`. *Benefit:* verified to emit exactly the two known diagnostics and no
noise, so it can be enabled today at a ratchet of zero.

---

## 10. Accessibility review

WCAG 2.2 AA. 14/14 pages and 24/24 non-`ui` components reviewed; 63 contrast pairs computed
from the actual token values. `ui/**` audited by usage — `git log` confirms no primitive has
been forked from stock.

Three Level A failures gate everything else: A11Y-001 (keyboard, and it blocks the `staff`
role from its only task), A11Y-002 (no bypass block), A11Y-003 (unnamed time inputs in both
places they are used). A11Y-004 is a computed AA contrast failure on the destructive token —
which compounds with A11Y-006, because seven forms surface validation *only* through a
destructive toast, making the single failure channel the hardest one to read.

**Verified strengths, with evidence:** the RichTextEditor toolbar is better than most
production toolbars — all ~20 controls are real buttons with translated `aria-label`s, every
toggle carries `aria-pressed`, and the non-toggling actions correctly use `disabled` instead.
`document.documentElement.lang` is set on mount as well as on change, so there is no window
where the language is wrong. The primary/secondary/accent palette was deliberately
contrast-corrected and the reasoning is documented in the source (`#c5470d` = 4.91:1,
`#0e6e8b` = 5.80:1, `#2d7b53` = 5.16:1; body text 19.76:1 light / 18.95:1 dark). There is **no
clickable-div antipattern anywhere** and **zero** `aria-hidden` on a focusable element.

---

## 11. Testing and observability review

`npm test`: **68 unit tests pass, 0 fail**, plus the smoke tier. `npm run check` passes with
the i18n ratchet at 45/45.

**Quality is better than the count suggests, in places.** `tests/api-security.test.mjs`
asserts authorization *outcomes* — 401 vs 403, revoked token version, password-change
ordering — not internals. `tests/calendar-feed.test.mjs` pins RFC-level properties ("folds to
75 octets without splitting a multi-byte character") rather than exact strings. Both would
survive a refactor.

**The gaps are structural.** Only 9 of 68 assertions drive an error path, and just 2 of those
are in business logic — the exact distribution that ships ReferenceErrors in catch blocks.
`shared/yearly-calendar-utils.js` (468 lines, the bulk-import engine staff point at the live
calendar, home to five findings) and `shared/photo-slots.js` have **no test file at all**.
`scriptedSql` matches statements by substring, so reordering two columns silently turns an
assertion into a tautology. And several suites test the dependency rather than this code.

**Observability would not survive a real incident.** Sentry events are fire-and-forget from a
runtime that freezes on response (OBS-001); no log line carries a request id, route or actor
(OBS-002), which matters more than usual because four handlers multiplex many resources
behind one function; Sentry frames carry no file or line, so unrelated `Internal server
error`s merge into one issue (OBS-004); and Vercel Cron discards the handler's JSON result
while nothing logs a run summary — so a cron that has been 500-ing for two weeks is invisible.

The exception, and it is a genuine one: **the newsletter outbox is the observability story
for that subsystem** — per-delivery `last_error`, persisted and redacted, plus a returned
`{queued, processed, sent, failed, remaining}`. That is the right pattern; it just needs to
be logged rather than discarded.

`redactSensitiveText` was attacked and **under-redaction was not found** — the only issue is
the opposite (OBS-003).

---

## 12. Documentation review

`AGENTS.md` and `docs/subsystems.md` were checked claim by claim and are **accurate on
essentially every falsifiable statement**: function counts (9 of 12), every multiplexed
action and resource, `MAX_UPLOAD_SIZE_BYTES`, the i18n `BUDGET` of 45, every npm script, the
Mon–Sun grid and `weeksOfMonth` as sole source, "an end that is not after the start is
dropped rather than rejected", the UID scheme, the 12-month feed cutoff, the fixed-UTC cron
schedules, and the four-file iframe rule including the CSP cross-check. This is a high
standard and it is being met.

Three documents have drifted: the backlog is wrong on 11 of 28 items (DOC-001), `README.md`
misdescribes the auth model and omits five required env vars (DOC-002), and
`docs/architecture.md` still lists "add a durable outbox" as future work (DOC-003). One gap
worth closing: `docs/subsystems.md` is where the non-obvious calendar rules live, so the
invariant behind MAINT-003 — *a signup event's `time` must be `H:MM` or it will not appear in
the feed* — belongs there next to the UID warning.

**`ARCHITECTURE_REVIEW.md` was deliberately not created.** `docs/architecture.md` exists, is
substantially accurate, and the review brief says to create that artifact only when
architecture documentation is absent, materially incomplete or seriously outdated. It is none
of those; it has one stale recommendation, filed as DOC-003.

---

## 13. Positive findings

Verified strengths, not merely "no defect found":

- **Parameterized SQL with no exceptions.** Searched for concatenation, `.unsafe`, `.raw` and
  dynamic identifiers across all nine handlers. Nothing. No injection candidate exists.
- **JWT done properly.** `algorithms: ['HS256']` pinned on verify, issuer and audience
  checked, 2 h expiry, and `getJwtConfig` *throws* rather than falling back when
  `SESSION_SECRET` is short or matches a placeholder pattern. `Number.isInteger(decoded.tokenVersion)`
  closes the `undefined === undefined` hole, and the version is re-read from the database on
  every request so revocation is immediate.
- **Login hardening that reflects real thought.** A dummy bcrypt hash flattens the
  username-enumeration timing channel, the CSRF compare is constant-time, and the three
  layered limits include a deliberately IP-agnostic per-account cap — the one control that
  survives the XFF bypass.
- **The upload chain is the strongest validation in the codebase**, and it holds under
  attack: protocol, hostname, cloud name, resource type, delivery type, `fau-documents/`
  prefix, public-id equality, and then a provider round-trip that stores what Cloudinary
  actually parsed rather than what the client claimed.
- **Two race conditions recognised and correctly handled.** The event-delete CTE pre-checks
  registrations *and* catches the `23503` FK violation for one that commits in between,
  mapping both to the same stable response. Both `FOR UPDATE SKIP LOCKED` claim patterns are
  textbook-correct.
- **Calendar correctness is genuinely hard and genuinely right.** ICS folding is octet-correct
  and never emits a lone surrogate (verified with `æ`, 4-byte emoji and Norwegian prose,
  round-tripping exactly). Oslo DST converts correctly in both directions, including the
  ambiguous fall-back hour and the *non-existent* spring-forward hour. `weeksOfMonth` is
  correct across ISO-week-53 years, February in a leap year starting on a Monday, and months
  spanning a year change.
- **The newsletter opt-in subsystem is well built.** 256-bit tokens, an anchored regex applied
  before any query, confirm scoped to `status = 'pending'` and nulling the token on use,
  unsubscribe always reporting success so it cannot be used as an oracle, and subscribe
  returning a generic success so membership cannot be probed.
- **Redaction is applied on every logging path traced**, and the Sentry envelope carries only
  the redacted message plus stack function names — no bodies, headers or cookies.
- **Zero dependency vulnerabilities**, security-relevant packages exactly pinned (not ranged),
  `overrides` used deliberately, and a Dependabot config with a genuinely well-reasoned
  grouping comment explaining why zod/drizzle-zod/@hookform/resolvers must move together.
- **The i18n ratchet is a good mechanism** — a budget that may fall but never rise, enforced
  in `npm run check`.
- **Documentation discipline is above average for a volunteer project** (section 12).

---

## 14. Remediation roadmap

### Phase 1 — Stop-the-line (do before any feature work) — **COMPLETE (2026-09-19)**
~~`SEC-001` · `DB-001` · `REL-001` · `TEST-001` · `A11Y-001`~~

All five are implemented and verified; see `REVIEW_TASKS.md` for the per-task
acceptance criteria that were met. Verification highlights: the ReDoS is gone
(256 KB went from 11 192 ms to 0.2 ms, and cost is now flat in input size); the
rewritten registration statement was executed against PostgreSQL 16, including
the concurrent last-seat race, and a repair migration reconciles rows that
already drifted; the missing imports are guarded by both a compiler ratchet and
a unit test that fails with `ReferenceError` if they are removed again.

Four of the five are small. `SEC-001` is a reordering (truncate before the regex, and move
`checkRateLimit` above sanitization). `REL-001` is two import lines — but land `TEST-001`
(a `tsconfig.api.json` with `checkJs: true`, verified to emit exactly those two diagnostics
and no noise) in the same change, or the hole stays open. `A11Y-001` is a `KeyboardSensor`
plus an `onKeyDown`. `DB-001` is the real work: restructure the CTE so `events` is touched at
most once, and add a data repair for rows that have already drifted.

### Phase 2 — Functional integrity — **COMPLETE (2026-09-21)**
~~`REL-002` · `PERF-001` · `MAINT-001` · `MAINT-002` · `MAINT-003` · `TRACE-001` · `TRACE-002`
· `PERF-002` · `TRACE-006`~~ — plus `MAINT-004`, `PERF-004` and `TRACE-003/004/005`, which
shared a root cause with items already being changed.

Worth recording: the first attempt at `MAINT-001` keyed import identity on title + type +
date, which fixed the reported defect and broke the opposite case — an entry whose date was
corrected in the sheet stopped being recognised as an edit. An existing smoke test caught it.
Identity is now a pairing within a title+type bucket: one entry matched by one row pairs
wherever it sits, several on either side pair only on an exact position, and anything that
cannot be paired unambiguously is held back rather than guessed.

*Depends on Phase 1* (REL-002 and PERF-001 both assume REL-001 is fixed, or the run still
dies on the first failure). REL-002 and PERF-001 must land together: widening the claim
predicate without pooling just strands rows more slowly, and pooling without widening leaves
the existing stranded rows unrecoverable.

### Phase 3 — Reliability, performance and operations — **COMPLETE (2026-09-21)**
~~`SEC-002` · `SEC-004` · `REL-003` · `OBS-001` · `OBS-002` · `DB-002` · `DB-003` · `DB-004` ·
`PERF-003` · `PERF-004` · `MAINT-006` · `MAINT-007` · `MAINT-008`~~

OBS-001 and OBS-002 were done first, as planned: production errors are now awaited into Sentry
rather than raced against the instance freezing, and every non-2xx response writes one JSON
line carrying the request id, route, multiplexed `action`/`resource`, actor and duration. The
request id is `x-vercel-id`, echoed back as `X-Request-Id` so a parent can quote it. PERF-004
was on this list but had already shipped in Phase 2.

Two findings are worth recording, because both are places where the obvious fix is wrong.

**DB-002's preferred fix does not survive contact with concurrency.** Deriving
`current_attendees` in `mapEvent`'s query is right and is done — nothing rendered to a parent
can drift again. Deriving it in the *capacity check* is not: a statement takes one snapshot, so
a `SUM` over `event_registrations` cannot see a registration committed by the transaction the
statement just waited behind on the `FOR UPDATE`, whereas the `events` row itself is re-fetched
by EvalPlanQual and can. Executed against PostgreSQL 16, with two sessions racing for the last
seat: the derived check admitted **two** registrations to a one-seat event, the locked counter
admitted **one**. The counter therefore stays as the value the capacity check compares, and
`reconcileEventAttendeeCounts` in the 07:00 cron repairs drift against `SUM(attendee_count)` —
guarded so that it stands down rather than clobbering a registration that lands mid-repair.
Dropping the column entirely needs the check split across two statements of one transaction,
which turns on Neon's HTTP transaction semantics; that is a deliberate piece of work, not a
side effect of this phase.

**DB-004 is an unbounded-retry problem, not a truncation problem.** REL-002 already made a
truncated broadcast resumable. What kept a post alive forever was a single address that could
never be delivered to: its row stayed `pending`, the item is only stamped once nothing of it is
pending, so the post was re-queued nightly and mailed itself to everyone who subscribed months
later — and the row could never be aged out either, because DB-003's retention only collects
rows that reached a terminal state. `MAX_DELIVERY_ATTEMPTS` retires such a row to `failed`,
which closes all three.

### Phase 4 — Maintainability
`MAINT` refactors in section 9 · `TRACE-003/004/005` · `SEC-005/006/007` · `ARCH-001` ·
`DB-005/006/007/008`

*Depends on Phase 2* for the `secure-settings.js` mapper work, which subsumes TRACE-002 and
TRACE-006.

### Phase 5 — Quality
`TEST-002` and the ranked test gaps · remaining `A11Y-004`…`A11Y-022` · `DOC-001/002/003`

DOC-001 should arguably jump to Phase 1 — it is a five-minute edit, and until it is done every
future agent and contributor is working from a task list that is wrong about 11 items.

**Parallelism.** Phase 1's five items are mutually independent except REL-001↔TEST-001.
Within Phase 2, the yearly-calendar import work (MAINT-001/002), the mail work
(REL-002/PERF-001/PERF-002) and the frontend work (TRACE-001/002) are three independent
streams. The accessibility and documentation items are independent of everything.

---

## 15. Blocked and unverified areas

| Area | Why blocked | How it limits confidence | What would settle it |
|---|---|---|---|
| Production database state | No Neon access | Whether migrations were applied, which indexes exist, real row counts, and whether `current_attendees` has already drifted are all unknown. DB-001's *semantics* are certain (executed locally); its production *blast radius* is not | `SELECT indexname, indexdef FROM pg_indexes…`; `SELECT id, current_attendees, (SELECT SUM(attendee_count) FROM event_registrations r WHERE r.event_id = e.id) FROM events e` |
| Vercel `X-Forwarded-For` semantics | No deployment | Decides whether SEC-002 is High or Low | One `curl -H 'X-Forwarded-For: 1.2.3.4'` against a preview, echoing the header |
| ~~`?lang=en` through the ICS rewrite~~ | **Settled 2026-09-21** | Not a defect. Vercel merges the incoming query into the rewrite destination: production returns `X-WR-CALNAME:FAU Erdal Barnehage` by default and `FAU Erdal Kindergarten` for `?lang=en`. TR-06 is now PASS | — |
| Real SMTP latency | No credentials, no network to Gmail | PERF-001's 90–250 band is reasoned from protocol round trips, not measured | Instrument `sendEmail` with `performance.now()` on staging; compare `sent` vs `processed` over a week |
| Sentry ingest on Vercel | No runtime | OBS-001's code path is certain; the delivery rate is not. The fix is correct either way | Trigger a known 500 in production and check whether it appears |
| Focus order, focus visibility, reflow at 320 px, live-region announcement | No browser or screen reader | Four accessibility areas are reported as NEEDS RUNTIME/AT VERIFICATION rather than as failures. **No reflow finding is claimed, because none could be proven** | Browser at 320 px and 200 % zoom; NVDA/VoiceOver pass |
| Legacy `documents` rows | No production data | SEC-007's exposure depends on whether any row predates the `cloudName` check | `SELECT id, cloudinary_url FROM documents WHERE cloudinary_url NOT LIKE 'https://res.cloudinary.com/<cloud>/%'` |
| Production env configuration | Secrets | SEC-004's severity depends on whether `CRON_SECRET` is set everywhere, and whether previews share the production `DATABASE_URL` | Vercel project settings |

---

## 16. Final engineering verdict

**Security — can the system be trusted?** For confidentiality and access control, largely
yes: authorization was traced across all 51 operations and is consistently enforced before
every side effect, SQL is uniformly parameterized, and no authentication or authorization
bypass was found. For *availability*, no — SEC-001 is a confirmed, unauthenticated, one-request
route to taking the API down, and SEC-002 removes the throttle from every public endpoint.

**Correctness — can primary flows be trusted end to end?** Mostly, with three exceptions that
matter: event registration corrupts capacity and then refuses real parents (executed and
observed); the newsletter silently reaches a fraction of subscribers past ~150 and never
retries; and reminders silently stop at 25 per event. All three report success.

**Performance — material scaling concerns?** Not for reads, bundles or the database at this
scale. Outbound mail is the one place where the system cannot do what it claims, and it is
throughput-bound by a one-line configuration omission.

**Maintainability — can engineers safely modify it?** In the newer code, yes — it is
internally consistent and well documented. Two files (`secure-settings.js`,
`registrations.js`) mix enough concerns that changes there carry real risk, and an untyped
backend means the compiler will not help.

**Testability — would regressions be detected?** Partly. Authorization and calendar
invariants are genuinely protected. The bulk-import engine, the photo-slot allocator, the
07:00 cron, and every error branch behind `NODE_ENV === 'production'` are not — and that is
demonstrably where the defects are.

**Operational confidence — how safe is deployment?** Low, not because deploys are risky but
because failures are invisible. Sentry probably is not receiving events, no log identifies a
request or an actor, and a cron can fail for weeks without anyone knowing.

**Technical debt — localized, moderate, systemic or architectural?** **Moderate and
localized**, not architectural. The structure is sound; the debt concentrates in two large
handlers, one missing compiler flag, and one mail configuration line. Phase 1 is five changes.

### Overall recommendation: **Requires significant remediation**

This is the same headline as the 2026-09-09 review, and that deserves context rather than
being read as stagnation. Eleven of that audit's tasks were genuinely completed in the
interim, including all four of its P1 database items. This review reaches the same verdict
because it went deeper — a live PostgreSQL reproduction, a measured ReDoS, and a `checkJs`
scan — and found problems the earlier pass could not have seen with static reading alone.

The distinguishing feature of every confirmed defect here is that it **fails silently behind a
successful-looking response**. That is the thing to fix about the system beyond the individual
bugs: Phase 1 and the observability items in Phase 3 together convert this codebase from one
that hides its failures into one that reports them.
