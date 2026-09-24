# Findings — performance (app/runtime, frontend, DB)

### PF-1 Editor library ships in the eagerly-loaded React chunk (measured)
Area: PERF · Severity: Medium · Confidence: CONFIRMED · Verified: build (measured)
Where: `vite.config.ts:25-37` `manualChunks`: `id.includes("/react/")` also matches `node_modules/@tiptap/react/…` (and `@vercel/analytics/…/react/`), so TipTap/ProseMirror are hoisted into `vendor-react`, which `index.html` modulepreloads on every page.
Evidence (measured, `npm run build`, first-load JS = entry + modulepreloads):
| build | vendor-react | first-load JS | gzip |
|---|---|---|---|
| current | 511 kB | 855 kB | 262 kB |
| probe: `/node_modules\/(react|react-dom|scheduler)\//` | 206 kB | 553 kB | 172 kB |
The probe build moved the code to the lazy `RichTextEditor` chunk (112 → 413 kB), which only council editors load. `vendor-react` contains 39 `ProseMirror` and 29 `tiptap` references in the current build.
Cause → Impact: substring match too broad → every public visitor (mostly phones) downloads and parses ~300 kB min / ~90 kB gzip of council-only editor code before first render (−35 % available).
Fix: match exact package directories. · Measure: compare `dist/public/index.html` preload sizes before/after (method above). · Regression risk: none functionally; chunk hashes change once.

### PF-2 Homepage downloads the whole blog archive to show three posts
Area: PERF · Severity: Low · Confidence: HIGH · Verified: static (needs metrics)
Where: `client/src/pages/home.tsx:98-102` (`["/api/secure-settings?resource=blog-posts"]`, filtered client-side) → `api/secure-settings.js:236,263-273` (default `LIMIT 500`, full `content` HTML up to 50 000 chars each).
Access pattern → cost driver: one unpaginated public read of every published post body per homepage visit (5-minute client stale time, `no-store` at the edge). Hurts at a few hundred posts with embedded content (worst case ~25 MB).
Fix: add `homepage=true&limit=3` (or a `show_on_homepage` filter) server-side; the news page already paginates. · Measure: response bytes of that request.
Scope: `GET /api/events` returns every active/cancelled event ever with a correlated `SUM` per row (`api/events.js:200-212`) — fine today, unbounded over years.

### PF-3 Year-calendar import commits up to 500 rows one round trip at a time, without a transaction
Area: PERF/DB · Severity: Low · Confidence: HIGH · Verified: static (needs metrics)
Where: `api/yearly-calendar.js:247-352` — `for … of decisions` with `await sql` per row (plus `buildImportPreview` per row); `vercel.json` `maxDuration: 30`.
Cost driver: up to 500 sequential Neon HTTP statements (≈10–25 s at 20–50 ms each) inside a 30 s function; each row commits independently.
Impact: a slow day can time out mid-import, leaving a partial import the staff member cannot see (response never arrives).
Fix: batch inserts/updates with `jsonb_to_recordset` in one statement (which is also atomic), or chunk client-side. · Measure: log `durationMs` (already emitted by `withApiHandler`) for `commit-import`.

## Not issues (checked)
- Registration signup ≈6 sequential round trips (limits, blacklist, event, optional slot snapshot, CTE) — acceptable for a form post.
- Calendar feed: bounded to one year and cached at the edge (`events.js:82-83`).
- Cron: bounded batches, 23 s budget, pooled SMTP; retention/cleanup DELETEs use indexed or small tables.
- DB indexes present for every hot filter (`event_registrations(event_id)`, cancel token, delivery claim `(status,next_attempt_at)`, `blog_posts(category,status)`, newsletter pending partial index).

## Blocked/unverified
- No production data sizes, Neon latency or query plans → PF-2/PF-3 scale thresholds are estimates.
