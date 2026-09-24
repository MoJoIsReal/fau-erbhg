# Deployment and operations

Current operating reference. Keep release checks here and implementation
boundaries in [architecture.md](./architecture.md).

## Runtime and verification

The React SPA and the nine Vercel functions (eight top-level handlers and one
cron handler) are one deployment. There is no separate Node server. The project
requires Node **22.x**, matching `package.json` and `.github/workflows/ci.yml`.

```bash
npm ci
npm run verify
```

`verify` runs frontend TypeScript, the backend diagnostic ratchet, the i18n
ratchet, the offline `node:test` suites and the frontend production build.
The separate CI PostgreSQL job runs `npm run test:integration`; see
[database-testing.md](./database-testing.md). It uses no production credentials.

`npm run dev` serves the frontend on port 5000. It does not execute `api/*.js`.
Use a separately configured Vercel preview or `vercel dev` when testing actual
HTTP handlers. Never connect automated tests to production services.

Vercel builds with `npm run build` and serves `dist/public`, as configured in
[`vercel.json`](../vercel.json). Keep development dependencies available during
installation: Vite and TypeScript are build tools. Use `npm ci` for reproducible
local/CI installs. A push to `main` triggers the configured production deployment;
local file edits do not publish anything.

## Environment variables

Set values in the appropriate Vercel environment. Use separate database and
provider credentials for previews; do not copy production secrets into tests.
`.env.example` contains placeholders only. `VITE_*` values are browser-visible.

| Variable | Consumer and purpose |
|---|---|
| `DATABASE_URL` | `api/_shared/database.js`: Neon connection; also `drizzle.config.ts` for explicitly requested schema operations. |
| `SESSION_SECRET` | `api/_shared/jwt-config.js`: non-placeholder secret of at least 32 characters for signed sessions. |
| `CRON_SECRET` | Cron handler: requires an exact `Authorization: Bearer …` match in every environment; missing secret fails closed. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | `api/_shared/email.js`: Gmail SMTP and sender account; contact mail is sent to `GMAIL_USER`. Use a Gmail app password. No SendGrid adapter exists. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Upload signatures, ownership checks, downloads and deletion in the Cloudinary helpers/handlers. |
| `PUBLIC_BASE_URL` | `api/_shared/newsletter.js`: origin of email links, including cancellation links. Defaults to `https://www.erdal-bhg.no`; set the correct HTTPS origin for isolated previews. |
| `SENTRY_DSN` | Backend envelope sender, enabled in production. |
| `VITE_SENTRY_DSN` | Frontend Sentry initialization, compiled at build time. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget on the signup, contact and newsletter forms (`client/src/components/turnstile-widget.tsx`), compiled at build time. Unset = no widget. |
| `TURNSTILE_SECRET_KEY` | `api/_shared/turnstile.js`: verifies the widget's token with Cloudflare. Unset = check off. Set = every public form must carry a valid token, so set it together with `VITE_TURNSTILE_SITE_KEY` in the same deployment. |
| `NODE_ENV` | Runtime cookie security, CORS, error redaction and provider reporting. Vercel/build tools manage this; production must use `production`. |
| `VERCEL_ENV`, `VERCEL_REGION` | Vercel-provided metadata read by backend telemetry; do not maintain manually. |

There is no application `DEBUG` switch or `PORT` environment consumer. The dev
port is set by the npm script. Never log email addresses, phone numbers, session
secrets or capability tokens while troubleshooting.

## Database setup and migrations

The current table/type declaration is [`shared/schema.ts`](../shared/schema.ts).
Handlers use parameterized Neon SQL, not Drizzle's query builder.

For a **new isolated database**, explicitly configure its `DATABASE_URL`, use
`npm run db:push` to create the declared schema, then apply applicable SQL files
in numeric order according to [`migrations/README.md`](../migrations/README.md).
The SQL files also contain constraints, indexes and data repairs absent from the
Drizzle declaration. `db:push` does not create a numbered migration file.

For an **existing deployment**, review and apply only outstanding numbered SQL
migrations through the Neon SQL editor before the dependent code is deployed.
Do not use `db:push` as a production migration generator. Never edit or renumber
an applied migration. New schema changes require both the shared declaration
and a new migration. Review existing data and arrange recovery before destructive
changes; test migrations on an isolated database first.

Create the initial administrator using a reviewed bootstrap procedure with a
bcrypt hash generated using the installed `bcryptjs`, never a plaintext stored
password. Set `must_change_password=true` for an initial/reset password. Existing
users change their password through the application's password-change screen
(`/api/auth?action=change-password`); administrative resets use the user controls.
Password changes revoke older sessions through `token_version`.

## Scheduled mail and retention

`vercel.json` schedules `/api/cron/event-reminders` at **07:00 UTC**, and the same
handler with `?task=newsletter` at **19:00 UTC**. Event dates are computed in
Europe/Oslo. The function limit is 30 seconds; mail work has a 23-second budget
with SMTP timeouts and socket cancellation. A database/provider outage can
still cause a failed run; inspect structured summaries rather than assuming a
schedule guarantees completion.

The morning run performs privacy retention and housekeeping independently of
SMTP configuration, then sends registration reminders. The evening run consumes
the durable per-subscriber newsletter outbox. Leases recover interrupted work;
mail delivery is at least once, with possible duplicates after an ambiguous
provider acceptance. See [subsystems.md](./subsystems.md) for retention windows,
retry limits, source stamping and ownership invariants.

## Cloudflare Turnstile (public forms)

Turnstile checks that event signups, contact messages and newsletter signups are
sent by a person. It is independent of DNS: `erdal-bhg.no` does **not** need to
be added to Cloudflare as a site, and nameservers stay where they are.

The production widget exists (created 2026-09-24 through the Cloudflare API):
**FAU Erdal Barnehage**, site key `0x4AAAAAAFCSHrMaMJJaJxAb`, Managed mode,
hostnames `erdal-bhg.no` and `fau-erdalbhg.vercel.app`. Its secret key is shown
only in the Cloudflare dashboard (Turnstile → FAU Erdal Barnehage). Step 1 below
is how to recreate it.

1. In the Cloudflare dashboard open **Turnstile → Add widget**. Hostnames, one
   per entry, without `https://` or a path: `erdal-bhg.no` (covers
   `www.erdal-bhg.no`) and `fau-erdalbhg.vercel.app`. Never add bare
   `vercel.app`: that would admit every Vercel site. Mode: **Managed**.
2. In Vercel set, for **Production**, `VITE_TURNSTILE_SITE_KEY` (site key) and
   `TURNSTILE_SECRET_KEY` (secret key, marked sensitive). For **Preview** and
   **Development** use Cloudflare's always-pass test keys, which work on any
   hostname: site key `1x00000000000000000000AA`, secret
   `1x0000000000000000000000000000000AA`.
3. Redeploy. Vite compiles the site key into the build, and Vercel applies
   changed variables only to new deployments. Both keys must arrive in the same
   deployment: a secret without a site key refuses every public form.

Failure policy (`api/_shared/turnstile.js`): a missing, invalid, expired or
reused token is refused with 400 and code `TURNSTILE_FAILED`, and the form asks
the visitor to wait for the check and send again. If Cloudflare is unreachable
or rejects the secret itself, the request is let through and the fault is
logged and reported to Sentry — the per-IP limits and the daily public-mail cap
still apply.

Troubleshooting from the widget's error code (shown in the widget and the
browser console): `110200` domain not authorised — the page's hostname is
missing from the widget's hostname list; `110100`/`400020` invalid site key —
wrong or mistyped `VITE_TURNSTILE_SITE_KEY` (or the secret key pasted there);
`200500` iframe load error — `challenges.cloudflare.com` is blocked, usually by
the CSP in `vercel.json` or a browser extension. Server-side
`invalid-input-secret` in the logs means `TURNSTILE_SECRET_KEY` is wrong.

## Post-deployment checks and monitoring

Check public `GET /api/events` and `GET /api/documents`, page navigation, login,
password change, authorized editing, upload/download and a controlled test email
in a preview first. Uptime monitors can use `GET /api/events`, expecting status
200 and a JSON array. There is no `/api/health` endpoint.

Use Vercel build/function logs and request IDs to investigate failures. Backend
Sentry redacts sensitive text. Frontend Sentry scrubs capability-bearing data at
the transport boundary and disables Session Replay; unsupported/binary envelopes
are dropped. Vercel Analytics scrubs page URLs before transmission. Configure
Sentry DSNs only if the project's CSP `connect-src` allows the ingest host.

For CORS issues, inspect the allowlist in `api/_shared/middleware.js`; never
replace it with `*`. Upload problems should be checked against the MIME,
extension, 10 MB limit and owned Cloudinary URL rules in
`api/_shared/upload-validation.js`. Document deletion waits for provider
confirmation before removing the database reference.

## Outstanding release checks

The remediation is implemented locally. These checks have not yet been exercised
against their actual runtime/provider; automated fixtures do not replace them.
Complete them in an isolated preview with synthetic data and record the result
on the release/PR. Remove completed items from this list.

- [ ] Run both hosted CI jobs on Node 22, including the PostgreSQL service job.
  Local verification passed on Node 24; it does not establish Node 22 results.
- [ ] Use a native screen reader with both rich-text editor callers in Norwegian
  and English; verify names, errors and keyboard focus. DOM/accessibility-tree
  checks have passed, but a screen-reader session is still outstanding.
- [ ] Open standard and photo attendee exports in desktop Excel; verify literal
  cell values, Unicode and phone numbers. Serialized workbook tests have passed.
- [ ] Exercise expired-session recovery and retry/stale-data views through an
  authenticated browser and the real preview API.
- [ ] Verify image/raw PDF deletion with isolated Cloudinary assets, including
  retry after provider failure and disappearance of the public asset.
- [ ] Verify Gmail confirmation/reminder/newsletter sends and cron summaries
  with test recipients, including a delivery retry.
- [ ] Verify received Sentry/Analytics payloads in an isolated telemetry project
  contain no synthetic capability tokens and no replay data.
- [ ] After setting the Turnstile keys, submit the contact form, the newsletter
  form and an event signup on `https://www.erdal-bhg.no` and on
  `https://fau-erdalbhg.vercel.app`; each must show the widget and succeed.

These checks do not authorize production mutations or publication. Follow the
deployment and migration procedures above when a release is requested.

## Rollback

Use the configured Vercel deployment rollback/promote controls to return to a
known working application version, or review a Git revert and push to `main`.
Neither action reverses database migrations or provider deletions. Check schema
compatibility with the old code before rollback. Database recovery requires a
separate, reviewed Neon restore/branch procedure and verification before changing
the application's connection. Do not assume a fixed recovery time.
