# Deployment and operations

Current operating reference. Keep release checks here and implementation
boundaries in [architecture.md](./architecture.md).

## Runtime and verification

The React SPA and the ten Vercel functions (nine top-level handlers and one
cron handler, of the Hobby plan's twelve) are one deployment. There is no
separate Node server. The project requires Node **22.x**, matching
`package.json` and `.github/workflows/ci.yml`.

**Keep the functions in the database's region.** Every handler talks to Neon
over HTTPS, one round trip per SQL statement, and a request runs up to about
six of them in sequence (a public signup does). The function region (Vercel →
Project → Settings → Functions) and the Neon project's region were checked on
2026-10-08 and are the same. If either is ever moved, move the other with it: a
transatlantic gap adds roughly 80–100 ms to every statement.

```bash
npm ci
npm run verify
```

`verify` runs frontend TypeScript, the backend type gate, the i18n
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
| `PUBLIC_BASE_URL` | `api/_shared/newsletter.js`: origin of email links, including cancellation links, and of media share links. Defaults to `https://www.erdal-bhg.no`; set the correct HTTPS origin for isolated previews. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_JURISDICTION` | `api/_shared/r2.js`: the private Cloudflare R2 bucket behind media sharing. Use an *Object Read & Write* token scoped to that one bucket; mark both keys sensitive. `R2_JURISDICTION=eu` for an EU-jurisdiction bucket. Unset = media sharing off (the API answers 503 `NOT_CONFIGURED`). Never give a preview the production bucket. Setup: [mediedeling.md](./mediedeling.md). |
| `MEDIA_MAX_FILE_BYTES`, `MEDIA_STORAGE_QUOTA_BYTES` | Optional media limits: 1 GiB per file (at most 5 GiB) and 9 GiB in total, which keeps R2 inside its 10 GB free tier. |
| `SENTRY_DSN` | Backend envelope sender, enabled in production. |
| `VITE_SENTRY_DSN` | Frontend Sentry initialization, compiled at build time. |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget on the signup, contact and newsletter forms (`client/src/components/turnstile-widget.tsx`), compiled at build time. Unset = no widget. |
| `TURNSTILE_SECRET_KEY` | `api/_shared/turnstile.js`: verifies the widget's token with Cloudflare. Unset = check off. Set = every public form must carry a valid token, so set it together with `VITE_TURNSTILE_SITE_KEY` in the same deployment. |
| `NODE_ENV` | Vercel sets `production`. Only `development` relaxes anything — raw error messages, cookies without `Secure`, the localhost CORS list — so set it only for a local `vercel dev`; unset or any other value gets the deployed behaviour. Provider/Sentry reporting runs only when it is `production`. |
| `VERCEL_ENV`, `VERCEL_REGION` | Vercel-provided metadata read by backend telemetry; do not maintain manually. |

There is no application `DEBUG` switch or `PORT` environment consumer. The dev
port is set by the npm script. Never log email addresses, phone numbers, session
secrets or capability tokens while troubleshooting.

## Database setup and migrations

The current table/type declaration is [`shared/schema.ts`](../shared/schema.ts).
Handlers use parameterized Neon SQL, not Drizzle's query builder.

For a **new isolated database**, apply
[`tests/integration/baseline.sql`](../tests/integration/baseline.sql) (the base
tables no migration creates), then every SQL file in numeric order according to
[`migrations/README.md`](../migrations/README.md) — exactly what the CI
integration job does. There is no `db:push` script any more: pushing the Drizzle
declaration reconciled a database to `shared/schema.ts`, and at the time that
dropped indexes and checks only the migrations created, among them the unique
`(event_id, lower(email))` index that stops duplicate signups.

For an **existing deployment**, review and apply only outstanding numbered SQL
migrations through the Neon SQL editor before the dependent code is deployed.
Never edit or renumber an applied migration. New schema changes require both
the shared declaration and a new migration; `npm run test:integration` compares
the database the migrations build with the declaration and fails when they
disagree. Review existing data and arrange recovery before destructive
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

**Mail that did not go out.** Each cron run writes one `cron.run` line; when
mail was left unsent (failed, given up on, still queued, or email not configured)
it is written at `warn` with `"mailProblems":true`, and backend Sentry gets one
event per such run titled `Mail delivery problems in the newsletter run` (or
`… reminders run`). Alert on it: in Sentry, create an issue alert that matches
events whose message contains `Mail delivery problems` and emails the admin, with
a one-day action interval so a single bad address does not mail every run.
Without Sentry, search the Vercel logs for `mailProblems`. The admin's settings
page (Innstillinger → Nyhetsbrev) shows which subscribers' mail failed and how
much is waiting for another try; deleting a failing subscriber removes the
banner.

**Housekeeping that left personal data behind.** When the morning run could not
delete an expired private media share from R2 (`mediaPurgeFailed`), or found
rows whose date the privacy retention cannot read and so never deletes
(`unparseableDates`), its `cron.run` line is written at `warn` with
`"housekeepingProblems":true`, and backend Sentry gets one event titled
`Housekeeping problems in the reminders run`. Add a second alert matching that
title (or widen the mail alert to `problems in the`). Unreadable dates are fixed
in the data: find them with
`SELECT id, date FROM events WHERE date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'` and
`SELECT id, created_at FROM contact_messages WHERE created_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`.
A morning stage that fails outright still writes its `cron.run` line, at
`error`, with `stagesFailed` naming it; the run answers 500 and Sentry gets
`Morning stage(s) failed: …`.

**Who changed what.** Runtime logs on the Hobby plan are kept for an hour, so
every successful change by a signed-in user also writes a row to `audit_log`
(migration 0024): account id and role, method, path, `action`/`resource`, the
id acted on or created, status and request id. No content is copied. Rows are
deleted after 12 months by the morning run (`auditLogDeleted`). In the Neon
SQL editor:
`SELECT created_at, user_id, role, method, path, action, resource, target_id FROM audit_log ORDER BY id DESC LIMIT 50;`
A failed audit write never fails the change; it logs `audit.write_failed`.

Use Vercel build/function logs and request IDs to investigate failures. A page
that could not load its data shows the request id as "Feil-ID"; it is the
`requestId` of our log lines and the `x-vercel-id` of Vercel's, and backend
Sentry events carry it as a tag beside `path`, `action`, `resource`, `role` and
`targetId`. Both tiers set Sentry's `release` to the deployed commit
(`VERCEL_GIT_COMMIT_SHA`). Backend
Sentry redacts sensitive text. Frontend Sentry scrubs capability-bearing data at
the transport boundary and disables Session Replay; unsupported/binary envelopes
are dropped. Vercel Analytics scrubs page URLs before transmission. Configure
Sentry DSNs only if the project's CSP `connect-src` allows the ingest host.

**The CSP is wider than the site needs, by decision (2026-10-08).** It still
allows `https://browser.sentry-cdn.com` in `script-src` (Sentry is bundled),
any `https:` image, `data:` in `connect-src`, and the Google Fonts hosts (the
fonts are self-hosted since 2026-10-09). Narrowing it was reviewed and left for
now, since a mistake there breaks the live site. Revisit it as one deliberate
`vercel.json` change with a preview check, not piecemeal.

For CORS issues, inspect the allowlist in `api/_shared/middleware.js`; never
replace it with `*`. Upload problems should be checked against the MIME,
extension, 10 MB limit and owned Cloudinary URL rules in
`api/_shared/upload-validation.js`. Document deletion waits for provider
confirmation before removing the database reference.

## Dependency advisories

Dependabot owns dependency bumps; don't hand-edit `package-lock.json` to clear
an audit. When `npm audit --omit=dev` reports something, trace whether the
vulnerable code is reachable from a request, record the call here, and let the
Dependabot PR land the fix.

- **source-map-js ≤ 1.2.1** (GHSA-68fv-2mgg-jv7q, high; event-loop denial of
  service through crafted source-map sections). Pulled in at runtime only by
  `postcss`, which `sanitize-html` uses to parse `style` attributes with
  `{ map: false }`, so no source map is ever read from user input. Not
  reachable; fixed in 1.2.2, which arrives with the next Dependabot lockfile
  bump. Triaged 2026-10-08.

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
- [ ] Media sharing: create the R2 bucket, CORS and lifecycle rules and scoped
  token, apply `0019_media_shares.sql`, then run `scripts/media-smoke.mjs`
  against the real bucket and the iPhone checklist in
  [mediedeling.md](./mediedeling.md) §4.4 (large video upload and playback in
  iOS Safari, resume after a playback URL expires).
- [ ] Potluck signups: apply `0020_event_food_contribution.sql` **before**
  deploying (event saves write `events.potluck`), then create a Foreldrefest
  with "Kurvfest" ticked on a preview, sign up, and check the food answer in the
  registration list and the Excel export.

- [ ] Apply `0022_media_previews.sql`, `0023_temporary_password_expiry.sql` and
  `0024_audit_log.sql` **before** deploying: login reads
  `users.temp_password_expires_at` and media uploads write
  `media_files.preview_key`, so without them those requests fail (without
  0024, every change logs `audit.write_failed` and the morning run fails its
  `auditLogDeleted` stage). `0021_registration_iso_registered_at.sql` is safe
  before or after.

- [ ] With a screen reader (VoiceOver on iOS and NVDA or VoiceOver on
  desktop), in both languages: a failed login, a refused password change and
  a calendar entry saved without a title each announce an error next to the
  field; a month-grid chip reads its category and "avlyst" when cancelled.
- [ ] On a preview: sign up for an event, then cancel through the emailed link;
  the seat count on /kalender changes at once both times, without a reload.
- [ ] Run Lighthouse (mobile) on `/` before and after this release, and confirm
  in the network panel that no request goes to fonts.googleapis.com or
  fonts.gstatic.com.
- [ ] As an admin, send a user a new temporary password from Innstillinger,
  and check that `audit_log` has rows for it and for a deleted test post.

These checks do not authorize production mutations or publication. Follow the
deployment and migration procedures above when a release is requested.

## Rollback

Use the configured Vercel deployment rollback/promote controls to return to a
known working application version, or review a Git revert and push to `main`.
Neither action reverses database migrations or provider deletions. Check schema
compatibility with the old code before rollback. Database recovery requires a
separate, reviewed Neon restore/branch procedure and verification before changing
the application's connection. Do not assume a fixed recovery time.
