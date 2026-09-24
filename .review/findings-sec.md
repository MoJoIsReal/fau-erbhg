# Findings — security (sec-authz, sec-input, sec-platform)

Scope: F-01…F-16 identity → handler → data op; input handling; platform/secrets/CI.

### AZ-1 Public document list leaks council members' login e-mail (`uploadedBy`)
Area: SEC · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `api/documents.js:58` (`uploaded_by as "uploadedBy"` in public `GET /api/documents`), written by `api/upload.js:296` (`sanitizeText(decoded.username)`), usernames are e-mails per `api/secure-settings.js:607` (`sanitizeEmail(req.body?.username)`) and `api/auth.js:101`.
Evidence: `GET /api/documents` has no auth and returns every row (LIMIT 500) with `uploadedBy`. No client reads it (`grep uploadedBy client/src` → only `shared/schema.ts:167`). Rich-text image uploads (`RichTextEditor.tsx:251`) also create rows, so any council member who ever inserted an image is listed.
Cause → Impact: an author field is part of a public response → anyone can harvest the login identifier of every council member who uploaded something, which is the input AZ-2 needs to lock their accounts. It also conflicts with the repo's own PII posture (AGENTS.md "Never log emails").
Fix: drop `uploaded_by` from the public SELECT (or return it only when `requireRole` passes). · Test: handler-harness test asserting the public list has no `uploadedBy`. · Regression risk: none (no reader).
Scope: `api/yearly-calendar.js:65` returns `createdBy` (staff display name, `user.name || user.username`) on the public `GET ?schoolYear`; lower sensitivity, same pattern.
Dependencies: AZ-2.
Tests touching this: none.

### AZ-2 Per-account login limit lets anyone lock a council account out (and stores the raw e-mail)
Area: SEC · Severity: Medium · Confidence: HIGH · Verified: static
Where: `api/auth.js:75` (`login-account:${username}`), `:87-99` (checked before the password), `api/_shared/rate-limit.js:38-61` (fixed window from first hit).
Evidence: every POST `?action=login` increments `login-account:<email>` whether or not the password is right; at 21 attempts in 60 min the request is refused with 429 *before* `bcrypt.compare`, including for the real owner. The counter is IP-agnostic by design. The key is the plaintext username (not hashed like the other keys), kept in `api_rate_limits` up to 7 days after expiry (`cron:422-429`).
Cause → Impact: lockout keyed only on the victim identity → an unauthenticated attacker with a valid username (AZ-1, or `kindergarten_info` contact e-mails) sends ~21 requests/hour from anywhere and the council member cannot sign in to answer messages or publish events. Only CSRF double-submit is needed, which any client can obtain from `GET ?action=csrf`.
Fix: keep the account counter but let a correct password through (verify first, then apply the account limit only to failures), or raise the account threshold and add progressive delay; hash the key like `rateLimitKey`. · Test: auth-handler test where 21 failed attempts from other IPs don't block a correct login. · Regression risk: weakens brute-force protection if done naïvely — keep per-(IP,account) and per-IP limits.
Dependencies: AZ-1 (username discovery).
Tests touching this: `tests/auth-handler.test.mjs`, `tests/rate-limit.test.mjs` (limits exist; no lockout-abuse case).

### AZ-3 Cron bearer secret compared with `===`
Area: SEC · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `api/cron/event-reminders.js:64-68` `isAuthorizedCron`.
Evidence: `req.headers?.authorization === \`Bearer ${secret}\`` — not constant-time, unlike the CSRF check (`middleware.js:252-258`).
Cause → Impact: theoretical timing oracle on the one secret that authorizes retention DELETEs and mail fan-out; impractical over Vercel's network jitter. Fails closed when unset (good).
Fix: `crypto.timingSafeEqual` on equal-length buffers. · Test: existing `event-reminders` auth tests. · Regression risk: none.

### IN-1 One anonymous signup can take every seat or photo slot
Area: SEC (business logic) · Severity: Medium · Confidence: CONFIRMED · Verified: static + unit (see 04-verification)
Where: `api/registrations.js:248` (`sanitizeNumber(attendeeCount, 1, 100) || 1`), `:398-404` (capacity CTE: `type = 'foto' OR max_attendees IS NULL OR …`), `shared/photo-slots.js:138-146` (fallback drops slots past midnight); client cap `client/src/components/event-registration-modal.tsx:19` (`max(10)`).
Evidence: the server accepts `attendeeCount` up to 100 per registration while the UI allows 10. For `foto` events there is no capacity predicate at all; slots are the only limit and `assignPhotoSlots` returns fewer slots than children (possibly `[]`) once the day is full, and the insert still succeeds (confirmation mail then says "TBD", `registrations.js:579`).
Cause → Impact: validation lives only in the client → one scripted POST with `attendeeCount: 100` fills a 30-seat event (council must find and delete it); two such POSTs exhaust a 08:00 photo day (192 cells), after which real parents get registrations with no slot. Rate limit (10/10 min/IP) doesn't help — one request suffices.
Fix: cap server-side at the UI's 10 (or `max_attendees`), reject foto registrations when `photoSlots.length < requestedAttendees`, and require `childrenNames` length = attendee count for foto. · Test: handler-harness cases for 11 attendees → 400 and a full foto day → 409. · Regression risk: large families legitimately >10 (check with council).
Tests touching this: `tests/photo-slots.test.mjs` (allocator only), `tests/registration-integrity.test.mjs` (source text).

### IN-2 Public forms relay FAU-branded mail with attacker-chosen text to any address
Area: SEC (abuse) · Severity: Medium · Confidence: HIGH · Verified: static
Where: `api/registrations.js:492-503` + `:607-617` (confirmation echoes `name` ≤100 and `comments` ≤1000 chars to the submitted `email`); `api/contact.js:145-158` (acknowledgement echoes `name`); `api/contact.js:289-296` (newsletter confirmation).
Evidence: no proof of address ownership before sending; limits are per IP (`REGISTRATION_MAX_ATTEMPTS=10/10 min`, contact 3/10 min) plus per-(IP, email). Registration dedupe is per event+email, so one victim can receive one mail per open event per IP; contact acknowledgements have no per-victim cap across IPs.
Cause → Impact: the site's Gmail account sends spam/phishing text ("Kommentarer: <link>") on request → complaints can get the Gmail account throttled or suspended, and Gmail's daily send quota is shared with reminders, newsletter and confirmations, so exhausting it silently stops all legitimate mail (`reportProviderError` only logs).
Fix: drop free-text `comments` from the confirmation mail (or send it only to FAU), add a global daily cap on unauthenticated outbound mail, consider a challenge (Turnstile/hCaptcha) on signup/contact. · Test: unit test that the confirmation text omits comments; cap test. · Regression risk: parents lose the echo of their own comment.
Dependencies: OBS-1 (quota exhaustion is invisible).

### IN-3 Wrong-typed input on public/auth endpoints returns 500 instead of 400
Area: SEC (robustness) · Severity: Low · Confidence: CONFIRMED · Verified: unit (see 04-verification)
Where: `api/auth.js:58-113` (`username`/`password` not type-checked; `bcryptjs.compare` throws on non-string); `api/_shared/middleware.js:609-613` `sanitizeNumber` accepts non-integers → `registrations.js:248` (`attendeeCount: 2.5`), `secure-settings.js:236-241` (`limit=1.5`, `id=1.5`), `:509`.
Evidence: `sanitizeNumber('1.5', 1, 100)` → `1.5`; PG rejects `1.5` for integer/bigint params (22P02) → `handleError` 500 + Sentry event.
Cause → Impact: missing integer/type validation → noisy 500s and Sentry events any visitor can trigger; no data impact.
Fix: `Number.isInteger` in `sanitizeNumber` (or a `sanitizeInteger` for id/limit/count) and `typeof === 'string'` guards on login. · Test: sanitizer-runtime + auth-handler cases. · Regression risk: low.
Scope: also `api/yearly-calendar.js` already wraps it in `sanitizeInteger` (`:137-140`) — reuse that.

### IN-4 Check-then-insert on unique columns answers 500 on a double submit
Area: SEC (concurrency) · Severity: Low · Confidence: HIGH · Verified: static
Where: `api/contact.js:261-287` (newsletter subscribe: SELECT then INSERT on `email UNIQUE`); `api/secure-settings.js:618-630` (user create: SELECT then INSERT on `username UNIQUE`).
Cause → Impact: two concurrent submits → the loser hits 23505 → 500 (subscribe loses its generic-success guarantee for that request). No data corruption; the constraint holds.
Fix: `INSERT … ON CONFLICT (email) DO UPDATE … WHERE status <> 'active'`. · Test: integration test with the unique index. · Regression risk: low.

### PL-1 Several security controls silently weaken when `NODE_ENV` isn't exactly `production`
Area: SEC (config) · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `api/_shared/middleware.js:45-47` (CORS allowlist), `:155` (Sentry), `:160-167` (raw `error.message` returned; stack when `development`), `:209` / `api/auth.js:29,36` (cookie `Secure`).
Evidence: the cron comment (`event-reminders.js:58-63`) records a past incident where a deployment "never had NODE_ENV set". Vercel normally sets it, so current production is likely fine — UNVERIFIED without the project's env.
Cause → Impact: one missing variable → PG error text (table/constraint names, sometimes values) returned to anonymous callers and non-Secure session cookies.
Fix: key these on `VERCEL_ENV` or fail closed (redact unless `NODE_ENV === 'development'`). · Test: middleware test with `NODE_ENV` unset. · Regression risk: local dev convenience.

## Blocked/unverified
- Production env values (NODE_ENV, CRON_SECRET presence), Vercel firewall rules and Gmail quota tier: not visible from the repo → PL-1 and IN-2 impact are reasoned, not observed.
- `npm audit` results: see `04-verification.md`.

## Positive findings
- All SQL is Neon tagged templates; `grep -rnE "sql\.(unsafe|raw)|sql\(" api shared` → no hits.
- Role comes from the DB on every request, not from the JWT claim (`middleware.js:305-326`); `token_version` revocation on logout/password change; HS256 pinned with iss/aud (`jwt-config.js`); secret-strength guard rejects placeholders.
- CSRF: double-submit with constant-time compare on every session mutation; `tests/api-authorization.test.mjs` runs every protected route × role × missing-CSRF.
- XSS: server `sanitize-html` allowlist plus client DOMPurify re-sanitize (`safe-html.tsx`); YouTube frames rebuilt from the id; images restricted to `res.cloudinary.com`; ICS text escaped/folded (`shared/calendar-feed.js:34-68`).
- Uploads: signed scope (folder, public_id, allowed_formats), cloud-name/type/public-id binding, Admin-API re-verification of format and size (`api/upload.js:216-290`).
- ReDoS: sanitizer regexes bounded and input pre-truncated (`middleware.js:394-491`).
- Capability tokens are 256-bit, POSTed (not GET-consumed), rate-limited; cancel is two-step to survive link scanners.
- CI `permissions: contents: read`, no `pull_request_target`, first-party actions only; Dependabot with cooldowns; no secrets in history (`git log --all -p` scan found placeholders only).

## Ambiguities
- Whether registrations >10 attendees are ever legitimate (server says 100, UI says 10).
- Whether council members are meant to be publicly identifiable as document uploaders.
