# 01 — Inventory (recon)

Snapshot: branch `claude/zen-lovelace-2g1nmu` @ `c5cdecd`, reviewed 2026-09-24.

## Stack
| Layer | What exists | Evidence |
|---|---|---|
| Runtime | Node 22.x (`engines`), ESM (`"type": "module"`) | `package.json` |
| Frontend | React 19.3 SPA, Wouter routing, TanStack Query 5, React Hook Form + zod 4, Tailwind 4, shadcn/Radix, TipTap 3 editor, DOMPurify, @react-pdf/renderer, read/write-excel-file | `package.json`, `client/src/App.tsx` |
| Build | Vite 8 → `dist/public`; TypeScript 7 (`tsc` + `tsconfig.api.json` checkJs pass over `api/` and `shared/`) | `vite.config.ts`, `scripts/check-backend-types.mjs` |
| Backend | 8 Vercel serverless handlers + 1 cron handler, plain `.js`, unbundled | `api/*.js`, `api/cron/event-reminders.js` |
| DB | Neon PostgreSQL via `@neondatabase/serverless` HTTP tagged template (`neon(DATABASE_URL)`), one cached client per instance, no transactions beyond single statements | `api/_shared/database.js` |
| Schema | Drizzle `shared/schema.ts` (types + drizzle-zod only, no CHECKs) + 16 hand-applied SQL migrations (Neon SQL editor) | `shared/schema.ts`, `migrations/*.sql`, `migrations/README.md` |
| API style | JSON REST-ish, query-param multiplexing (`?action=`, `?resource=`) to stay under the Hobby 12-function cap | `AGENTS.md`, handlers |
| Auth | bcryptjs password hashes; HS256 JWT (iss/aud/2h) in HttpOnly `jwt` cookie (Bearer fallback); `token_version` revocation checked on every request; double-submit `csrf-token` cookie + `X-CSRF-Token`; roles admin/member/staff | `api/_shared/middleware.js`, `api/_shared/jwt-config.js`, `shared/constants.js` |
| Capability tokens | 64-hex registration `cancel_token` (DB default), newsletter `confirm_token` / `unsubscribe_token` | `api/_shared/registration-cancel.js`, `api/_shared/newsletter.js`, migrations 0003/0015 |
| Rate limiting | Postgres `api_rate_limits` fixed-window counters keyed by sha256(scope, IP, id); IP from `x-real-ip` | `api/_shared/rate-limit.js` |
| Background work | Vercel Cron: 07:00 UTC (retention, counter reconcile, cleanup, registration reminders) and 19:00 UTC (`?task=newsletter` outbox) guarded by `CRON_SECRET` bearer | `vercel.json`, `api/cron/event-reminders.js` |
| Queue | PostgreSQL outbox `newsletter_deliveries` (claim `FOR UPDATE SKIP LOCKED`, 10-min lease, `attempts`, `next_attempt_at`); reminder claim columns on `event_registrations` | migration 0008, cron |
| Integrations | Gmail SMTP via nodemailer (unpooled for requests, pooled with socket deadline for cron); Cloudinary signed direct upload + Admin API verify/destroy; Sentry (hand-rolled envelope POST on backend, `@sentry/react` on frontend); Vercel Analytics | `api/_shared/email.js`, `api/upload.js`, `api/_shared/sentry.js` |
| Logging | One-line JSON `logEvent` with redaction + 200-char cap; request id = `x-vercel-id`; mutation audit line per successful non-GET | `api/_shared/log.js`, `withApiHandler` |
| Config/secrets | Env only: `DATABASE_URL, SESSION_SECRET (≥32, non-placeholder), CRON_SECRET, GMAIL_USER, GMAIL_APP_PASSWORD, CLOUDINARY_*, SENTRY_DSN, VITE_SENTRY_DSN, PUBLIC_BASE_URL, NODE_ENV` | `.env.example` |
| Edge config | Rewrites (`/kalender.ics` → events feed; SPA fallback), global security headers + CSP (hash-pinned inline script, YouTube nocookie frames only), `/api/*` no-store | `vercel.json` |
| CI | GitHub Actions: `verify` (npm ci, `npm run check`, `npm test`, `npm run build`) and `postgres-integration` (postgres:17 service, `npm run test:integration`); `permissions: contents: read` | `.github/workflows/ci.yml` |
| Deploy | Vercel Git integration, auto-deploy on push to `main` | `AGENTS.md`, `docs/DEPLOYMENT.md` |
| Lint/format | None by design | `AGENTS.md` |

## Source size (from `git ls-files`, excluding `components/ui`, `attached_assets`, lockfile)
- 344 tracked files total; ~32.7k lines of `.js/.mjs/.ts/.tsx/.sql` (see `wc -l` in session log).
- Backend: `api/*.js` 8 handlers (~3.2k lines) + `api/_shared` 18 files (~1.9k) + cron 702 lines.
- Shared: 18 files in `shared/` (JS + `.d.ts` pairs, `schema.ts`).
- Client: 163 files under `client/src` (largest: `lib/i18n.ts` 2.7k, `pages/settings.tsx` 747).
- Tests: 39 offline `tests/*.test.mjs` suites + helpers; 1 integration suite + fixture.

## Route table (backend)
| Function | Methods / multiplex | Auth |
|---|---|---|
| `api/auth.js` | GET `?action=csrf`, GET (default/`me`); POST `login`, `logout`, `change-password` | public / session |
| `api/events.js` | GET list, GET `?format=ics` (also `/kalender.ics`); POST/PUT/PATCH `cancel`/DELETE | public read; COUNCIL + CSRF writes |
| `api/registrations.js` | GET `?eventId` (aggregate public, PII for council), GET `?cancelled=1`; POST signup; DELETE; POST `?action=cancel-lookup|cancel` | public signup (rate-limited); council; capability token |
| `api/documents.js` | GET list, GET `?action=download`; DELETE | public read; COUNCIL + CSRF delete |
| `api/upload.js` | POST `?action=sign`, POST register | COUNCIL + CSRF |
| `api/contact.js` | POST contact; POST `?action=newsletter-subscribe|confirm|unsubscribe` | public (honeypot + rate limit); capability token |
| `api/secure-settings.js` | `?resource=board-members|blog-posts|kindergarten-info` (public GET, ADMIN/COUNCIL writes), `contact-messages` (COUNCIL), `users|staff-users` and `newsletter-subscribers` (ADMIN) | mixed |
| `api/yearly-calendar.js` | GET `?schoolYear` public; POST (create, `preview-import`, `commit-import`), PUT, DELETE | YEARLY_CALENDAR_EDITORS (admin/member/staff) + CSRF |
| `api/cron/event-reminders.js` | GET (morning) / GET `?task=newsletter` | `Authorization: Bearer CRON_SECRET` |

## DB objects
Tables: `users`, `events`, `event_registrations`, `event_registration_cancellations`, `photo_event_slots`, `api_rate_limits`, `contact_messages`, `newsletter_subscribers`, `newsletter_deliveries`, `documents`, `site_settings` (declared, unused by API), `blog_posts`, `kindergarten_info`, `email_domain_blacklist`, `fau_board_members`, `yearly_calendar_entries`.
No views, procedures or triggers. Side effects live in FKs: `event_registrations → events ON DELETE RESTRICT`; `photo_event_slots`, `event_registration_cancellations → events ON DELETE CASCADE`; `photo_event_slots → event_registrations CASCADE`; `newsletter_deliveries → newsletter_subscribers CASCADE`.
CHECK constraints exist **only in migrations** (0008 status/item_type/attempts, 0009 slot format, 0010 item_type widen, 0013/0014 category); `shared/schema.ts` declares none.

## Unused / notable
- `site_settings` table declared in schema; no handler references it (grep `site_settings` → schema only).
- `scripts/clear-yearly-calendar-colors.sql` is a one-off maintenance script.
