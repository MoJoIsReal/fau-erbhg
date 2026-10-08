# Findings — sec-authz (authentication and authorization)

Scope: session creation/rotation, JWT verification, token_version revocation, cookie flags, login rate limits and device cookie, password policy/change, CSRF placement, per-endpoint role checks, IDOR, mass assignment, capability tokens, cron authorization.
Method: traced identity → `withApiHandler` → `requireRole`/`requireAuth`/`parseAuthToken` → `requireCsrf` → resource SQL for every `api/*.js` route and `api/cron/event-reminders.js`. Ran `node --test --experimental-test-module-mocks tests/api-authorization.test.mjs tests/auth-handler.test.mjs tests/auth-recovery.test.mjs tests/media-handler.test.mjs`: 82/82 pass. No network/DB.

### AUTHZ-1 Failure-only lockouts are check → verify → record, so concurrent guesses bypass them (media share PIN; login account lock)
Area: SEC · Severity: Medium · Confidence: HIGH · Verified: reasoned (static; concurrency not exercised)
Where: `api/media.js:189-207` `handleView` PIN branch; `api/auth.js:151-157,178-183` `handleLogin` (`accountFailureKey`); `api/_shared/rate-limit.js:75-87` `peekRateLimit`
Evidence: PIN lock reads per-(IP,share) and per-share counters with `peekRateLimit` (plain SELECT, allowed while `count < limit`), then runs `verifyPin` (bcryptjs cost 10, `media-share.js:81-90`, ~50–100 ms), and only after a wrong PIN increments via `checkRateLimit` (`media.js:199-202`). No attempt is reserved before verification, so N simultaneous requests all read the same pre-failure count. The only atomic bound on that path is `VIEW_LIMIT = 120` per 10 min per IP (`media.js:89-90,166-174`). Login's account-wide lock (20 failures/h) has the same peek → bcrypt → record shape, but per-(IP,account) 5/15 min and per-IP 30/15 min are counted atomically before the password check.
Cause → Impact: check-then-act on a counter (CWE-367/CWE-307). Precondition: attacker holds a share link (the case the PIN exists for). Intended ceiling 5 failures/IP/15 min and 30/share/day ("about a year" against a 4-digit PIN per `media.js:93-95`); with concurrent batches the real ceiling is ~120 guesses/IP/10 min → 10⁴ PINs in ~14 h from one IP, <2 h from 10 IPs → children's photos/video. For login, a many-IP burst gets ~5 × IPs guesses/h before the account lock instead of 20 (lower risk: needs many IPs, ≥12-char passwords).
Fix: reserve the attempt atomically before verifying (increment both keys via `checkRateLimit`, refuse if over, `clearRateLimit` the IP key on success; or conditional `UPDATE … SET count=count+1 WHERE count < $limit RETURNING`). Same for `accountFailureKey`. Consider ≥6-digit PINs. · Test: media-handler case — refused attempt at limit−1 never reaches `verifyPin`; counter incremented before bcrypt. · Regression risk: correct PIN after failures must still clear the IP key; "too many wrong PINs lock the share" test must keep passing.
Scope: `peekRateLimit` has exactly two callers: `api/auth.js:157`, `api/media.js:192-193`.
Dependencies: none
Tests touching this: `tests/media-handler.test.mjs:151,184`; `tests/auth-handler.test.mjs:75,99,123`; `tests/rate-limit.test.mjs`

### AUTHZ-2 change-password's current-password check has no attempt limit
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/auth.js:260-296` `handleChangePassword`, `POST /api/auth?action=change-password`
Evidence: `parseAuthToken` → `requireCsrf` → `bcryptjs.compare(currentPassword, …)` → 400 "Current password is incorrect"; no `checkRateLimit` (cf. `handleLogin` `auth.js:140-158`), failure not recorded against the `login-account` key.
Cause → Impact: CWE-307. Precondition: a live session (unlocked shared computer, or a session stolen within its 2 h life). The endpoint is an unthrottled, parallelisable password oracle; learning the password turns a 2 h session into persistent access. Also open under `passwordChangeRequired`.
Fix: per-user limit before bcrypt (e.g. `identityRateLimitKey('change-password', userId)` ~5/15 min, atomic as in AUTHZ-1). · Test: auth-handler case past the limit never reaches bcrypt. · Regression risk: low.
Dependencies: AUTHZ-1
Tests touching this: `tests/auth-handler.test.mjs:204,218`

### AUTHZ-3 Public yearly-calendar read exposes `createdBy` (author name, falling back to login e-mail)
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/yearly-calendar.js:199-207` (anonymous GET); `getEntriesForSchoolYear :183-194` selects `created_by`; `mapEntry :69` returns it; written at `:255,:422` as `user.name || user.username`.
Evidence: `GET /api/yearly-calendar?schoolYear=N` returns `createdBy` for every entry, incl. staff authors. No client component renders it (only `shared/yearly-calendar-utils.js` canonicalisation). `api/documents.js:47-49` deliberately stopped publishing `uploaded_by`; `publicBlogPost` (`secure-settings.js:67`) strips `createdBy`.
Cause → Impact: public read shares the editor mapper (CWE-359) → publishes staff/council names; login e-mail when name empty (aids AUTHZ-1/2).
Fix: omit `createdBy` (and `notifyNewsletter`/`newsletterSentAt`) from the anonymous response, like `publicBlogPost`. · Test: yearly-calendar-handler anonymous GET has no `createdBy`. · Regression risk: import diff uses the full server-side select — unaffected.
Scope: public `api/events.js` GET returns `notifyNewsletter`/`newsletterSentAt` (internal flags, no PII).
Tests touching this: `tests/yearly-calendar-handler.test.mjs` (no assertion)

### AUTHZ-4 Newsletter confirmation tokens never expire
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/contact.js:314-349` `handleNewsletterConfirm`; armed at `:272-290`
Evidence: `WHERE confirm_token = ${token} AND status = 'pending'`, no age check; no cron purges pending rows; the 400 says "Invalid or expired".
Cause → Impact: unbounded capability lifetime (CWE-613); an old confirmation mail completes opt-in months later. Small impact (one-click undo).
Fix: refuse when request time > ~7 days (re-arm `ON CONFLICT` refreshes the timestamp); optionally purge stale pending rows in the morning cron. · Test: contact-handler old pending token refused. · Regression risk: re-subscribe flow.
Tests touching this: `tests/contact-handler.test.mjs`

## Blocked/unverified
- AUTHZ-1 concurrency established by reading, not reproduced (harness cannot model parallel transactions) → HIGH not CONFIRMED.
- `x-real-ip` trust (`rate-limit.js:11-26`) relies on Vercel overwriting the header at the edge; not verified live. If false, all per-IP limits are bypassable.
- Production `NODE_ENV`/`SESSION_SECRET`/`CRON_SECRET` not observable; code fails closed for each.
- SQL predicates (e.g. cancel window `e.date >= osloToday()`) checked by reading; `npm run test:integration` not run.

## Positive findings
- Identity reloaded from DB every request: `parseAuthToken` (`middleware.js:292-345`) pins HS256/issuer/audience, loads user by id, requires `token_version` match; role/password-change state come from DB (`tests/api-security.test.mjs:129-201`).
- Logout and password change bump `token_version`; password change reissues JWT+CSRF (`auth.js:230-234,300-324`).
- `jwt` cookie HttpOnly, SameSite=Strict, Secure, 2 h = JWT exp; `login-device` cookie HttpOnly, Path=/api/auth, separate audience (`auth.js:45-88`).
- Constant-time double-submit CSRF on every state-changing session route incl. login (`middleware.js:253-284`); matrix asserts 403 + no writes without the pair.
- Authorization matrix covers every `requireRole` route × role; meta-test fails if a guarded handler is missing (`tests/api-authorization.test.mjs:107-116`).
- Login: dummy bcrypt for unknown users (equal timing, same 401); three limits; known-device cookie prevents lockout.
- No mass assignment: explicit field lists; users POST restricts role to member/staff; users DELETE cannot remove admin; import commit `existingId` must equal server-recomputed match (`yearly-calendar.js:306-312`), `notify_newsletter` forced false.
- Capability tokens: cancel tokens 244 bits from `pg_strong_random` with unique index; newsletter/media `randomBytes(32)`; media tokens SHA-256 hashed + AES-256-GCM sealed, uniform 404; PIN bcrypt; view grant HMAC bound to share id, 12 h, constant-time compare; unsubscribe non-enumerating.
- Public reads strip PII (registrations count-only for non-council; documents omit `uploaded_by`; `publicBlogPost`; subscriber tokens never selected).
- Cron fails closed; `CRON_SECRET` compared in constant time.
- Password policy server-side: 16-char CSPRNG temp passwords with rejection sampling and forced change; 365-day expiry enforced in `requireAuth`; ≥12 chars and differ from current.
- Client IP from `x-real-ip` or right-most XFF hop.

## Ambiguities
- Staff (`YEARLY_CALENDAR_EDITORS`) can set `notifyNewsletter` (`yearly-calendar.js:115`) → evening cron mails all subscribers (`cron/event-reminders.js:202-207`). Is broadcasting within "staff edit yearly entries only"?
- Logout signs out every device (tests treat as intended; undocumented).
- `internal` events: client forces `noSignup`, server `validateEventBody` (`api/events.js:228-283`) does not.
- Future-dated blog posts public immediately (`secure-settings.js:313-324` filters only on status). Is `publishedDate` a schedule?
- Bearer fallback in `parseAuthToken` unused by any client; keep or remove?
- Share PIN lock (30 failures/day) blocks every viewer incl. those with the right PIN — deliberate, but a link holder can deny the share to others.
