# CLAUDE.md — FAU Erdal Barnehage

This file provides guidance for AI assistants working on this codebase.

## Project Overview

FAU Erdal Barnehage is a bilingual (Norwegian/English) web application for a Norwegian kindergarten parent association (FAU). It handles event management, document storage, contact forms, and an admin dashboard for council members.

## Architecture

### Monorepo Structure

```
/
├── client/src/          # React frontend (Vite)
│   ├── components/      # Feature and UI components
│   │   └── ui/          # shadcn/ui primitives (do not hand-edit)
│   ├── contexts/        # React context providers
│   ├── hooks/           # Custom hooks
│   ├── lib/             # Utilities (API client, i18n, queryClient)
│   ├── pages/           # Route-level page components
│   └── main.tsx         # App entry point
├── api/                 # Vercel serverless functions (only backend runtime)
│   ├── *.js             # API route handlers
│   ├── cron/            # Scheduled functions (Vercel Cron)
│   └── _shared/         # Shared serverless utilities (auth, DB, Cloudinary)
├── shared/              # Shared code (client + server)
│   ├── schema.ts        # Drizzle ORM schema + Zod types (source of truth)
│   ├── constants.js     # Cross-tier constants
│   └── photo-slots.ts   # Photo-event slot assignment (client mirror)
├── migrations/          # SQL migrations applied via the Neon SQL editor
├── docs/                # Deployment and operations guides
└── attached_assets/     # Static image assets
```

### Backend Architecture

The backend runs exclusively as Vercel serverless functions in `api/*.js` with
shared helpers in `api/_shared/`. Do not add or maintain a second backend mirror.
When adding or modifying API endpoints, update the relevant Vercel function and
any shared serverless utility it uses.

Database queries use the Neon serverless SQL tagged-template client (`api/_shared/database.js`),
not Drizzle at runtime. Drizzle is used only for schema declaration and type generation.

## Technology Stack

- **Frontend:** React 18, TypeScript, Wouter (routing), TanStack Query v5, Tailwind CSS, shadcn/ui, Recharts, TipTap (rich text), DOMPurify (client-side HTML sanitization)
- **Backend:** Vercel serverless functions, Neon PostgreSQL via `@neondatabase/serverless`
- **Schema/migrations:** Drizzle ORM + drizzle-kit (build-time only)
- **Auth:** JWT in HttpOnly cookies + CSRF double-submit, bcryptjs, role-based (admin/member/staff)
- **Storage:** Cloudinary (files/images), signed upload flow
- **Email:** Nodemailer over Gmail (SendGrid SDK is declared but not currently used)
- **Monitoring:** Sentry (frontend uses `@sentry/react`; backend uses a hand-rolled envelope sender in `api/_shared/sentry.js`), Vercel Analytics

## Development Commands

```bash
npm run dev        # Start Vite frontend dev server
npm run build      # Build frontend for Vercel
npm start          # Preview the built frontend locally
npm run check      # TypeScript type checking (run before committing)
npm run db:push    # Apply schema changes to database via drizzle-kit
npm run test       # Run smoke tests (scripts/smoke-tests.mjs)
```

Development runs at `http://localhost:5000`. There is no local backend process —
API routes in `api/` only execute when deployed to Vercel (or via `vercel dev`).

## Key Conventions

### TypeScript Path Aliases

```typescript
import { Foo } from '@/components/Foo'       // → client/src/components/Foo
import { Bar } from '@shared/schema'          // → shared/schema
```

### Data Fetching (Frontend)

Use TanStack Query for all server state. The `apiRequest()` utility in `lib/queryClient.ts`
attaches the CSRF token from the `csrf-token` cookie on non-GET requests and always sets
`credentials: 'include'`. It returns a `Response` — call `.json()` for the parsed body.

```typescript
// Signature: apiRequest(method, url, data?) => Promise<Response>

// Queries: rely on the default queryFn (handles GET, credentials, on401-throw).
const { data } = useQuery<Event[]>({ queryKey: ['/api/events'] });

// Mutations: method first, then URL, then data.
const mutation = useMutation({
  mutationFn: (data: NewEvent) => apiRequest('POST', '/api/events', data).then(r => r.json()),
});
```

Query stale time is 5 minutes. Invalidate relevant query keys after mutations.

### Internationalization

All user-facing strings must support both Norwegian (default) and English. Add translations to `client/src/lib/i18n.ts` — never hard-code Norwegian-only strings in JSX.

```typescript
const { t } = useLanguage();
return <h1>{t.events.title}</h1>;
```

### Forms

Use React Hook Form + Zod for all forms:

```typescript
const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
```

### Database Schema

`shared/schema.ts` is the single source of truth for all types. Drizzle generates TypeScript types from the schema — use `typeof table.$inferSelect` for select rows and `createInsertSchema(table)` (already exported per table) for insert validation.

**Important:** Most date columns are stored as `text` (ISO strings) to avoid timezone issues. The `api_rate_limits` table is the exception and uses `timestamptz`. Format consistently as ISO strings or locale-appropriate display strings.

### Authentication

- JWT lives in an HttpOnly cookie named `jwt`; an `Authorization: Bearer …` header is accepted as a fallback for backward compatibility (`api/_shared/middleware.js:parseAuthToken`).
- CSRF protection: double-submit cookie. The `csrf-token` cookie is non-HttpOnly so the client can mirror it into the `X-CSRF-Token` header on writes. `requireCsrf()` enforces this on every state-changing endpoint.
- Roles:
  - `admin` — full CRUD on all resources (settings, blog, board members, staff users, contact messages, etc.).
  - `member` — write access to events, event registrations (delete), document uploads, and yearly calendar entries. Not allowed on `secure-settings` (admin-only).
  - `staff` — kindergarten staff with write access limited to yearly calendar entries.
- Login rate limits: per-(IP, username) 5/15min, per-IP 30/15min, per-account 20/60min. The dummy bcrypt hash in `api/login.js` keeps timing constant for non-existent users.

Protect routes with the auth helpers in `api/_shared/middleware.js`
(`parseAuthToken`, `requireAuth`, `requireCsrf`).

### Security Rules

- Always use parameterized queries — Neon tagged templates (`` sql`…${value}…` ``) interpolate safely. Never concatenate user input into a query string.
- Sanitize user input through `sanitizeText()`, `sanitizeHtml()`, `sanitizeEmail()`, `sanitizePhone()`, `sanitizeNumber()` helpers in `api/_shared/middleware.js`. The HTML sanitizer uses `sanitize-html`; the client adds a second layer with DOMPurify via `client/src/components/safe-html.tsx`.
- File uploads: validate MIME type and extension, enforce the size limit defined in `api/_shared/upload-validation.js` (`MAX_UPLOAD_SIZE_BYTES`, currently 10 MB). The Cloudinary URL returned by the client must point to our own `cloud_name` and into the `fau-documents/` folder.
- CORS: only whitelist approved origins (`api/_shared/middleware.js:applySecurityHeaders`) — do not use `*` in production.
- Never log sensitive data. Use `safeErrorForLog` / `redactSensitiveText` in `middleware.js` and `sentry.js` to scrub emails and phone numbers before logging.

### File Uploads

Files go through the Vercel upload function → Cloudinary using a signed upload flow:
1. Client posts metadata to `POST /api/upload?action=sign` and gets back a signature.
2. Client uploads directly to Cloudinary.
3. Client posts the resulting URL and `public_id` to `POST /api/upload`, which validates the URL belongs to our cloud and saves the document record.

Never write files to disk in serverless functions.

### Error Handling

Throw structured errors with HTTP status codes on the server. The shared `handleError` helper writes the response, redacts PII from logs, and forwards 5xx to Sentry in production. On the client, display errors via the `useToast()` hook — never use `alert()`.

## Environment Variables

Required at runtime (provided via Vercel project env; the serverless functions
read `process.env` directly):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | JWT secret (min 32 characters) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

Optional:

| Variable | Description |
|---|---|
| `GMAIL_USER` | Gmail address used as sender for outbound mail |
| `GMAIL_APP_PASSWORD` | Gmail app password for email |
| `SENDGRID_API_KEY` | SendGrid alternative (not currently wired up in code) |
| `CRON_SECRET` | Bearer token Vercel Cron must send to `/api/cron/*`. Required in production. |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN |
| `SENTRY_DSN` | Backend Sentry DSN |
| `PORT` | Dev server port (default: 5000) |

## Database

Schema changes workflow:
1. Edit `shared/schema.ts`.
2. Run `npm run db:push` to push changes via drizzle-kit.
3. For any data-shape changes that need to be applied to existing rows, add a SQL file under `migrations/` and apply it through the Neon SQL editor (see `migrations/README.md`).

Tables: `users`, `events`, `event_registrations`, `contact_messages`, `documents`, `site_settings`, `fau_board_members`, `api_rate_limits`, `email_domain_blacklist`, `yearly_calendar_entries`, `blog_posts`, `kindergarten_info`.

> **Note:** `blog_posts` and `kindergarten_info` are referenced by `api/secure-settings.js` but
> are not yet declared in `shared/schema.ts`. Add them there when next touching the schema.

## Testing

There is currently no real test suite — only `scripts/smoke-tests.mjs` which is invoked by `npm test`. When adding complex business logic, manually verify via the dev server. This is a known gap.

## Deployment

Production deploys automatically to Vercel on push to `main`. See `docs/DEPLOYMENT.md` for the full guide including environment variable setup, database provisioning, and rollback procedures.

The `vercel.json` file maps all non-asset routes to the serverless functions in `api/` and configures a daily cron at 07:00 UTC for event reminders + GDPR retention cleanup.

**Serverless-function budget:** the Vercel Hobby plan caps the project at 12
serverless functions. We are at the cap (11 routes in `api/*.js` + 1 cron in
`api/cron/`). Adding a new endpoint means combining it into an existing
function via a query-param-routed handler (as `secure-settings.js` does),
moving to the Vercel Pro plan, or removing an existing function. There is no
dedicated `/api/health` for this reason — uptime monitors should hit
`GET /api/events` (DB-backed, public).

## Component Library

UI primitives live in `client/src/components/ui/` and are managed by shadcn/ui. Do not hand-edit these files — use the shadcn CLI to add or update components. Feature components live in `client/src/components/`.
