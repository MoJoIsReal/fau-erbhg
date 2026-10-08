# Findings — sec-platform (secrets, crypto, deps, CI/CD, config, env, error leakage)

Method: static reading, `git log --all -p` pattern scans, SHA-256 of inline scripts in client/dist HTML, grep of built bundle, node_modules reading, `node --test` of telemetry-privacy/observability/deploy-config/api-security/media-share/password-policy (60/60 pass). No network, no live Vercel/Neon/Sentry.
Counts: Critical 0 · High 0 · Medium 1 · Low 6

### PLAT-1 Media-share PIN failure budget never runs out over a share's lifetime; one attacker can lock every viewer out
Area: SEC · Severity: Medium · Confidence: HIGH · Verified: static + reasoned (arithmetic on constants)
Where: `api/media.js:97-100` (PIN_IP_MAX_FAILURES=5/15 min, PIN_SHARE_MAX_FAILURES=30/24 h), `api/media.js:192-215` handleView; `shared/media.js:77-88` (lifetime 90 default/180 initial/365 max; `MEDIA_PIN_PATTERN=/^\d{4,8}$/`); `api/_shared/media-share.js:79-97`
Evidence: share-wide counter uses a fixed 24 h window (`checkRateLimit … PIN_SHARE_WINDOW_SECONDS`, :210), resets daily, never cleared on success (only ipKey is cleared, :214). No lifetime cap → 30 guesses/day for as long as the share is published. Creation accepts 4-digit PINs (`media.js:289`) → 2,700 guesses over the 90-day default (≈27% for a uniformly random PIN), 10,950 over 365 days (full space); human-chosen PINs sooner. `media-share.js:79-81` and `docs/mediedeling.md:69-70` make this limit the only real protection.
Cause → Impact: per-window-only limit + weak minimum PIN length. Attacker holding a forwarded/leaked `/del#token` link without the PIN, rotating IPs, reaches children's photos/videos at ~30 guesses/day. The same 30 failures trip `peekRateLimit(shareKey)` (:200) for every grant-less viewer → parents get PIN_LOCKED for 24 h, repeatable daily. (Peek-then-record race is in AUTHZ-1.) CWE-307 / CWE-521.
Fix: cumulative per-share failure cap (e.g. 100) on `media_shares`, after which an admin must set a new PIN or revoke; require ≥6 digits or deny trivial PINs; apply share-wide lock only to grant-less clients with backoff. · Test: media-handler at cumulative cap → PIN_LOCKED; creation refuses 4-digit PINs. · Regression risk: existing 4-digit shares; admin UX.
Scope: `login-account` (`auth.js:138`) same windowed pattern, but passwords ≥12 chars → not exploitable.
Dependencies: AUTHZ-1 (atomicity) · Tests: `tests/media-handler.test.mjs:187-190`

### PLAT-2 Rate-limit keys are unsalted SHA-256 of IP / e-mail — stored "pseudonyms" are reversible
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/_shared/rate-limit.js:28-44` hashKey/rateLimitKey/identityRateLimitKey; callers `auth.js:134-138` (username = e-mail), `contact.js:106,251`, `registrations.js:377` (`eventId:email`); retention `cron/event-reminders.js:471-472` (rows kept until 7 days after window)
Evidence: key = `sha256(scope:ip:lower(identifier))`, no secret; comment `rate-limit.js:39-41` claims "no address is stored".
Cause → Impact: unkeyed hash over low-entropy inputs (IPv4 2^32; parent/council e-mails a small known set). A DB dump/read access (leaked Neon credential, preview DB, backup) reverses who tried to log in/sign up/subscribe, from which IP, over ~7 days. CWE-759/CWE-328 (GDPR pseudonymisation).
Fix: HMAC with an HKDF-derived key from SESSION_SECRET, as `media-share.js:45-48` does (purpose `rate-limit-v1`); old rows expire within days. · Test: rate-limit key ≠ plain sha256, stable per secret. · Regression risk: counters reset once at deploy.
Scope: `accountDigest` (`auth.js:50-52`) also unsalted but inside a signed HttpOnly cookie on the user's own device — minimal.
Tests: `tests/rate-limit.test.mjs`

### PLAT-3 Temporary passwords are mailed in clear text and never expire
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/secure-settings.js:672-700` (POST users), `api/_shared/password-policy.js:44-53`
Evidence: row inserted with `must_change_password=true, password_changed_at=NULL`; mail contains "Midlertidig passord: …". `isPasswordChangeRequired` stays true forever but the temporary credential stays valid indefinitely; whoever logs in with it chooses the permanent password.
Cause → Impact: no credential expiry (CWE-262/CWE-640). Unread welcome mail or mailbox compromised months later → member/staff account taken, real user locked out.
Fix: `temp_password_expires_at` (e.g. 7 days), refuse login after with TEMP_PASSWORD_EXPIRED; needs an admin re-issue path (none today). · Test: auth-handler expired temp password. · Regression risk: never-logged-in users need re-issue.
Dependencies: sec-authz · Tests: `password-policy`, `auth-handler`

### PLAT-4 `.gitignore` does not cover `.env.production`, `.env.development`, `.env.preview`
Area: SEC · Severity: Low · Confidence: CONFIRMED · Verified: static (`git check-ignore`)
Where: `.gitignore:12-17`
Evidence: only `.env`, `.env.local`, `.env.*.local` ignored; `git check-ignore .env.production` returns nothing; these are the names Vite and `vercel env pull <file>` use.
Cause → Impact: incomplete ignore list (CWE-538). `git add .` after pulling production env commits DATABASE_URL/SESSION_SECRET/R2/Gmail/Cloudinary secrets; push to main auto-deploys → leak in history.
Fix: `.env*` + `!.env.example`. · Test: `git check-ignore` for those names; `.env.example` stays tracked. · Regression risk: none.

### PLAT-5 Main CSP allows an unused script origin and any HTTPS image
Area: SEC · Severity: Low · Confidence: HIGH (script-src) / POSSIBLE (img-src) · Verified: static + bundle grep
Where: `vercel.json` main CSP: `script-src … https://browser.sentry-cdn.com`, `img-src 'self' data: https:`
Evidence: Sentry bundled from npm (`client/src/main.tsx:11`); nothing in `dist/public/assets` or `client/src` references sentry-cdn. `sanitizeHtml` (`middleware.js:543-549`) already restricts stored `<img>` to `res.cloudinary.com`. `deploy-config` asserts required origins, not absence of unneeded ones.
Cause → Impact: allowlist broader than needed (CWE-693): a future HTML injection could load script from a third-party CDN; `img-src https:` allows beacons/exfiltration to any host.
Fix: drop sentry-cdn; narrow `img-src` to `'self' data: blob: https://res.cloudinary.com` after confirming no other image host (OG images, board photos). · Test: deploy-config — every script-src origin referenced by the build. · Regression risk: missing images if another host is used.
Tests: `tests/deploy-config.test.mjs`

### PLAT-6 `npm audit` high (source-map-js 1.2.1, GHSA-68fv-2mgg-jv7q) not reachable as wired
Area: SEC · Severity: Low · Confidence: HIGH · Verified: static (node_modules)
Where: `package-lock.json:6233` source-map-js@1.2.1 ← postcss@8.5.28 ← sanitize-html@2.17.7 (runtime) / @tailwindcss (build)
Evidence: `sanitize-html/index.js:516` calls `postcssParse(…, {map:false})`; `postcss/lib/previous-map.js:28` returns immediately on `map===false`; path reached only for `style` attributes, which the allow-list (`middleware.js:525-529`) never permits. Tailwind processes only repo CSS at build time.
Cause → Impact: no runtime exposure; `npm audit --omit=dev` stays red, masking new real advisories.
Fix: `overrides` entry once a patched version exists (UNVERIFIED offline) or wait for Dependabot; record triage in DEPLOYMENT release checks. · Test: `npm audit --omit=dev` clean.

### PLAT-7 Blacklist-check failure path logs an unredacted DB message and fires a Sentry capture Vercel drops
Area: OBS · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: `api/registrations.js:358-365`
Evidence: `console.warn(…, blacklistError.message)` unredacted; `Sentry.captureException(blacklistError)` neither awaited nor `waitUntil`, while `sentry.js:4-8` and `provider-errors.js:23-27` document such captures are frequently lost on Vercel. Every other site uses `reportProviderError` or `await`.
Cause → Impact: one call site bypasses the shared helper (CWE-778 / possible CWE-532): spam-filter degradation unreported; a future query change could log request data unredacted.
Fix: `reportProviderError('Email blacklist check failed; skipped', blacklistError)`. · Test: registrations-handler throwing blacklist query → redacted path.

## Blocked/unverified
- Live `npm audit` (no network); patched source-map-js existence unknown.
- Vercel env scoping (BLOCKED): whether Preview/Dependabot builds get production DATABASE_URL/SESSION_SECRET/R2/Gmail; docs instruct separation (`DEPLOYMENT.md:34-35,46`).
- Sentry project server-side scrubbing/IP storage/retention.
- Vercel platform request logs keep `/avmelding?token=` and `/nyhetsbrev?avmeld=` query strings (app logs strip queries, `log.js:46-51`).
- Live response headers; branch protection on `main`.

## Positive findings
- No secrets in tree or history (DSNs, AWS/GitHub/Slack keys, private keys, keyed Sentry DSNs, cloudinary:// URLs, JWTs) — only test-only CI credentials and the public Turnstile site key. `.env.example` placeholders only; `jwt-config.js:6-12` rejects placeholders (fail closed).
- `dist/public` has no source maps and no server secret names; client reads only `VITE_SENTRY_DSN`, `VITE_TURNSTILE_SITE_KEY`.
- JWT: HS256 pinned, iss/aud, 2 h, tokenVersion, ≥32-char secret; missing secret → 401.
- CSPRNG everywhere (CSRF/newsletter `randomBytes(32)`, 256-bit share token, ~244-bit cancel token, ~93-bit temp password with rejection sampling); no `Math.random`.
- Constant-time compares for CSRF, cron bearer, view-grant HMAC.
- Media-share crypto: AES-256-GCM random 96-bit IV, purpose-separated HKDF keys, SHA-256 token lookup, grant bound to share id + expiry; root-secret rotation documented.
- Error leakage: `handleError` generic unless `NODE_ENV==='development'`; no handler returns `error.message`/stack; `log.js` drops query strings, logs actor id/role only; logs and server Sentry events redacted.
- Client telemetry: replay disabled; transport-level scrubber tested against the real SDK; Analytics `beforeSend` scrubbed; `/del` loads no Sentry/analytics (test-guarded).
- SMTP: pooled transport still TLS with certificate verification.
- CI: `contents: read`, no `pull_request_target`, no secrets, `npm ci`, first-party actions only; Dependabot covers npm + actions with cooldowns; only esbuild/fsevents have install scripts.
- Config drift clean: CSP script hash = computed hash of inline theme script in client/dist `index.html` and `del.html`; JSON-LD non-executable; `/del` CSP `default-src 'none'` + `no-referrer`; `/api` `no-store`; `wasm-unsafe-eval` justified by PDF chunk.
- Cron fail-closed, constant-time.

## Ambiguities
- `SESSION_SECRET` is JWT key, device-cookie key and HKDF root; rotation also kills share-link re-copy (documented).
- Turnstile fails open on Cloudflare outage / bad server secret (documented policy).
- Google Fonts loaded from Google on every public page (visitor IPs to a third party, GDPR) though Manrope is self-hosted in `client/public/fonts`.
- Capability tokens stay in address bar/history on `/avmelding` and `/nyhetsbrev` (no `replaceState`).
- Actions pinned to major tags not SHAs (first-party, Dependabot-managed) — policy choice.
- bcrypt cost 10 (OWASP minimum); bcryptjs silently uses first 72 bytes; no max length.
