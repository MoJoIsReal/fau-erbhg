# 04 — Verification log

Environment: cloud container, Node 22.22.2, npm 10, PostgreSQL 16 (local scratch cluster on :55432, `-A trust`, removed after the run), Chromium 1194 via global Playwright 1.56.1, axe-core 4 (scratch install). No production credentials, no network access to Neon/Vercel/Gmail/Cloudinary were used.

| # | Command | Result |
|---|---|---|
| 1 | `npm ci` | exit 0 |
| 2 | `npm run check` (tsc + backend type gate + i18n ratchet) | exit 0 — "backend types: 0 undefined identifiers, 52 other diagnostics, at budget"; "i18n: 31 inline ternaries, at budget" |
| 3 | `npm test` (39 offline suites, `--experimental-test-module-mocks`) | exit 0 — 370 tests, 370 pass, 0 fail (3.7 s) |
| 4 | `npm run build` | exit 0 — warning: chunks > 500 kB (`yearly-calendar-pdf` 1 186 kB, lazy; `vendor-react` 511 kB, eager) |
| 5 | `npm audit --json` | 0 vulnerabilities (info/low/moderate/high/critical all 0) |
| 6 | `TEST_DATABASE_URL=…127.0.0.1:55432/fau_integration_test npm run test:integration` | 5/5 pass (10.3 s) |
| 7 | Scratch `outbox-check.mjs` — runs the cron's own abandon `UPDATE` (extracted from source with the fixture's `productionStatement`, `exhausted = true`) | **A** CI fixture schema: succeeds, row → `failed`. **B** production-like schema (table created by 0008, then 0009–0016): `ERROR 23514 … violates check constraint "newsletter_deliveries_status_check"`; row left `processing`, `attempts = 5`. Constraint text: `CHECK (status = ANY (ARRAY['pending','processing','sent','skipped']))` → **TR-1 CONFIRMED, TEST-1 CONFIRMED** |
| 8 | Scratch `claim-check.mjs` — production claim CTE with `targetDate = 2026-09-25` over a `cancelled` event dated 2026-09-20 with a pending delivery | the row is claimed (`attempts` 1→2) and returned to the worker, which checks only subscriber status → **TR-2 CONFIRMED** |
| 9 | Scratch `probes.test.mjs` via the repo handler harness | IN-1: anonymous `POST /api/registrations` with `attendeeCount: 100` → 201 and `100` reaches the capacity CTE. IN-3: login with object `password` → 500; `sanitizeNumber('1.5',1,100) === 1.5` → **IN-1, IN-3 CONFIRMED (unit)** |
| 10 | Scratch probe build with exact-path `manualChunks` (config outside repo, output to scratchpad) | first-load JS 855 kB → 553 kB (262 → 172 kB gzip); `vendor-react` 511 → 206 kB → **PF-1 measured** |
| 11 | `vite preview` + Playwright + axe-core (8 public routes × {375 px light, 1280 px dark}, API mocked) | 1 violation: `color-contrast` ×2 on `/kalender` light (3.85:1) → **A11Y-1** |
| 12 | `node -e new Date('2026-09-24 11:56:00.123456+00')` | V8 parses PG text timestamps; other engines not available (TR-4 browser impact UNVERIFIED) |
| 13 | `git log --all -p` scan for committed env values/keys | only placeholders (`.env.example` history) |

Scanner output triage: `npm audit` clean; the Vite chunk warning was investigated (PF-1) and the 1.2 MB PDF chunk is loaded only via `await import()` on click (`calendar-month-tools.tsx:38`), so it is not a finding.

## Verifier step (skill Phase 4)
The skill requires an independent verifier for every **P0** finding and every **P1 SEC** finding. After consolidation there are no P0 findings and no P1 findings in the SEC area (the only P1 is DB-001, already reproduced on a real PostgreSQL instance above, which is stronger evidence than a re-read). No verifier agent was spawned.

## Clean-up
Scratch PostgreSQL cluster stopped and its data directory removed; preview server stopped; scratch builds deleted; nothing written to the repo outside `.review/` and the three report files.
