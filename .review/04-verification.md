# 04 — Verification log

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run check` (tsc + check-backend-types + i18n ratchet) | exit 0; backend types "0 undefined identifiers, 50 other diagnostics, at budget"; i18n "31 inline ternaries, at budget" |
| `npm test` (node --test --experimental-test-module-mocks tests/*.test.mjs) | exit 0; 515 tests, 515 pass, 0 fail, 0 skipped |
| `npm run build` | exit 0; warning: chunk > 500 kB — `yearly-calendar-pdf` 1,193 kB (440 kB gz), `RichTextEditor` 427 kB, `schema` 298 kB, `schemas` 177 kB, `calendar-views` 173 kB |
| `npm audit --omit=dev` | 1 high: source-map-js 1.2.1 (GHSA-68fv-2mgg-jv7q, event-loop DoS via crafted source map) via postcss ← sanitize-html / @tailwindcss. Lead only: the runtime path is sanitize-html → postcss used for style attribute parsing; no source maps parsed from user input → not exploitable as wired (to confirm by sec-platform). |
| `npm run test:integration` | NOT RUN — needs isolated PostgreSQL (TEST_DATABASE_URL); CI job runs it. |
| Live API / DB | BLOCKED — no Vercel runtime or production DB access; handlers verified only through the scripted-DB harness. |

## Independent verifier (Phase 4) — P1 SEC candidates
Fresh agent given only the finding text and cited paths; demo scripts in the session scratchpad (`race.test.mjs`, `san.mjs`), not committed.

- **PIN / account lockout race (AUTHZ-1 = INPUT-1): REPRODUCED → CONFIRMED.** Real `api/media.js` handler via `importHandler` against an atomic in-memory rate-limit table, bcrypt cost 10: 40 sequential wrong PINs from one IP → 5 `PIN_INVALID` then 35 `PIN_LOCKED` (limit works sequentially); 150 concurrent from one IP → 120 evaluated, 30 hit `VIEW_LIMIT` (per-IP 5 and per-share 30 both bypassed); 10 IPs × 120 concurrent → all 1,200 evaluated, 0 locked. Login account-wide lock (`auth.js:157` peek, `:178-183` record): 20 IPs × 5 sequential → 20 evaluated then 80 locked; same 100 concurrent → all 100 evaluated, 0 locked (per-IP 5 still atomic, so login needs many IPs).
- **PIN lifetime budget (PLAT-1): PARTIALLY → CONFIRMED with corrections.** 30 failures per fixed 24 h window (`media.js:99-100`), counter resets after window (`rate-limit.js:52-58`), success clears only the IP key (`media.js:214`); PIN 4–8 digits (`shared/media.js:89`); lifetime default 90, ≤180 at creation, ≤365 overall (`shared/media.js:77-80`). 2,700 guesses / 90 days ≈ 27% of a uniform 4-digit space; 10,950 over 365 days ≥ whole space. Corrections: no IP rotation needed (one IP reaches 30/day in ~75 min at 5/15 min); PIN is admin-chosen (`media.js:288-292`) so "uniform" is best case; legitimate-viewer lockout confirmed (share peek precedes PIN check; covered by `tests/media-handler.test.mjs:184-191`).
- **Phishing echo (INPUT-2): REPRODUCED → CONFIRMED.** `sanitizeText` (`middleware.js:489-506`) strips `<`/`>`, script schemes and inline handlers only; URLs and newlines survive (`"Ola\n\nVIKTIG: https://evil.example/x"` unchanged). Name ≤100 chars echoed at `registrations.js:682/694/723/728/742/747`, `contact-emails.js:64/86`; recipient unverified at send (`registrations.js:599-606`, `contact.js:151-160`). Correction: `registrations.js:657-660` openly says the mail includes the name; only `contact-emails.js:48-51` is wrong. Child names on photo events also echoed (`registrations.js:76, 688-700`).

## Lead spot-check
- **TRACE-2: CONFIRMED (static).** `api/registrations.js:232-277` returns `200 {count}` when `parseAuthToken` yields no council user; `client/src/components/event-registrations-view.tsx:35,137` and `attendee-tooltip.tsx:27,43` type the key as an array and call `.reduce`/`.filter` unguarded; the only React error boundary is app-wide (`client/src/main.tsx:36`).
