# Review Remediation Tasks — 2026-09-18 audit

> **Phase 3 is complete** (2026-09-21): OBS-001 + OBS-002, SEC-002, SEC-004,
> REL-003, DB-002, DB-003, DB-004, PERF-003 and MAINT-006/007/008 are
> implemented and verified. PERF-004 was on the Phase 3 list but had already
> shipped in Phase 2, so it carried no work. Two notes worth keeping:
>
> DB-002 asked to make `current_attendees` derived and drop the counter. The
> read paths now derive it, so nothing rendered to a parent can drift again —
> but the capacity check still compares the stored counter under `FOR UPDATE`,
> because deriving it *there* reintroduces the last-seat race. A single
> statement takes one snapshot, so a sum over `event_registrations` cannot see
> the registration committed by the transaction it just waited behind, while an
> `events` row read under `FOR UPDATE` is re-fetched by EvalPlanQual and can.
> Executed against PostgreSQL 16: the derived check let two parents take a
> one-seat event, the locked counter let exactly one. Dropping the column would
> need the check split across two statements of one transaction, which depends
> on Neon's HTTP transaction semantics — worth doing deliberately, not as part
> of this phase. `reconcileEventAttendeeCounts` in the 07:00 cron now repairs
> drift and stands down when it races a live registration.
>
> DB-004's zombie post is fixed by bounding delivery attempts
> (`MAX_DELIVERY_ATTEMPTS`). An address that can never be delivered to used to
> hold its row `pending` forever, which kept the source item unstamped, re-queued
> it nightly, and mailed it to everyone who subscribed afterwards — and kept the
> row out of reach of DB-003's new retention, which only collects terminal rows.
>
> **Phase 2 is complete** (2026-09-21): REL-002 + PERF-001, PERF-002, MAINT-001,
> MAINT-002, MAINT-003, MAINT-004, TRACE-001 through TRACE-006 and PERF-004 are
> implemented and verified. The P2 table below marks each one done.
>
> **Phase 1 is complete** (2026-09-19): SEC-001, DB-001, REL-001, TEST-001 and
> A11Y-001 are implemented, verified and marked `[x]` below. The DB-001 fix was
> verified by executing the rewritten statement — including the concurrent
> last-seat race — against a real PostgreSQL 16 instance, and ships with a
> repair migration (`migrations/0012_registration_capacity_repair.sql`) for rows
> that already drifted. Phase 2 is the next block of work.

Derived from [`REPO_REVIEW.md`](REPO_REVIEW.md) and [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).
Companion to the existing [`docs/review-backlog.md`](docs/review-backlog.md) — **read DOC-001
first**, because that file's checkbox state is wrong on 11 of its 28 items.

**House rules** (from `AGENTS.md`, unchanged): do not weaken server-side RBAC, CSRF,
parameterized SQL or sanitization. Schema changes need **both** `shared/schema.ts` and a new
numbered `migrations/*.sql` — never edit or renumber an applied one. Never test against the
production Neon database. Preserve Norwegian **and** English strings. Do not hand-edit
`client/src/components/ui/**`. Every task runs `npm run check`, `npm test` and `npm run build`
plus its own listed verification.

## Dependency graph

```text
TEST-001 ──┬─ REL-001            (land together: the fix and the guard)
           └─ (enables) every future backend correctness task

SEC-001 ───── independent, do first (smallest P0, largest blast radius)
DB-001 ────┬─ DB-002             (DB-002's "make it derived" fix subsumes DB-001's counter)
           └─ TEST-004           (the test that should have caught it)
A11Y-001 ──── independent

REL-002 ══╤══ PERF-001           (MUST land together — see each task's Dependencies)
          └── PERF-002
MAINT-001 ─── MAINT-004          (same root cause: identity beyond title)
MAINT-002 ─── independent
TRACE-002 ─┬─ TRACE-006          (both fixed by giving secure-settings.js mappers + an id helper)
           └─ MAINT-015          (the secure-settings.js refactor)
TRACE-001 ─── MAINT-009          (MAINT-009 is only latent because TRACE-001 exists)
OBS-001 ───── OBS-002            (do before verifying any Phase 1/2 fix in production)
```

**Safe to run fully in parallel:** SEC-001 · A11Y-001 · MAINT-002 · MAINT-003 · DOC-001 ·
DOC-002 · and each A11Y task after A11Y-001.

---

## [x] SEC-001 — Fix quadratic backtracking in `sanitizeText` and rate-limit before sanitizing

**Priority:** P0 · **Severity:** Critical · **Confidence:** Confirmed (measured twice) · **Effort:** Small · **Area:** Security / Availability

### Files
- `api/_shared/middleware.js` (`INLINE_EVENT_HANDLER` :335, `removeUntilStable` :340-348, `sanitizeText` :350-359)
- `api/contact.js` (:63 sanitize, :80 rate limit — wrong order)
- `api/registrations.js` (:98-102 sanitize, :160-175 rate limit — wrong order)
- `tests/sanitizer-runtime.test.mjs`

### Problem
`INLINE_EVENT_HANDLER = /on\w+\s*=\s*["'][^"']*["']/gi` has no `=` to anchor on, so on input
like `"ondata".repeat(n)` the engine starts at each `on`, lets `\w+` consume the remainder,
then backtracks one character at a time — O(n²). `maxLength` does not bound it because
`.substring(0, maxLength)` runs **after** both `removeUntilStable` passes. An unauthenticated
POST reaches this before any rate limit.

### Evidence
Measured against the real module, two independent harnesses agreeing:
```
 32KB ->   175 ms      128KB ->  2779 ms
 64KB ->   711 ms      256KB -> 11192 ms     (2× input ≈ 4× time)
```
`vercel.json` sets `maxDuration: 30`, so ~420 KB burns a whole function slot. In
`api/contact.js`, `sanitizeText(message, 5000)` is line 63; the first `checkRateLimit` is line
80 — so the limiter never throttles this. `POST /api/registrations` is the same shape
(`name`, `comments`, and `childrenNames` × 100).

**`sanitizeHtml` already does this correctly** — `middleware.js:381` truncates first. Match it.

### Required change
1. In `sanitizeText`, bound the input before any regex runs, e.g.
   `const input = String(text).slice(0, maxLength * 4)`.
2. Make `INLINE_EVENT_HANDLER` non-backtracking — bound every quantifier, e.g.
   `/\bon[a-z]{1,20}\s{0,10}=\s{0,10}["'][^"']{0,2000}["']/gi` — or drop it entirely for
   plain-text fields, since `<` and `>` are stripped first so no attribute context can exist.
3. Cap `removeUntilStable` at a small fixed pass count.
4. Move `checkRateLimit` **above** all sanitization in `api/contact.js` and
   `api/registrations.js`, and reject oversized fields with a 413 before sanitizing.

### Acceptance criteria
- [ ] `sanitizeText('ondata'.repeat(100000), 5000)` completes in under 50 ms.
- [ ] Time grows linearly, not quadratically, across 32/64/128/256 KB inputs.
- [ ] A request exceeding the field cap is rejected with 413 before sanitization runs.
- [ ] `checkRateLimit` is the first DB call in both handlers; a 4th request from one IP within
      the window is refused without doing sanitization work.
- [ ] Every existing assertion in `tests/sanitizer-runtime.test.mjs` still passes.
- [ ] Norwegian prose with `æøå`, and the existing bypass fixtures, sanitize identically to before.

### Verification
Add a timing assertion to `tests/sanitizer-runtime.test.mjs`. Re-run the 32→256 KB table and
confirm linear growth. `npm run verify`.

### Dependencies
None. Do this first — smallest change, largest blast radius.

### Related findings
SEC-005 (same function, different defect — consider fixing together), REL-003.

---

## [x] DB-001 — Rewrite the registration CTE so `events` is updated at most once

**Priority:** P0 · **Severity:** Critical · **Confidence:** Confirmed (executed on PostgreSQL 16) · **Effort:** Large · **Area:** Database / Data correctness

### Files
- `api/registrations.js:246-308` (`capacity_update` :255-266, `rollback_capacity` :292-299)
- new `migrations/0012_*.sql` (data repair)
- new `tests/registration-capacity.test.mjs`

### Problem
`capacity_update` and `rollback_capacity` both `UPDATE events` for the same `id` in one
statement. PostgreSQL §7.8.2: *"Trying to update the same row twice in a single statement is
not supported."* The second is silently skipped. Because `rollback_capacity`'s qual contains
`EXISTS (SELECT 1 FROM capacity_update)`, ordering is forced and the rollback **always loses,
in exactly the case it exists to handle** — a duplicate email, or an `ON CONFLICT DO NOTHING`
from a concurrent insert.

### Evidence
Executed against a throwaway PostgreSQL 16 cluster, schema transcribed from `migrations/0001`
and `0009`, `max_attendees = 2`:
```
1st signup (new email):   capacityReserved=1 inserted=1 rolledBack=0  → current_attendees=1  ✓
2nd signup (SAME email):  capacityReserved=1 inserted=0 rolledBack=0  → current_attendees=2  ✗
                                                        ↑ should be 1
ground truth:             real_registrations=1  real_attendees=1
new parent tries:         capacityReserved=0 inserted=0               → "Event is at capacity"
                          current_attendees=2 / max_attendees=2, but only 1 seat truly taken
```
A parent who double-submits permanently burns a seat, and a real parent is then refused.
Second, independent defect: all CTEs share one snapshot, so even if the rollback applied it
would compute `snapshot − N` rather than `(snapshot + N) − N`, double-subtracting.
`grep -rl "rollback_capacity\|capacity_update\|current_attendees" tests/ scripts/` is empty.

### Required change
Restructure so `events` is touched at most once. Invert the order: do the
`INSERT … RETURNING` first (gated on a `target_event` capacity check against the snapshot),
then a single `capacity_update` whose `WHERE` includes
`EXISTS (SELECT 1 FROM inserted_registration)`. Delete `rollback_capacity` entirely. Keep the
unique index as the duplicate boundary and keep the `reserved_slots` insert and its
`isPhotoSlotConflict` retry. Add a repair migration reconciling existing rows:
```sql
UPDATE events e SET current_attendees = COALESCE(agg.total, 0)
FROM (SELECT event_id, SUM(attendee_count)::int AS total
      FROM event_registrations GROUP BY event_id) agg
WHERE e.id = agg.event_id AND e.current_attendees IS DISTINCT FROM agg.total;
```
(plus a branch setting `current_attendees = 0` for events with no registrations at all).

### Acceptance criteria
- [ ] A duplicate-email signup leaves `current_attendees` unchanged and still returns
      `400 "This email is already registered for this event"`.
- [ ] After N duplicate submits, `current_attendees` equals `SUM(attendee_count)`.
- [ ] A genuine new parent can still take the last seat after any number of duplicate attempts.
- [ ] The 404 / at-capacity / duplicate response triplet is byte-identical to today.
- [ ] Photo-slot reservation and the 409 retry path are unchanged (`tests/registration-integrity.test.mjs` passes).
- [ ] The repair migration is idempotent and safe to re-run.

### Verification
Reproduce the table above on a local PostgreSQL (`initdb` + the schema from `migrations/`) and
assert `rolledBack`/`current_attendees` at each step. Add the fixture as a permanent suite.
Then run the concurrency case: two simultaneous signups for the last seat — exactly one wins,
and the counter ends at `max_attendees`.

### Dependencies
None to start, but coordinate with **DB-002** — if you take DB-002's "make it derived" option,
it subsumes this counter entirely and both should be one change.

### Related findings
DB-002, TEST-004. Supersedes nothing in `docs/review-backlog.md` (DB-003 there covered the
*delete* path, which is correct).

---

## [x] REL-001 — Add the two missing imports in the cron handler

**Priority:** P0 · **Severity:** High · **Confidence:** Confirmed (runtime repro) · **Effort:** Trivial · **Area:** Reliability

### Files
- `api/cron/event-reminders.js` (imports :1-15; uses at :249 and :435)

### Problem
`Sentry` (:249) and `reportProviderError` (:435) are referenced but never imported. Both sit
in error-only branches, so the module imports cleanly and nothing catches it statically.

### Evidence
```
$ node cron-proof.mjs        # failing SMTP, NODE_ENV=production
Failed to send newsletter delivery: SMTP 421 rejected
THREW: ReferenceError - Sentry is not defined
```
The throw escapes `runWithConcurrency`, so the first transient SMTP failure aborts the entire
evening broadcast. `reportProviderError` at :435 is **not** env-gated, so it throws on the
first failed reminder in any environment — and that also skips `cleanupPrivacyRetention` and
`cleanupExpiredRateLimits`, which run after the send loop.

### Required change
```js
import Sentry from '../_shared/sentry.js';
import { reportProviderError } from '../_shared/provider-errors.js';
```
Prefer replacing the bare `Sentry.captureException(new Error(safeError))` at :249 with
`reportProviderError('Failed to send newsletter delivery', emailError)` for consistency with
every other provider call site — that also removes the redundant outer
`if (NODE_ENV === 'production')`, since `reportProviderError` checks internally.

### Acceptance criteria
- [ ] A failing `send` in `broadcastNewsletter` under `NODE_ENV=production` returns a normal
      result object with `failed: 1` instead of throwing.
- [ ] The delivery row is released to `pending` with backoff, as today.
- [ ] A failing reminder send leaves `reminder_claimed_at = NULL` and lets retention cleanup run.

### Verification
Re-run the existing `tests/newsletter-broadcast.test.mjs` failure test with
`NODE_ENV=production` — see TEST-001, which adds exactly that.

### Dependencies
**Land with TEST-001.** Fixing these two lines without closing the detection hole leaves the
next occurrence free to ship.

### Related findings
TEST-001 (root cause), MAINT-010 (same failure shape), OBS-001.

---

## [x] TEST-001 — Type-check the backend so undefined identifiers cannot ship

**Priority:** P0 · **Severity:** High · **Confidence:** Confirmed (scan reproduced) · **Effort:** Small · **Area:** Testing / Tooling

### Files
- `tsconfig.json`, new `tsconfig.api.json`, `package.json` (`check` script)
- `tests/newsletter-broadcast.test.mjs`

### Problem
`tsconfig.json` sets `"allowJs": true, "checkJs": false` and there is no ESLint. `api/**` and
`shared/**` are plain `.js` by design, so **no tool in the repository can detect an undefined
identifier in the backend.** That is why REL-001 shipped.

### Evidence
Running `tsc --noEmit` with `checkJs: true` over `api/**`, `shared/**`, `scripts/**` and
`tests/**` yields exactly:
```
api/cron/event-reminders.js(249,9): error TS2552: Cannot find name 'Sentry'.
api/cron/event-reminders.js(435,9): error TS2304: Cannot find name 'reportProviderError'.
```
and no unresolved-name noise — so it can be enabled today at a ratchet of zero.
`client/src/**` is `.ts`/`.tsx` throughout and is genuinely checked, so the class cannot exist
there; these two are the only instances in the repo.

### Required change
```jsonc
// tsconfig.api.json
{ "extends": "./tsconfig.json",
  "include": ["api/**/*.js", "shared/**/*.js"],
  "compilerOptions": { "checkJs": true, "strict": false, "noImplicitAny": false } }
```
```json
"check": "tsc && tsc -p tsconfig.api.json --noEmit && node scripts/check-i18n.mjs"
```
Separately, parameterise the existing newsletter failure test with `NODE_ENV=production` so
error-path branches are reachable from tests at all — and consider removing the outer
`if (NODE_ENV === 'production')` gates at `event-reminders.js:248`, `middleware.js:108` and
`provider-errors.js:386`, since each inner helper already re-checks the environment. Those
gates are the only reason the branches are untestable.

### Acceptance criteria
- [ ] `npm run check` fails on a deliberately introduced undefined identifier in `api/`.
- [ ] `npm run check` passes on the fixed tree with zero diagnostics.
- [ ] CI runs the new config (it already runs `npm run check`, so no workflow change needed).
- [ ] The newsletter failure test runs under `NODE_ENV=production` and would have caught REL-001.

### Verification
Temporarily add `Foo.bar()` to any `api/*.js` and confirm `npm run check` goes red; remove it
and confirm green. `npm run verify`.

### Dependencies
Land with REL-001.

### Related findings
REL-001, TEST-002, MAINT-010.

---

## [x] A11Y-001 — Make yearly-calendar entries operable by keyboard

**Priority:** P0 · **Severity:** Critical · **Confidence:** Confirmed (static) · **Effort:** Medium · **Area:** Accessibility
**WCAG:** 2.1.1 Keyboard (Level A) — primary; 2.5.7 Dragging Movements (Level AA)

### Files
- `client/src/pages/yearly-calendar.tsx:463-466` (sensors), `:316-335` (`DraggableEntry`)
- `client/src/lib/i18n.ts` (announcement strings, both languages)

### Problem
`useSensors` registers only `MouseSensor` and `TouchSensor`. The draggable is a bare `<div>`
with `onClick` and **no `onKeyDown`**. dnd-kit's `attributes` add `role="button"` and
`tabIndex={0}`, so an entry is focusable — and then responds to nothing: not Enter, not Space,
not arrows. The edit modal contains a date/week field that would satisfy the 2.5.7
single-pointer alternative, but it is unreachable from the entry, so that escape hatch does
not apply.

### Evidence
```jsx
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
);
```
Per `AGENTS.md`, the `staff` role exists *solely* to edit yearly-calendar entries. A
keyboard-only or switch user holding that role cannot perform the only task their account is
for. The per-day `+ Legg til` buttons create a new entry; they cannot move an existing one.

### Required change
1. Add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`.
2. Give `DraggableEntry` an activation path — attach **after** the `{...listeners}` spread, or
   gate on keys dnd-kit does not consume, to avoid double-firing:
   ```jsx
   onKeyDown={(e) => {
     if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); }
   }}
   ```
3. Pass `accessibility={{ announcements, screenReaderInstructions }}` to `<DndContext>` using
   translated strings from `i18n.ts` — dnd-kit's English defaults would otherwise be announced
   to Norwegian users.

### Acceptance criteria
- [ ] Tab reaches an entry when `canEdit` is true; Enter opens the edit modal; Space picks it
      up; arrows move it between days/weeks; Enter drops; Escape cancels.
- [ ] Mouse drag behaviour is unchanged (the `distance: 5` constraint still applies).
- [ ] Announcements are spoken in the active language.
- [ ] No double-firing between the custom `onKeyDown` and dnd-kit's own listener.

### Verification
Keyboard-only pass over a month with edit rights. Then NVDA or VoiceOver to confirm
announcements. Manual — this cannot be covered by the existing test tiers.

### Dependencies
None.

### Related findings
A11Y-010 (grid semantics), A11Y-021 (target size). Matches open backlog item **A11Y-001**.

---

## [x] REL-002 + PERF-001 — Make newsletter delivery actually deliver (land together)

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed (REL-002, static) / High (PERF-001) · **Effort:** Medium · **Area:** Reliability / Performance

### Files
- `api/cron/event-reminders.js:165-191` (claim), `:119-163` (fan-out), `:253-295` (stamping), `:20` (`MAX_NEWSLETTER_EMAILS_PER_RUN`)
- `api/_shared/email.js:9-25` (transporter)
- `vercel.json` (cron schedule, `maxDuration`)

### Problem
Two defects that only make sense to fix together.

**REL-002 — retry is inert.** The claim query is scoped `WHERE event_date = ${targetDate}`
while the cron runs once daily with `targetDate = tomorrowInOslo()`. A delivery that fails its
first send gets `next_attempt_at = now + minutes`, but the next run uses a *different*
`targetDate` and never sees it again. The same applies to rows left `processing` — so the
10-minute lease reclaim is dead code under a daily schedule. The re-queue at `:157-162` only
re-dates rows `WHERE status = 'pending'`, so `processing` rows are never rescued, and
`due_items` only re-selects events/entries whose `date = targetDate`, which is in the past by
then. Stranded rows also block the `newsletter_sent_at` stamping forever.

**PERF-001 — throughput.** `pool` is unset, so nodemailer opens a fresh TCP+TLS+AUTH per
message (~300 ms best case, 600 ms–1.5 s typical). At `DELIVERY_CONCURRENCY = 5` in a 30 s
function that is 90–250 messages, against a cap of 400 presented in the source as a safety
margin. Worse, the claim flips **all** claimed rows to `processing` *before* any send, so a
30 s kill leaves 150–300 rows claimed-but-unsent — which REL-002 then strands permanently.

### Required change
1. `pool: true, maxConnections: 5, maxMessages: 100` on a **cron-only** transporter.
   Do *not* pool the transporter used by `api/registrations.js` / `api/contact.js` — those send
   one message per invocation and would leak a held socket into a frozen instance.
2. Widen the claim predicate: `event_date <= ${targetDate}` (or drop it and rely on
   `status` + `next_attempt_at`), so stranded rows become recoverable.
3. Lower `MAX_NEWSLETTER_EMAILS_PER_RUN` to what the function can finish (~100 unpooled,
   ~300 pooled) and make the run self-continuing — `remaining` is already computed and returned.
4. Track a per-run deadline and stop claiming at ~25 s so the process exits cleanly rather
   than being killed mid-batch.

### Acceptance criteria
- [ ] A delivery that fails on day N is retried on day N+1.
- [ ] A row left `processing` by a crashed run is reclaimed after the lease expires.
- [ ] No row is claimed that the run cannot attempt before its deadline.
- [ ] A subscriber never receives the same item twice (the `(item_type, item_id, subscriber_id)`
      unique index and `deliveryMessageId` both still hold).
- [ ] `newsletter_sent_at` is stamped only once every delivery for that item is terminal.
- [ ] A backfill identifies and re-dates already-stranded rows.

### Verification
Extend `tests/newsletter-broadcast.test.mjs`: (a) a delivery failing on one `targetDate` is
claimed on the next; (b) a `processing` row older than the lease is reclaimed; (c) the deadline
stops claiming. On staging, seed a 400-row outbox with a null SMTP sink, then with real Gmail,
and compare `sent` against `processed`.

### Dependencies
**REL-001 must land first** — otherwise the run still dies on the first failure and neither fix
is observable. Widening the predicate without pooling strands rows more slowly; pooling
without widening leaves existing stranded rows unrecoverable. Do both.

### Related findings
PERF-002 (same shape, reminders), DB-003, DB-004, OBS-002.

---

## [x] MAINT-001 — Give the Excel import an identity beyond the title

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed (repro) · **Effort:** Medium · **Area:** Data correctness

### Files
- `shared/yearly-calendar-utils.js:376-449` (`buildImportPreview`), `:384-387` (`entriesByTitle`)
- `api/yearly-calendar.js:229-300` (commit)
- new `tests/yearly-calendar-import.test.mjs`

### Problem
Existing entries are matched by **normalised title alone**. `entryType`, `date` and
`year`/`month` never enter the key. Every sheet row with a repeated title binds to the *same*
database row.

### Evidence
DB holds one `closed` entry id 101 "Planleggingsdag" on 2026-08-14. The sheet contains the
year's three planning days, all titled "Planleggingsdag":
```
row 2: unchanged  existingId=101  date=2026-08-14
row 3: changed    existingId=101  date=2027-01-02
row 4: changed    existingId=101  date=2027-05-15
```
Rows 3 and 4 are both offered as an update of id 101, each with a believable diff
(`dato 2026-08-14 → 2027-01-02`). The server re-derives the match and agrees — on the same
wrong row. Entry 101 is written twice (last wins), the August planning day is destroyed, and
the January and May days are never created. Three entries become one, with no warning.

### Required change
Key the match on `title + entryType + (date || weekNumber)`, or keep the title bucket and
select the match whose `date`/`weekNumber` agrees, marking the rest `ambiguous`. Additionally,
if more than one preview row resolves to the same `existing.id`, mark them all `ambiguous`.

### Acceptance criteria
- [ ] The three-planning-days fixture yields `new: 2, unchanged: 1` (or `ambiguous: 2`), never
      two updates of one id.
- [ ] No two preview rows can resolve to the same `existing.id`.
- [ ] A genuine single-title edit still classifies as `changed` and updates the right row.
- [ ] Re-importing an unmodified sheet reports everything `unchanged`.

### Verification
New suite with the fixture above plus: same title different `entryType`; same title same date
(a true update); a week-based entry matched by `weekNumber`.

### Dependencies
None. Fix **MAINT-004** in the same change — same root cause.

### Related findings
MAINT-002, MAINT-004, MAINT-005, TEST-003.

---

## [x] MAINT-002 — Stop the Excel import wiping `weekday_start` / `weekday_end`

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed · **Effort:** Trivial · **Area:** Data correctness

### Files
- `api/yearly-calendar.js:288-289`
- `shared/yearly-calendar-utils.js:30-42` (`COMPARE_FIELDS`), `:169-188` (`canonicalPayload`)

### Problem
The import UPDATE unconditionally sets `weekday_start = ${null}, weekday_end = ${null}`.
Those columns are not in `COMPARE_FIELDS`, so `diffYearlyCalendarEntry` can never report the
change, and not in `canonicalPayload`, so the import has no value for them. **The preview
asserts nothing else will move, and then something else moves.**

### Evidence
A `week_event` "Karneval" set in the UI to Mon–Wed of week 8. The sheet changes only its
colour. The preview shows one change (`farge`). After the update, `weekday_start`/`weekday_end`
are NULL and the entry silently widens to the whole week.

Contrast: `start_time`/`end_time` are deliberately *omitted* from the same UPDATE, exactly as
`docs/subsystems.md:25-27` promises. The weekday range got the opposite treatment with no
comment explaining why.

### Required change
Drop the two `= ${null}` assignments so the weekday range is preserved, exactly like the times.
(Alternative: add both fields to `COMPARE_FIELDS` + `canonicalPayload` so the wipe is at least
visible in the diff — but preservation matches the documented intent.)

### Acceptance criteria
- [ ] Importing a colour-only change to a `week_event` leaves `weekday_start`/`weekday_end` intact.
- [ ] The preview diff for that row still shows exactly one change.
- [ ] No regression in `start_time`/`end_time` preservation.

### Verification
Add a smoke-test grep guard asserting the import UPDATE does not mention `weekday_start`
(cheap, and `scripts/smoke-tests.mjs` already grep-guards source regressions). Then a unit test
on the preview diff.

### Dependencies
None.

### Related findings
MAINT-001, MAINT-005. Related to open backlog item **TRACE-004**.

---

## [x] MAINT-003 — Validate event `time`, and make feed omissions observable

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed (repro) · **Effort:** Small · **Area:** Data correctness / Reliability

### Files
- `api/events.js:157`, `:205` (validation), `:56-90` (`respondWithCalendarFeed`)
- `shared/calendar-feed.js:83-89`, `:161-163`
- `docs/subsystems.md` (calendar-feed section)

### Problem
`toIcsLocalDateTime` returns `null` for any `time` that is not `H:MM`, and `signupEventLines`
then returns `null` — the event silently disappears from the public feed. The only write-side
check is truthiness; `events.time` is `text NOT NULL` with no format constraint.

### Evidence
```
 time="17:00"       -> in feed: true
 time="17.00"       -> in feed: false     ← the Norwegian decimal convention
 time="kl 17"       -> in feed: false
 time="9:5"         -> in feed: false
 time="17:00-19:00" -> in feed: true      (silently truncated to 17:00)
```
An admin typing `17.00` sees the event render correctly on the website — the page prints the
raw string — while every parent subscribed to `/kalender.ics` never sees it. Nothing is logged.

### Required change
1. Validate `time` against `/^\d{1,2}:\d{2}$/` on create and update in `api/events.js`, 400 otherwise.
2. `console.warn` in `respondWithCalendarFeed` when an event is skipped, so the drop is observable.
3. Add the invariant to `docs/subsystems.md` next to the UID warning — that file is where the
   non-obvious calendar rules live.

### Acceptance criteria
- [ ] `POST`/`PUT /api/events` with `time: "17.00"` returns 400 with a translated message.
- [ ] Existing valid events are unaffected.
- [ ] A skipped event emits a warning naming its id.
- [ ] Rows already holding a malformed value are normalised or explicitly accepted (decide and
      document which — a migration, or widening `toIcsLocalDateTime` to accept `H.MM`).

### Verification
Extend `tests/calendar-feed.test.mjs` with the table above. Check production data for existing
malformed values **before** shipping the 400, or admins will be unable to re-save old events.

### Dependencies
None.

### Related findings
OBS-002.

---

## [x] TRACE-001 — Recover gracefully when the 2-hour session expires

**Priority:** P1 · **Severity:** High · **Confidence:** High · **Effort:** Medium · **Area:** Frontend / UX

### Files
- `client/src/lib/queryClient.ts:130-151`, `client/src/hooks/useAuth.ts:14-18`
- `client/src/pages/messages.tsx:59-61`, `content.tsx:78-86`, and every council page defaulting to `= []`

### Problem
Both cookies expire after exactly 2 hours. After that, `requireRole` returns 401 on every
council endpoint — but `GET /api/auth` returns `200 null`, not 401, and the auth query never
refetches (`refetchOnWindowFocus: false`, `refetchInterval: false`, and the `Layout`-level
query never remounts). So the header still shows the user as logged in, `RequireAuth` still
admits them, and every list query 401s into `data = []` — rendering the **empty state**.

### Evidence
`/messages` says there are no inquiries. `/content` says *"Ingen innlegg ennå. Klikk 'Nytt
innlegg' for å komme i gang."* The inbox and the entire blog look deleted. Any save then fails
with a generic red toast. There is no re-login prompt and no recovery but a manual reload.

### Required change
1. In `getQueryFn` / `apiRequest`, on a 401 clear the auth key
   (`queryClient.setQueryData(['/api/auth'], null)`) and let `RequireAuth` redirect.
2. Give the auth query `refetchOnWindowFocus: true`, or an interval shorter than the 2 h token life.
3. Give council pages an `isError` branch distinguishing "session expired" from "no data".

### Acceptance criteria
- [ ] Deleting the `jwt` cookie and navigating to `/messages` without reloading prompts re-login
      rather than showing an empty inbox.
- [ ] The header no longer shows a logged-in user once a 401 has been observed.
- [ ] An empty list and a failed list are visually distinct on every council page.
- [ ] A genuinely empty inbox still shows the empty state.

### Verification
Log in, delete the cookie in devtools, navigate. Repeat for `/content` and `/settings`.

### Dependencies
None. Fixing this also removes the trigger for **MAINT-009**.

### Related findings
MAINT-009, TRACE-007, TR-24/TR-46/TR-52.

---

## [x] OBS-001 + OBS-002 — Make production failures visible

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed · **Effort:** Medium · **Area:** Observability

### Files
- `api/_shared/sentry.js:334-366`, `api/_shared/middleware.js:104-121`, `api/cron/event-reminders.js`

### Problem
**OBS-001:** `Sentry.captureException` calls `void sendSentryEvent(error)` — not awaited. On
Vercel the instance is frozen as soon as the response completes, so the in-flight `fetch` to
Sentry frequently never finishes. The team sees a quiet Sentry and concludes nothing is wrong.
**OBS-002:** `console.error('API Error:', safeErrorForLog(error))` emits `{name, message,
stack, code}` and nothing else — no request id, route, method, actor or resource id. This
matters more than usual because four handlers multiplex many resources behind one function: a
500 from `secure-settings.js` does not say whether it was `resource=users` or
`resource=blog-posts`. No successful mutation is logged at all, so there is no audit trail.

### Required change
1. `await Sentry.captureException(error)` before `res.status(...)`, with a ~1 s
   `AbortSignal.timeout` so slow ingest never holds the response — or use `waitUntil`.
2. A `logEvent(level, event, fields)` helper writing one JSON line
   (`{level, event, requestId, method, path, action, resource, userId, role, durationMs}`),
   called by `withApiHandler` for every non-2xx. Use `req.headers['x-vercel-id']` as the
   request id and echo it in the response so users can quote it.
3. Log a cron run summary — `broadcastNewsletter` already returns
   `{queued, processed, sent, failed, remaining}` and Vercel Cron discards it.

### Acceptance criteria
- [ ] A deliberate 500 in production appears in Sentry within a minute.
- [ ] Every non-2xx log line carries a request id, route and (where authenticated) actor.
- [ ] Each cron run emits exactly one summary line whether it succeeds or fails.
- [ ] No email, phone or token appears in any new log line (`redactSensitiveText` still applied).

### Verification
Trigger a known 500 on a preview deployment and confirm it reaches Sentry. Grep the log drain
for the cron summary. Re-run `tests/api-security.test.mjs`.

### Dependencies
None, but do this **before** verifying the Phase 1 and 2 fixes in production — otherwise you
cannot confirm they worked.

### Related findings
OBS-003, OBS-004, OBS-005, REL-001.

---

## [ ] TEST-002 — Make the 07:00 cron half testable, then test it

**Priority:** P1 · **Severity:** High · **Confidence:** Confirmed · **Effort:** Medium · **Area:** Testing

### Files
- `api/cron/event-reminders.js:347-443`, new `tests/event-reminders.test.mjs`

### Problem
The file exports `broadcastNewsletter(sql, targetDate, send = sendEmail)` — injectable, and
well covered by five tests. The entire 07:00 path (claim-with-`SKIP LOCKED`, the reminder send
loop, `cleanupPrivacyRetention`, `cleanupExpiredRateLimits`) lives inside the default handler,
uses the imported `sendEmail` directly, and is **unreachable from a test**. That is why
REL-001's second instance shipped, and it means irreversible GDPR deletion is untested.

### Required change
Extract `sendEventReminders(sql, targetDate, send = sendEmail)` and
`cleanupPrivacyRetention(sql)` the same way `broadcastNewsletter` was extracted, and mirror the
newsletter suite.

### Acceptance criteria
- [ ] Happy path: N due reminders claimed, sent, and stamped `reminder_sent_at`.
- [ ] Provider throws: the row is released (`reminder_claimed_at = NULL`), the run continues,
      and retention cleanup still executes.
- [ ] Idempotency: an already-stamped registration is never re-claimed.
- [ ] Lease expiry: a row claimed more than 10 minutes ago is reclaimable.
- [ ] Retention: only registrations for events older than 6 months are deleted.
- [ ] The default handler's behaviour is unchanged.

### Verification
`node --test tests/event-reminders.test.mjs`, then `npm run verify`.

### Dependencies
Easier after TEST-001. Coordinate with PERF-002, which changes the same claim query.

### Related findings
PERF-002, TEST-003, REL-001, DB-002.

---

## [ ] A11Y-002 — Add a localized skip link and make `<main>` a focus target

**Priority:** P1 · **Severity:** Serious · **Confidence:** Confirmed · **Effort:** Small · **Area:** Accessibility
**WCAG:** 2.4.1 Bypass Blocks (Level A)

### Files
- `client/src/components/layout.tsx:441`, `client/src/lib/i18n.ts`

### Problem
`<main>` has no `id`, no `tabIndex={-1}`, and nothing targets it. The header before it holds
roughly 9-10 tab stops, paid on every page load — and, because `wouter` never resets focus on
navigation, on every in-app navigation too.

### Required change
Add `id="main-content" tabIndex={-1}` to `<main>`, and as the first child of the outer `<div>`:
```jsx
<a href="#main-content"
   className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-primary">
  {t.common.skipToContent}
</a>
```
Add `skipToContent` to **both** `no` and `en` in `i18n.ts`. Pair it with a route-change focus
reset (`useEffect` on `location` → `mainRef.current?.focus()`).

### Acceptance criteria
- [ ] Tab once on any page reveals a legible link; Enter moves focus to `<main>`.
- [ ] The next Tab lands on the first in-page control, not back in the header.
- [ ] Focus moves to `<main>` on client-side navigation.
- [ ] Both languages present.

### Verification
Keyboard pass in both languages, light and dark. `npm run check` (the i18n ratchet enforces
both translations).

### Dependencies
None.

### Related findings
A11Y-016. Matches open backlog item **A11Y-002**.

---

## [ ] A11Y-003 — Give `TimeInput24h` a real `id` so its labels work

**Priority:** P1 · **Severity:** Serious · **Confidence:** Confirmed · **Effort:** Small · **Area:** Accessibility
**WCAG:** 1.3.1, 4.1.2, 3.3.2 (all Level A)

### Files
- `client/src/components/time-input-24h.tsx:12,47-59`
- `client/src/components/yearly-calendar-entry-modal.tsx:287-292`
- `client/src/components/event-creation-modal.tsx:368-380`

### Problem
`TimeInput24h` accepts a closed prop list and renders `name`, never `id`. Both call sites
assume otherwise: the entry modal's `htmlFor="entry-start-time"` points at an id that does not
exist, and inside `<FormControl>` the injected `id`, `aria-describedby` and `aria-invalid` are
all silently discarded — so a zod failure on `time` is invisible to assistive technology.

### Required change
Make the component transparent:
```tsx
export function TimeInput24h({ value, onChange, onBlur, ...rest }: TimeInput24hProps & React.ComponentProps<typeof Input>) {
  …
  return <Input type="text" inputMode="numeric" pattern="…" placeholder="HH:MM"
           value={displayValue} onChange={handleChange} onBlur={handleBlur} {...rest} />;
}
```
Spread `...rest` **after** the explicit handlers. Pass `id="entry-start-time"` /
`id="entry-end-time"` at the entry-modal call sites (keep `name` if the form relies on it).

### Acceptance criteria
- [ ] `document.querySelector('label[for="entry-start-time"]')` and
      `document.getElementById('entry-start-time')` both resolve.
- [ ] Inside `<FormControl>`, the input carries `aria-invalid` and `aria-describedby`.
- [ ] Existing typing/formatting behaviour is unchanged.

### Verification
NVDA or VoiceOver: focusing each field speaks its label. Trigger a `time` validation error in
`event-creation-modal` and confirm it is announced.

### Dependencies
None.

### Related findings
A11Y-006, A11Y-013.

---

## [ ] A11Y-004 — Fix the destructive colour token

**Priority:** P1 · **Severity:** Serious · **Confidence:** Confirmed (computed) · **Effort:** Small · **Area:** Accessibility
**WCAG:** 1.4.3 Contrast (Minimum) (Level AA)

### Files
- `client/src/index.css:32-33`

### Problem / Evidence
Computed from the actual tokens:

| Pair | Hex | Ratio | Need |
|---|---|---:|---:|
| `--destructive-foreground` on `--destructive` (error toast, delete button) | `#fafaf9` / `#ef4444` | **3.60:1** | 4.5:1 |
| `--destructive` as text on `--background` (every `FormMessage`) | `#ef4444` / `#ffffff` | **3.76:1** | 4.5:1 |
| `--destructive` as text, dark mode | `#7f1d1d` / `#070a13` | **1.97:1** | 4.5:1 |

This compounds with A11Y-006: seven forms surface validation **only** through a destructive
toast, so the single failure channel is the hardest to read. Note `index.css:19-25` documents
this exercise having been done for `--primary`/`--secondary`/`--accent`; `--destructive` was
left at the stock shadcn value and missed.

### Required change
Darken `--destructive` in light mode to at least `#b91c1c` (6.06:1 on white, and white on it is
6.06:1) — this alone fixes light mode for both the fill and the text use. For dark-mode *text*,
add a `--destructive-text` token (`#fca5a5` ≈ 9.9:1 on `#070a13`) and use it in `FormMessage`.

**Safety boundary:** changing the token is safe. Using `--destructive-text` requires one edit
inside `client/src/components/ui/form.tsx`, which `AGENTS.md` marks regenerate-don't-hand-edit.
If you want to stay strictly inside that boundary, ship the token change alone and file the
dark-mode text case separately.

### Acceptance criteria
- [ ] All three pairs above meet 4.5:1, recomputed.
- [ ] Destructive buttons and toasts remain visually distinct from primary.
- [ ] Verified in light and dark.

### Verification
Recompute the ratios from the new tokens. Submit `pages/contact.tsx` empty in both modes;
trigger a destructive toast from `login-modal.tsx`.

### Dependencies
None.

### Related findings
A11Y-005, A11Y-006, A11Y-018, A11Y-019, A11Y-020.

---

## P2 tasks

Each is independently actionable; full evidence is in `REPO_REVIEW.md` §5.

| ID | Title | Files | Acceptance in one line |
|---|---|---|---|
| **SEC-002** ✅ | Stop trusting the left-most `X-Forwarded-For` | `api/_shared/rate-limit.js:3-8` | `getClientIp` uses `ipAddress()` from `@vercel/functions` (already a dependency) or the right-most hop; two requests differing only in a spoofed left-most entry produce the **same** key. Confirm against a preview deployment first — if Vercel *replaces* the header, this drops to Low. |
| **SEC-004** ✅ | Make cron authorization fail closed | `api/cron/event-reminders.js:22-27` | `if (!process.env.CRON_SECRET) return false;`. Local runs set it in `.env` (already documented in `.env.example`). Export `isAuthorizedCron` and test the unset case. |
| **SEC-005** | Make `sanitizeText`'s contract honest | `api/_shared/middleware.js:334-359`, `tests/sanitizer-runtime.test.mjs:96-105` | Strip ASCII control characters and whitespace-in-keyword variants; state in JSDoc that output is **never** safe in an attribute; add a real `sanitizeUrl()` allowlisting `https:`/`mailto:` via `new URL`. Replace the tautological test (it re-uses the sanitizer's own regex, so it asserts the regex agrees with itself) with browser-level semantics. |
| **SEC-006** | Check the Cloudinary **tenant**, not just the host | `api/_shared/middleware.js:367-374`, `client/src/components/safe-html.tsx:17-26` | Reuse `parseCloudinaryDeliveryUrl` and require `cloudName === CLOUDINARY_CLOUD_NAME`; export one shared predicate the way `youtubeEmbedSrc` already is. **Audit `blog_posts.content` for foreign cloud names before shipping** or legacy images vanish. |
| **SEC-007** | Revalidate the download URL at read time | `api/documents.js:13-38` | `handleDownload` re-checks host + cloud name before redirecting; 404 otherwise. Audit existing rows first so legitimate legacy documents are migrated, not silently 404'd. |
| **REL-003** ✅ | Never 500 on a malformed cookie | `api/_shared/middleware.js:132-141` | `parseCookies` catches `URIError` per cookie and skips the bad one. A request with `Cookie: csrf-token=%E0%A4%A` returns 401/403, not 500, and logout still works. |
| **DB-002** ✅ | Stop `current_attendees` drifting | `api/registrations.js`, `api/cron/event-reminders.js:333-339` | Preferred: make it derived (`COALESCE(SUM(attendee_count),0)` in `mapEvent`'s query) and drop the counter. Otherwise add a nightly reconcile — note that only stops drift being *permanent*, it does not fix DB-001. |
| **DB-003** ✅ | Bound `newsletter_deliveries` growth | `migrations/`, `api/cron/event-reminders.js` | Retention for terminal rows; stop copying the item body per subscriber (join at send time). |
| **DB-004** ✅ | Stop the zombie news post | `api/cron/event-reminders.js:285-295` | A truncated broadcast no longer leaves a post that is re-queued nightly forever. Depends on REL-002. |
| **PERF-002** ✅ | Raise/continue the reminder cap | `api/cron/event-reminders.js:17,367-403` | An event with 60 registrations gets 60 reminders. Throughput is not the constraint (25 messages ≈ 3-5 s); the cap is arbitrary. Loop until the claim returns empty or a deadline hits. |
| **PERF-003** ✅ | Cache `/kalender.ics` | `vercel.json`, `api/events.js` | A short `s-maxage` on the feed path only. Confirm what `Cache-Control` it actually returns today (`curl -sI`) — `headers` match pre-rewrite. |
| **PERF-004** ✅ | Don't fetch 500 posts to render one | `client/src/pages/news-post.tsx:30-34` | Add a single-post read (an `&id=` filter on the existing resource — no new serverless function needed, preserving the Hobby budget). |
| **TRACE-002** ✅ | Give `secure-settings.js` row mappers | `api/secure-settings.js`, `client/src/pages/content.tsx:175` | `mapBlogPost(row)` used for GET/POST/PUT, mirroring `mapEvent`/`mapEntry`. Post-save the card keeps its date and badge, and a subsequent toggle cannot reset `published_date` to today. |
| **TRACE-003** ✅ | Fix the registration-delete rollback | `client/src/components/event-registrations-view.tsx:38-90` | Snapshot `["/api/events"]` too and restore both in `onError`, or move invalidations to `onSettled`. Deleting the same registration twice leaves the header count correct. |
| **TRACE-004** ✅ | Surface user-delete failures | `client/src/components/staff-users-section.tsx:74-85` | Add `onError` + success toast, matching the sibling `createMutation` in the same file. (The `res.status !== 204 && !res.ok` guard is dead — `apiRequest` throws on any non-2xx.) |
| **TRACE-005** ✅ | Make board-member save recoverable | `client/src/pages/settings.tsx:149-175` | Report which member failed and invalidate in a `finally` so the UI resyncs to what actually persisted. |
| **TRACE-006** ✅ | Standardize id validation and delete semantics | `api/documents.js:14`, `api/secure-settings.js:79,113,207,248,367,467` | A shared `requireIntId(req, res)`; every DELETE/PUT checks affected rows and returns 404 when none. `?id=abc` returns 400, not 500. Matches open backlog item **TRACE-006**. |
| **MAINT-004** ✅ | Detect intra-sheet duplicate titles | `shared/yearly-calendar-utils.js:390-449` | Two sheet rows with the same title do not both silently create. Fix with MAINT-001. |
| **MAINT-005** | Stop clearing homepage flags on non-`day_event` | `shared/yearly-calendar-utils.js:172,185-186` | Decide first: either enforce "day_event only" on write (making the diff dead code) or carry the value through for all dated types. Today the write path allows what the import then clears. |
| **MAINT-006** ✅ | Harden `validateImportDecision` | `shared/yearly-calendar-utils.js:459-461` | `Object.hasOwn` or a `Map`. `{"status":"toString","action":"ignore"}` returns a validation error instead of a 500 that aborts the whole batch. |
| **MAINT-007** ✅ | Fix photo-slot grid alignment and midnight wrap | `shared/photo-slots.js:51-126` | Misaligned/negative offsets are rounded onto the grid rather than dropped from the occupancy set; `formatMinutesOffset` returns `null` past 24 h instead of wrapping. |
| **MAINT-008** ✅ | Make `runWithConcurrency` fail cleanly | `api/_shared/delivery.js:16-33` | Collect errors per item and throw an aggregate after all workers settle, so no worker is still writing when the batch has already rejected. |
| **MAINT-009** | Narrow the polymorphic registrations response | `api/registrations.js:66-90`, `client/src/components/attendee-tooltip.tsx:27-50` | `Array.isArray(data) ? data : []` at the boundary, and/or split the aggregate onto its own param so one URL has one shape. |
| **OBS-003** | Stop over-redacting logs | `api/_shared/redact.js:7-9` | `"at 2026-03-29 18:30:00"` survives; `"+47 12 34 56 78"` is still redacted. Table-drive both directions. |
| **OBS-004** | Give Sentry real stack frames | `api/_shared/sentry.js:319-327` | Parse into `{function, filename, lineno, colno}`; set `release`, `transaction` and `tags`. Distinct errors stop merging into one issue. |
| **DOC-001** | Correct the review backlog | `docs/review-backlog.md`, `AGENTS.md` | Tick the 11 implemented items (DB-001/002/003/004, REL-001, PERF-001, PERF-002, SEC-001/002/003/004 **as numbered in that file**) and correct the "28 open" count in `AGENTS.md`. **Five-minute task — consider doing it first**, since every contributor and agent is currently working from a list that is wrong about 11 items. |
| **DOC-002** | Fix README | `README.md:30-46,57` | Point the env section at `.env.example` / `docs/DEPLOYMENT.md` instead of duplicating a subset missing `CRON_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and both Sentry DSNs; change "session-based authentication" to "JWT in an HttpOnly cookie with double-submit CSRF". |
| **A11Y-005…013** | Nine confirmed accessibility defects | see `REPO_REVIEW.md` §5 | Calendar chip contrast; seven forms with toast-only validation; unnamed mobile nav sheet; rich-text images that can never have alt text; missing `autocomplete`; div-based month grid; no `prefers-reduced-motion`; cancelled events by colour alone; nine unassociated labels. |

## P3 tasks

`SEC-008` (temporary-password expiry · rate-limit `change-password` · SHA-pin CI actions) ·
`DB-005` index drift · `DB-006` `contact_messages.created_at` written as a PG timestamp ·
`DB-007` retention-cleanup ordering · `DB-008` polymorphic `item_id` orphans · `PERF-005`
duplicate `users` lookup on `?action=me` · `MAINT-010` `nextAttemptAt` `RangeError` ·
`MAINT-011` `truncatePlainText` splits surrogate pairs · `MAINT-012` untranslated toasts on
three surfaces · `MAINT-013` substring-matched registration errors · `MAINT-014`
`Document`/`EventRegistration` types promising fields the API never returns · `MAINT-015`
the `secure-settings.js` refactor (subsumes TRACE-002 + TRACE-006) · `ARCH-001` decide the fate
of `site_settings` · `TRACE-007` logout error path · `TRACE-008` invalidate registrations after
public signup · `DOC-003` `docs/architecture.md` still recommends the outbox that shipped ·
`TEST-003` tests for `yearly-calendar-utils.js` and `photo-slots.js` (both currently have **no
test file at all**) · `TEST-004` the capacity regression test · `A11Y-014…022`.

---

## Notes on sequencing

- **DOC-001 is five minutes and unblocks judgement on everything else.** Do it first.
- **REL-001 and TEST-001 are one change.** The import fix without the compiler flag leaves the
  hole open.
- **REL-002 and PERF-001 are one change.** Either alone makes things worse in a different way.
- **DB-001 and DB-002 overlap.** If you take DB-002's derived-counter option, it subsumes
  DB-001's counter handling — decide before starting either.
- **TRACE-002, TRACE-006 and MAINT-015 are the same refactor** seen from three angles. Doing
  MAINT-015 first makes the other two fall out.
