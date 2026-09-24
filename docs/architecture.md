# Architecture

Current implementation reference. Operational and release checks are maintained
in [DEPLOYMENT.md](./DEPLOYMENT.md); database verification is described in
[database-testing.md](./database-testing.md).

The bilingual React 19 SPA uses Wouter, TanStack Query and React Hook Form/Zod.
It calls eight top-level Vercel handlers plus one scheduled handler. Handlers
perform authentication, validation, parameterized Neon SQL and response mapping
directly. There is no second backend, ORM query layer or generic repository tier.

## Boundaries

| Boundary | Contract |
|---|---|
| Browser | UI validation and route guards are convenience only; all input is untrusted. TanStack Query owns server state. Failed reads expose retry and distinguish stale data from a successful empty result. |
| `client/src/lib/queryClient.ts` | Sends credentials/CSRF, handles API errors, and clears the shared auth cache on unauthorized responses. The first query-key item is the requested URL. |
| `api/*.js` | `withApiHandler` supplies security headers/CORS/error handling. Handlers enforce roles and CSRF for session-authorized mutations. Capability actions use their own scoped token checks. |
| `api/_shared/` | Backend-only authentication, sanitization, database/provider adapters, delivery, rate limits and redacted telemetry. |
| `shared/` | Runtime modules are JS with `.d.ts` siblings. `schema.ts` supplies frontend types/Zod/Drizzle declarations and is never imported by unbundled API code. |
| PostgreSQL | Persists records, row locks, case-insensitive signup uniqueness, normalized photo reservations, foreign keys and durable delivery state. SQL migrations supplement the schema declaration. |
| Cloudinary | Direct signed upload, owned URL verification, public delivery and provider-first document deletion. |
| Gmail | Confirmation/contact mail and scheduled newsletter/reminder delivery. Provider acceptance and database recording are separate operations. Mail an anonymous request triggers is capped at `PUBLIC_MAIL_DAILY_LIMIT` per day across all callers (`sendPublicMail` in `api/_shared/rate-limit.js`), leaving the account's quota for scheduled mail; a signup confirmation never echoes the free-text comment. |
| Sentry/Analytics | Redacted error/page telemetry; capability URLs are scrubbed and frontend replay is disabled. |

## Routing and roles

Several resources share a function to stay within the deployment's function
budget. `auth?action=…` handles login/session/password operations;
`documents?action=download` handles downloads; `registrations?action=cancel…`
handles cancellation; `contact?action=newsletter-…` handles subscriptions.
`secure-settings?resource=…` multiplexes content, contact messages and settings.
`staff-users` is an alias in its user-management branch, not a staff self-service
endpoint. Authorization remains enforced by the handler.

Admins manage users, settings, board information and subscribers. Members also
manage events, registrations, documents, blog posts, calendar and contact
messages. Staff may edit yearly-calendar entries only. JWTs use an HttpOnly
cookie (Bearer fallback), token-version revocation and a password-change policy;
non-GET session mutations also require a double-submit CSRF token.

Login is limited per (IP, account), per IP, and per account across IPs. The
account-wide limit counts only failed passwords and is checked without being
bumped, so a guesser rotating IPs is stopped after 20 failures an hour. A
browser that has signed in to the account before carries an HttpOnly
`login-device` cookie (a signed token for `/api/auth`, 180 days, its own
audience so it can never pass as a session) that gets it past that account
lock, under its own attempt limit — so knowing a username is not enough to lock
a council member out of their own devices.

## Persistence and background work

The database's snake_case rows are mapped to camelCase API contracts by a single
resource mapper. Signup uses an atomic locking CTE; a normalized unique photo
slot table rejects racing reservations and the handler retries allocation.
Cancellation deletes, records history and releases capacity in one statement.

`newsletter_deliveries` is the existing durable per-item/per-subscriber outbox.
Workers claim rows with `FOR UPDATE SKIP LOCKED`, recover expired leases and
record success only after the provider accepts mail. Registration reminders keep
claim/attempt/sent fields on the registration row. These are PostgreSQL-backed
workers, not an external queue. Delivery remains at least once across the SMTP/
database boundary. There is no Cloudinary deletion outbox: the handler retains
the document row if provider deletion fails.

Morning housekeeping runs independently of mail configuration/failure. See
[subsystems.md](./subsystems.md) for deadlines, retries, retention and calendar
feed UID/source-stamping invariants. CI's isolated PostgreSQL suite executes
production statements to test database concurrency and cascades; it does not
establish production schema state or external provider availability.

Keep changes within the matching handler/helper. Any future extraction should
solve a measured problem with contract coverage, rather than introduce another
backend or duplicate SQL implementation.

## Rich-text form boundary

`RichTextEditor` applies field IDs, accessible names and validation attributes
to the editable textbox, and exposes a focus handle to React Hook Form. Visible
labels use `aria-labelledby`. Its token-based 3px focus ring is inset so the
editor's clipped container cannot hide it; this is a deliberate exception to
the style guide's usual outside focus-ring placement.
