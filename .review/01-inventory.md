# 01 — Inventory (FAU Erdal Barnehage, commit 041e0cf)

## Stack
- Frontend: React 19.3 SPA, Wouter routing, TanStack Query v5, React Hook Form + zod 4, Tailwind 4, shadcn/Radix, TipTap 3 rich text, @react-pdf/renderer, read/write-excel-file. Vite 8 build → `dist/public`. Second entry `client/del.html` + `client/src/share/` (private media share page, no third-party code).
- Backend: 9 Vercel serverless functions `api/*.js` (auth, contact, documents, events, media, registrations, secure-settings, upload, yearly-calendar) + 1 cron `api/cron/event-reminders.js`. Node 22, ESM, unbundled JS. No local server.
- DB: Neon PostgreSQL via `@neondatabase/serverless` tagged templates (`api/_shared/database.js` `getDb()`); Drizzle used only for `shared/schema.ts` declarations + drizzle-zod insert schemas. 18 tables in schema.ts; 20 hand-applied migrations `migrations/0001…0020`.
- Auth: JWT (HS256, `jsonwebtoken`) in HttpOnly `jwt` cookie (Bearer fallback), token_version revocation, double-submit `csrf-token` cookie, login-device cookie, bcryptjs, password policy/expiry. Roles: admin / member / staff (`shared/constants.js`).
- Integrations: Cloudinary (signed direct upload, documents/images), Gmail SMTP via nodemailer (confirmation, contact, newsletter, reminders), Cloudflare R2 S3 API (private media shares, presigned multipart), Cloudflare Turnstile (public forms), Sentry (frontend SDK; backend home-rolled envelope sender `api/_shared/sentry.js`), Vercel Analytics, YouTube-nocookie embeds.
- Background: Vercel Cron 07:00 UTC morning tasks (reminders, retention, rate-limit cleanup, attendee reconcile, media purge) and 19:00 UTC newsletter broadcast; PostgreSQL outbox `newsletter_deliveries` with SKIP LOCKED leases; reminder claim fields on `event_registrations`.
- Rate limiting: DB table `api_rate_limits` (timestamptz) via `api/_shared/rate-limit.js`; global public-mail daily cap 200.
- Logging: `api/_shared/log.js` structured JSON logs, request ids, actor; redaction `redact.js`.
- Config/secrets: env vars documented in `.env.example` (DATABASE_URL, SESSION_SECRET, CRON_SECRET, GMAIL_*, CLOUDINARY_*, R2_*, SENTRY_DSN, VITE_SENTRY_DSN, TURNSTILE_*, PUBLIC_BASE_URL, NODE_ENV). No secrets committed (.env ignored).
- Deploy: Vercel auto-deploy on push to main; `vercel.json` holds rewrites (SPA, /kalender.ics, link-preview bot UA rewrite, /del), CSP and headers, crons, maxDuration 30s.
- CI: `.github/workflows/ci.yml` — verify job (npm ci, check, test, build) + postgres-integration job (postgres:17 service, `tests/integration/database.test.mjs`). permissions: contents: read. Actions pinned by major tag (@v7), not SHA.
- Tests: 46 `tests/*.test.mjs` suites (node:test) + `tests/integration/database.test.mjs`; handler harness `tests/helpers.mjs` (importHandler/scriptedSql/call). Static guards: backend-invariants, client-invariants, deploy-config, api-authorization matrix.
- Tooling: `tsc` (TypeScript 7), `scripts/check-backend-types.mjs`, `scripts/check-i18n.mjs` ratchet (BUDGET 31). No linter by design.

## Size (non-generated, excluding components/ui)
212 JS/TS/TSX/MJS/SQL files, ~41.5k lines. Largest: `client/src/lib/i18n.ts` 3191, `api/secure-settings.js` 804, `api/cron/event-reminders.js` 803, `api/registrations.js` 767, `api/_shared/middleware.js` 645.

## Entry points / routes
- SPA routes (`client/src/App.tsx:110-173`): /, /kalender(/arskalender|/arrangementer|/arshjul), /events, /calendar, /news|/nyheter(/:id), /tips-*, /contact, /files, /personvern|/privacy, /admin, /admin/media, /settings, /content, /messages, /arskalender, /nyhetsbrev|/newsletter, /avmelding.
- API:
  - `auth.js` GET csrf|me; POST login|logout|change-password
  - `contact.js` POST contact; action newsletter-subscribe|confirm|unsubscribe
  - `documents.js` GET list | action=download; DELETE (council)
  - `events.js` GET list|id|format=ics|format=preview; POST/PUT/PATCH(cancel)/DELETE (council)
  - `media.js` view (public capability) ; list|link (GET) create|upload-init|parts|complete|abort|publish|extend (POST) DELETE (MEDIA_SHARE_ROLES)
  - `registrations.js` GET ?eventId (public count / &food=1 dishes / council full), cancel-lookup|cancel|update-food (capability token), POST signup (public, Turnstile), DELETE (council)
  - `secure-settings.js` resource=board-members|blog-posts|kindergarten-info (public GET, writes admin or council) contact-messages (council) users|newsletter-subscribers (admin)
  - `upload.js` POST action=sign + POST record (council)
  - `yearly-calendar.js` GET public; POST/PUT/DELETE + preview-import|commit-import (YEARLY_CALENDAR_EDITORS incl. staff)
  - `cron/event-reminders.js` GET (CRON_SECRET bearer), task=newsletter
- Rewrites: /kalender.ics → events?format=ics; bot UA /kalender?vis= → events?format=preview.

## DB objects (shared/schema.ts)
users, events, event_registrations, event_registration_cancellations, photo_event_slots, api_rate_limits, contact_messages, newsletter_subscribers, newsletter_deliveries, documents, site_settings, blog_posts, kindergarten_info, email_domain_blacklist, fau_board_members, yearly_calendar_entries, media_shares, media_files. Constraints/indexes/checks partly only in migrations (e.g. delivery status CHECK 0008/0017).

## Docs
AGENTS.md/CLAUDE.md, README.md, docs/{architecture,subsystems,DEPLOYMENT,database-testing,mediedeling,README}.md, docs/design/style-guide.md (+PDF). Note: docs/architecture.md says "eight top-level handlers"; there are nine (media.js).
