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
