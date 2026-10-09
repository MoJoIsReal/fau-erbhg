# FAU Erdal Barnehage

The website of the parents' council (FAU) at Erdal kindergarten, in Norwegian
and English: events and signups, a yearly calendar, news, documents, contact
and newsletter, private photo sharing with parents, and an admin area for
council members.

## Documentation

- [`AGENTS.md`](AGENTS.md) — architecture, conventions, commands and safety
  boundaries; the source of truth for how the code is organised (also what AI
  coding agents load; `CLAUDE.md` imports it).
- [`docs/design/style-guide.md`](docs/design/style-guide.md) — the UI Design &
  Style Guide 1.1; read it before any visual change.
- [`docs/`](docs/README.md) — deployment, environment variables, architecture,
  subsystem rules, database testing and outstanding release checks.

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS, TanStack Query, built with
  Vite.
- **Backend:** Vercel serverless functions in `api/*.js` (plain JavaScript, no
  separate server), parameterized SQL through Neon's client.
- **Database:** Neon PostgreSQL. The schema is changed only by the numbered SQL
  files in `migrations/`, applied by hand; `shared/schema.ts` declares the same
  tables for types and form validation, and CI checks that the two agree.
- **Files:** Cloudinary for documents; Cloudflare R2 for private photo sharing.
- **Mail:** Gmail (confirmations, contact, newsletter, reminders).

## Development

```bash
npm ci             # install exactly what package-lock.json pins
npm run dev        # the frontend on http://localhost:5000
npm run check      # TypeScript, the backend type gate and the i18n ratchet
npm test           # every offline suite in tests/ (node:test)
npm run build      # production frontend build
npm run verify     # check + test + build: the gate CI runs
```

`npm run dev` serves the frontend only; `api/*.js` runs on Vercel (or under
`vercel dev`). The offline suites run the real handlers in-process against a
scripted database and need no network or credentials. The SQL itself is tested
against a disposable PostgreSQL by `npm run test:integration`; see
[`docs/database-testing.md`](docs/database-testing.md). Never point a test at
the production database.

## Deployment

A push to `main` deploys to Vercel. Environment variables are listed in
[`.env.example`](.env.example) and explained in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), together with migrations, scheduled
jobs, monitoring and rollback.

## Security, in short

- Council members sign in with a JWT in an `HttpOnly` cookie; every change
  also needs a double-submit CSRF token (a readable `csrf-token` cookie echoed
  as `X-CSRF-Token`). Passwords are bcrypt hashes, and temporary passwords
  expire after seven days.
- Every handler checks the role itself; route guards in the browser are a
  convenience only.
- SQL is always parameterized, input is sanitized server-side, and uploads are
  checked by type, extension and size (10 MB) and must land in our own
  Cloudinary account.
- Public forms are rate-limited and protected by Cloudflare Turnstile; logs and
  error reports are redacted of addresses, phone numbers and tokens.

See `AGENTS.md` and [`docs/architecture.md`](docs/architecture.md) for the
details.
