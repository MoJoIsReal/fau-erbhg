# Findings — sec-input

Scope: every `api/*.js` handler and `api/_shared` input path; `shared/` (video-embed, html-text, calendar-feed); `safe-html.tsx`; client dynamic href/src; Excel import/export; newsletter and cancel pages; `vercel.json` headers/CSP.
Method: static reading; sanitizer payloads run in a scratch script; one scratch concurrency test through `tests/helpers.mjs` with an atomic in-memory rate-limit table. No live DB/Vercel.
Counts: Critical 0 · High 0 · Medium 2 · Low 6. No SQL injection, stored XSS or SSRF found.

### INPUT-1 PIN lockout checks before bcrypt and counts after it — concurrent guesses bypass it
Area: SEC · Severity: Medium · Confidence: CONFIRMED · Verified: unit (scratch harness)
Where: `api/media.js:195-214` `handleView` (POST `/api/media?action=view`); `api/_shared/rate-limit.js:74-88` `peekRateLimit`
Evidence: both failure counters read with `peekRateLimit` (plain SELECT) → `verifyPin` bcrypt cost 10 → failure recorded with `checkRateLimit` afterwards (`:207-211`). Scratch test: 60 concurrent wrong PINs from one IP all returned `PIN_INVALID` against `PIN_IP_MAX_FAILURES`=5; only the next request got `PIN_LOCKED`. Only atomic bound: `VIEW_LIMIT`=120/IP/10 min.
Cause → Impact: check and increment are separate statements with bcrypt between (CWE-367/CWE-307). Attacker holding the link gets ~120 guesses per IP per burst; per-share 30/day cap applies only after the burst; with many IPs (or IPv6 rotation, INPUT-5) a 4-digit PIN (`^\d{4,8}$`) falls in days, not "about a year" (`media.js:94-96`). Protects private photos/videos of children.
Fix: reserve the attempt atomically before bcrypt (`checkRateLimit` on both keys; keep clear on success) or conditional single-statement increment (`UPDATE … SET count=count+1 WHERE count < limit RETURNING`). · Test: N concurrent wrong PINs with stateful `rateCount` → ≤5 reach `PIN_INVALID`. · Regression risk: correct PIN after 4 typos must still open.
Scope: `api/auth.js:157` peeks the account-wide cap (recorded `:179`); per-(IP,account) is atomic there, so only the 20/h account cap can be exceeded across many IPs (= AUTHZ-1).
Dependencies: INPUT-5. Tests: `tests/media-handler.test.mjs:150-190` (sequential only), `tests/rate-limit.test.mjs:76-84`.

### INPUT-2 Mail to unverified addresses repeats attacker-chosen names
Area: SEC · Severity: Medium · Confidence: CONFIRMED · Verified: static + `sanitizeText` run (URLs pass unchanged)
Where: `api/registrations.js:661-767` `sendEventConfirmationEmail` (name `:687/:696/:719/:742`, child names `:690/:699`, sent `:600`); `api/_shared/contact-emails.js:56-98` `contactAcknowledgementEmail` (name `:64/:86`, sent `contact.js:154`)
Evidence: comments promise no attacker text in outbound mail (`contact-emails.js:48-52` "Only the validated subject value and a server-side timestamp are included"; `registrations.js:654-657`), yet both insert `sanitizeText(name,100)`. `"Hei! Klikk https://evil.example/refund?id=1 for refusjon"` survives `sanitizeText`. Photo signups also echo up to 10 child names × 100 chars.
Cause → Impact: name fields excluded from the "no echo" rule (CWE-74). Anonymous attacker sends `email=victim`, `name=<lure+URL>` → FAU's Gmail delivers it passing SPF/DKIM/DMARC as FAU; spam complaints endanger the account that also sends reminders/newsletters. Bounded by Turnstile (if enabled), per-IP limits, 200/day cap.
Fix: omit the name, or restrict to letters/spaces/`-'.` with no URLs; never echo child names (show on cancel page). · Test: `tests/emails.test.mjs` asserts a `https://` name is not in the body. · Regression risk: less personal greeting.
Dependencies: INPUT-6. Tests: `tests/emails.test.mjs:48-75` (checks message, not name).

### INPUT-3 Media storage quota and per-share file count exceedable by concurrent uploads
Area: SEC · Severity: Low · Confidence: HIGH · Verified: reasoned (PostgreSQL semantics)
Where: `api/media.js:343-360` `handleUploadInit`
Evidence: comment `:351-352` says one statement prevents the race; statement is `INSERT … SELECT … WHERE (SELECT SUM(size_bytes) FROM media_files)+size <= quota`. Under READ COMMITTED with no lock, two concurrent inits both pass (Neon HTTP autocommit). File-count check `:349` is a separate SELECT with the same race.
Cause → Impact: statement atomicity ≠ serialization (CWE-362). Parallel uploads (uploader sends in parallel) can push past the 9 GiB quota → R2 charges (`media-share.js:162-164`). Admin-only trigger.
Fix: `pg_advisory_xact_lock` in the statement or guarded single-row usage counter; lock share row `FOR UPDATE` for count. · Test: integration — two concurrent inits that each fit alone must not both succeed.
Tests: `tests/media-handler.test.mjs:271-289` (scripted DB; cannot show race).

### INPUT-4 Newsletter confirm and unsubscribe run on page load, without a click
Area: SEC · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `client/src/pages/newsletter.tsx:50-58` (`useEffect` POSTs on render); links `api/_shared/newsletter.js:17-23`
Evidence: registration-cancel deliberately requires an explicit click so mail scanners cannot act (`registrations.js:83-85`, `registration-cancel.tsx:42-43,145`); the newsletter page does not.
Cause → Impact: JS-executing mail scanners can silently unsubscribe recipients via the link in every newsletter (reminders stop) or confirm an address someone else entered (defeats double opt-in proof of consent). CWE-841. Depends on scanner behaviour.
Fix: POST only on button click; optionally RFC 8058 `List-Unsubscribe-Post`. · Test: no request before click. · Regression risk: one extra click.
Tests: none.

### INPUT-5 Rate limits key on the full IPv6 address
Area: SEC · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `api/_shared/rate-limit.js:11-37` `getClientIp`, `rateLimitKey`
Evidence: key = hash of exact `x-real-ip`; one IPv6 /64 = 2^64 buckets for every per-IP limit (signup, contact, newsletter, cancel token, media view, PIN, login).
Cause → Impact: no prefix reduction (CWE-770); identity-wide caps hold, but INPUT-1/INPUT-6 get cheaper. Vercel IPv6 reachability unverified.
Fix: key IPv6 by /64 (or /56), normalise IPv4-mapped. · Test: two addresses in one /64 → same key. · Regression risk: households sharing a /64 share a bucket.

### INPUT-6 One anonymous caller can exhaust the daily public-mail cap; dropped mail held the only cancel token
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/_shared/rate-limit.js:102-117` `sendPublicMail`; callers `registrations.js:600`, `contact.js:135,154,300`
Evidence: all public forms share one key capped at 200 mails/24 h; each contact submission costs 2; over-cap mail is only logged and the request still returns success; cancel token and newsletter confirm token travel only by mail (`registrations.js:617`).
Cause → Impact: no per-source/per-kind fairness (CWE-770). ~70 contact posts or 200 signups stop every confirmation for the rest of the day; a parent gets 201 but no cancel link, unrecoverable.
Fix: reserve budget for signup confirmations, drop contact receipts first, show the cancel link once on screen, alert on `mail.public_daily_cap_reached`. · Test: near `tests/contact-handler.test.mjs:137`.

### INPUT-7 `sanitizeHtml` truncates after sanitizing — stored HTML can be cut mid-tag
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: unit (scratch run)
Where: `api/_shared/middleware.js:527-589` (input slice `:530`, output `.substring(0,maxLength)` `:588`)
Evidence: sanitizing grows output (`&`→`&amp;`, links gain `target="_blank" rel="noopener noreferrer"`). A long link came back ending `…" target="_blank" rel` (unterminated `<a`); 20,000 `&` came back as 10,000 chars. Browser/DOMPurify drop the partial tag → no XSS, but the final link/paragraph is silently lost. Limits: 50,000 blog, 5,000 descriptions.
Cause → Impact: length limit applied by cutting sanitized output (CWE-20); a stricter future renderer would receive malformed HTML.
Fix: refuse raw input over the limit (400/413) or re-sanitize the truncated output. · Test: sanitizer-runtime output parses to balanced tags. · Regression risk: editors over the limit need an i18n error.
Scope: `events.js:247`, `secure-settings.js:344,370`, `yearly-calendar.js:79`.

### INPUT-8 CSP allows an unused third-party script origin
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `vercel.json:76`
Evidence: `script-src` lists `https://browser.sentry-cdn.com` but Sentry is bundled (`client/src/main.tsx:11`); host appears only in `vercel.json`. `connect-src` also lists `data:` and wildcard `*.r2.cloudflarestorage.com`.
Cause → Impact: defence in depth only (CWE-693). (Same root cause as PLAT-5.)
Fix: drop Sentry CDN from `script-src`, `data:` from `connect-src`; pin the R2 host if stable. · Test: deploy-config — every `script-src` origin used by client code.

## Blocked/unverified
- Turnstile in production: unknown whether `TURNSTILE_SECRET_KEY` is set; unset → `verifyTurnstile` lets everything through (`turnstile.js:73-74`), leaving INPUT-2/INPUT-6 with per-IP limits only.
- Real concurrency: INPUT-1 shown with an in-memory counter; INPUT-3 reasoned; integration test not run.
- Cloudinary raw files: whether `allowed_formats` is enforced for raw uploads to `/auto/upload`; provider check accepts a raw file with no format (`upload-validation.js:139-140`). Limited impact (signature binds `public_id`; served from Cloudinary's domain).
- IPv6 reachability (INPUT-5); mail-scanner JS execution (INPUT-4).

## Positive findings
- SQL: every query a tagged template; no `sql.unsafe`/interpolated identifiers; LIMIT/OFFSET via `sanitizeInteger`; blog search escapes LIKE wildcards (`secure-settings.js:263-266`); yearly import one `jsonb_to_recordset` statement.
- XSS two layers: server `sanitizeHtml` stripped every payload tried (`javascript:` incl. entity-encoded and leading space, `data:`, svg/script, style, onerror, srcdoc, look-alike Cloudinary host); YouTube iframes rebuilt from video id. `SafeHtml` re-sanitizes with DOMPurify and is the only `dangerouslySetInnerHTML`. Dynamic links are mailto:/tel:/internal; no open redirect.
- Link preview escapes every value; `vis` regex-checked twice. ICS escaping and folding correct.
- Email plain text via nodemailer, validated recipients, no header-injection surface.
- CSRF/CORS: double-submit with `timingSafeEqual`; SameSite=Strict; `requireCsrf` on every authenticated write incl. Bearer; static CORS allowlist + `Vary: Origin`, never `*`; `frame-ancestors 'none'` + nosniff also on `/api`.
- Cloudinary: URL must match our cloud, upload type, `fau-documents/` folder and exact `public_id`; stored format/size are what Cloudinary parsed; DELETE rejects `..`.
- R2: Content-Type/Length signed into URLs, per-part length signed, size/type/magic bytes checked after upload; random object keys; no SVG/HTML.
- Signups: event row `FOR UPDATE`; unique `(event_id, lower(email))` and `(event_id, slot)` with retry; cancel = delete + archive + release in one statement.
- Rate limiter and mail cap atomic upserts; client IP from `x-real-ip` or right-most XFF hop.
- No ReDoS (bounded patterns; e-mail regex linear on 64 KB, ~0.2 ms).
- Spreadsheets: export writes string cells (no formula injection); import re-validated per row server-side.
- Tokens 256-bit; share tokens hashed; view grant HMAC constant-time. No SSRF (server never fetches user URLs).

## Ambiguities
- Turnstile `action`/`hostname` not checked → token from one public form works on another.
- Turnstile fail-open on Cloudflare outage (documented).
- Unverified signups can hold seats/photo slots and claim a parent's e-mail so their real signup reports "already registered" — product decision on e-mail verification.
- Newsletter confirm tokens never expire though the error says "expired" (= AUTHZ-4).
- Single-upload R2 PUT URL valid 30 min after server verified the file → uploading admin could overwrite.
- `SafeHtml` keeps `allow`/`title` from older stored iframes; Permissions-Policy already blocks camera/mic/geo.
- Public blog search runs a regex over every post per request with no rate limit (perf).
- Public contact POST returns the stored row (`contact.js:173`).
