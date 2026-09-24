# Security Review

Map each confirmed issue to OWASP Top 10 / CWE (and ASVS if useful). A finding needs: source → sink path, the attacker's precondition, and impact.

## AuthN
Session creation, rotation on login, expiry, logout invalidation, cookie flags (HttpOnly, Secure, SameSite), password hashing (bcrypt/argon2 cost), brute-force/rate limiting, reset flows, token lifetime/storage.

## AuthZ
For every mutating or sensitive endpoint, trace identity → request → handler → service → **the resource's owner/tenant check** → query. Look for:
- a missing check, or a check done only in the UI
- IDOR (an id from the request used without an ownership check)
- role checks against the wrong resource
- mass assignment (the request body spread into insert/update)
- admin/cron/internal endpoints reachable without a secret

## Input and injection
- SQL: raw/concatenated SQL, `sql.raw`, dynamic ORDER BY or column names
- NoSQL, command, path traversal, template injection
- ReDoS: user input fed into complex regexes
- deserialization
- validation that runs on the client but not the server

## Browser
- XSS: `dangerouslySetInnerHTML`, `innerHTML`, markdown/HTML rendering, URL schemes in href
- CSRF on cookie-auth mutations
- CORS: reflecting the origin, or credentials with `*`
- security headers (CSP, frame-ancestors, nosniff, Referrer-Policy)
- open redirects

## Server-side requests and files
- SSRF: user-controlled URLs, webhook targets
- uploads: type validated by content not just extension, size limits, where files are stored, signed-upload scope, whether the result URL is verified to belong to the expected account, public exposure

## Secrets and data
- secrets in the repo or history, `.env.example` containing real values
- secrets in client bundles (`VITE_*` / `NEXT_PUBLIC_*`)
- PII in logs or error responses
- stack traces returned to clients

## Crypto
Home-rolled crypto, weak randomness for tokens (`Math.random`), non-constant-time comparison of secrets, missing HMAC verification on webhooks.

## Supply chain and CI/CD
Lockfile present and used (`npm ci`), known-vulnerable deps (`npm audit`: triage, don't dump it), postinstall scripts, GitHub Actions (`pull_request_target`, unpinned third-party actions, `permissions:` scope, secrets exposed to forks), Dependabot config.

## Business logic and concurrency
Capacity/quota checks that aren't atomic (check-then-insert without a transaction/lock/unique constraint), replayed requests, double submit, negative or overflow values, state-machine skips (e.g. cancelling an already-cancelled item), timezone edge cases in deadlines.

## Failure behavior
Fail-open vs fail-closed on auth or validation errors, swallowed exceptions, partial writes with no rollback.
