# Findings — quality (maintainability, tests, observability, docs, a11y)

### TEST-1 Integration fixture builds a schema production never had
Area: TEST · Severity: Medium · Confidence: CONFIRMED · Verified: db (local PostgreSQL 16)
Where: `tests/integration/postgres-fixture.mjs:84-88` — creates every table from `shared/schema.ts` via drizzle-kit **first**, then runs `migrations/*.sql`, whose `CREATE TABLE IF NOT EXISTS` blocks (0001, 0003, 0008, 0009, 0016) become no-ops.
Evidence: CHECK constraints exist only in those migration blocks (`shared/schema.ts` declares none). Reproduced: the cron's abandon UPDATE succeeds on the fixture schema (`status='failed'`) and fails with 23514 on a schema where 0008 created the table (`04-verification.md`). Also missing in CI: `attempts >= 0` (0008) and the `slot` format CHECK (0009).
Cause → Impact: "the isolated PostgreSQL gate" validates statements against a looser schema → schema/code disagreements such as TR-1 pass CI.
Fix: build the fixture from migrations only (a `0000_base.sql` baseline of the pre-0001 tables, or a `pg_dump --schema-only` of production), or have drizzle skip tables a migration creates; add a check that fixture constraints equal migration constraints. · Regression risk: fixture setup time.
Dependencies: TR-1.
Related: several offline suites pin implementation text rather than behaviour — e.g. `tests/backend-invariants.test.mjs:76-77` asserts the literal `status = ${exhausted ? 'failed' : 'pending'}`, `tests/registration-integrity.test.mjs:31-48` slices `api/registrations.js` source. 10 of 39 offline suites read source files (`grep -c readFileSync`). They are cheap guards, but they encoded the bug in TR-1 as a requirement.

### TEST-2 No behavioural test for the public-signup business rules
Area: TEST · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `tests/` has no handler-harness suite for `POST /api/registrations` (only `registration-cancel`, `registration-integrity` source checks, `photo-slots` allocator). IN-1 (attendee cap, foto capacity, slot exhaustion) and IN-2 (mail content) are therefore unprotected.
Fix: `tests/registrations-handler.test.mjs` with cap, full-foto-day, duplicate, deadline and mail-content cases. · Regression risk: none.

### OBS-1 Mail delivery failure is visible only one message at a time
Area: OBS · Severity: Low · Confidence: HIGH · Verified: static
Where: `api/_shared/provider-errors.js` (per-send report), `api/cron/event-reminders.js:561` (`reminder_attempts` incremented, never read), `:342-347` (abandon log — unreachable today, TR-1).
Evidence: confirmation/contact mails run in `waitUntil` and only log on failure; there is no counter or alert for "N failures today", and the council UI has no delivery status. A Gmail quota/suspension (IN-2) would show up as scattered Sentry events.
Fix: include `failed` counts in the cron's `cron.run` line (already structured) and alert on it; surface pending/failed deliveries in the admin UI.

### MAINT-1 Event validation is duplicated between POST and PUT
Area: MAINT · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/events.js:222-272` vs `:288-338` — the same destructure, 6 sanitizers and 6 validation branches copied verbatim (~50 lines).
Current → problem → proposed → benefit: two copies → a rule fixed in one (as happened for date/time) must be remembered in the other → one `validateEventBody(body)` returning `{ error } | { values }` → one place to change, one test.

### MAINT-2 Two wire shapes per resource in `secure-settings.js`
Area: MAINT · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/secure-settings.js:253,264` (blog GET aliases columns inline) vs `mapBlogPost` (`:28-45`); `:376-378` (kindergarten GET inline) vs `mapKindergartenInfo` (`:59-73`); `:565` contact reply returns inline aliases vs `mapContactMessage`. AGENTS.md: "Each resource has exactly one `map*(row)` function".
Impact: a column added to the mapper is silently missing from reads (the defect class the comment at `:20-27` describes). 750-line multiplexer makes this easy to miss.
Fix: SELECT raw rows and map through the existing mappers (public blog GET can map then omit fields).

### MAINT-3 Backend type gate tolerates 52 diagnostics
Area: MAINT · Severity: Low · Confidence: CONFIRMED · Verified: build
Where: `npm run check` → "backend types: 0 undefined identifiers, 52 other diagnostics, at budget" (`scripts/check-backend-types.mjs`).
Note: deliberate ratchet (like the i18n budget of 31); listed so the budget keeps falling.

### A11Y-1 Week label on the calendar list fails text contrast (light theme)
Area: A11Y · Severity: Low · Confidence: CONFIRMED · Verified: runtime (axe-core 4, Chromium, 375 px light)
Where: `client/src/components/calendar-entry-list.tsx:216` — `text-micro font-semibold uppercase … opacity-80` inside `bg-green-50 text-brand`.
Evidence: axe `color-contrast` (serious): `#3a8666` on `#e8f3e8` = 3.85:1 at 13 px normal; WCAG 1.4.3 and the style guide require 4.5:1. The opacity dims an otherwise compliant token.
Fix: remove `opacity-80` (the token alone passes) — the guide asks for tokens, not opacity, to set emphasis.

## A11y coverage
- Runtime axe (WCAG 2.0/2.1/2.2 A+AA tags) on `/`, `/kalender`, `/nyheter`, `/contact`, `/files`, `/nyhetsbrev`, `/personvern`, `/avmelding` at 375 px light and 1280 px dark (dark verified: `html.dark`, body `rgb(9,26,21)`), API mocked: 1 violation (A11Y-1) in 16 page scans.
- Static: no clickable `div/span/li` (`grep` 0), every `<img>` has `alt`, skip link targets `<main tabIndex=-1>`, `lang` switches `nb`/`en`, 16 live-region/alert usages, `client-invariants` checks accessible names on icon-only controls.
- Not covered: authenticated editor pages, dialogs' focus trapping, screen-reader announcements, 200 % zoom/reflow — needs a signed-in session and AT.

## Positive findings
- Structured JSON logs with request id, actor id/role, redaction and a mutation audit line (`api/_shared/log.js`, `withApiHandler`).
- Handler harness runs real handlers through real middleware (`tests/helpers.mjs`); authorization matrix over every protected route.
- Ratchets for inline i18n and backend type diagnostics prevent regressions without blocking work.
- Documentation is current and specific (`AGENTS.md`, `docs/architecture.md`, `docs/subsystems.md`, `migrations/README.md` deployment-order notes).

## Ambiguities
- Whether source-text guard suites are meant to stay (AGENTS.md endorses three of them explicitly).
