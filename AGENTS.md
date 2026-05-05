# AGENTS.md — FAU Erdal Barnehage

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
│   └── _shared/         # Shared serverless utilities (auth, DB, Cloudinary)
├── shared/              # Shared code (client + server)
│   ├── schema.ts        # Drizzle ORM schema + Zod types (source of truth)
│   ├── env.ts           # Environment variable validation (Zod)
│   └── types.ts         # Shared TypeScript types
├── migrations/          # Drizzle-generated SQL migrations
├── docs/                # Deployment and operations guides
└── attached_assets/     # Static image assets
```

### Backend Architecture

The backend runs exclusively as Vercel serverless functions in `api/*.js` with
shared helpers in `api/_shared/`. Do not add or maintain a second backend mirror.
When adding or modifying API endpoints, update the relevant Vercel function and
any shared serverless utility it uses.

## Technology Stack

- **Frontend:** React 18, TypeScript, Wouter (routing), TanStack Query v5, Tailwind CSS, shadcn/ui, Framer Motion, Recharts
- **Backend:** Vercel serverless functions, Drizzle ORM, Neon PostgreSQL
- **Auth:** JWT tokens, bcryptjs, role-based (admin/member)
- **Storage:** Cloudinary (files/images)
- **Email:** Nodemailer (Gmail) or SendGrid
- **Monitoring:** Sentry (frontend + backend), Vercel Analytics

## Development Commands

```bash
npm run dev        # Start Vite frontend dev server
npm run build      # Build frontend for Vercel
npm start          # Preview the built frontend locally
npm run check      # TypeScript type checking (run before committing)
npm run db:push    # Apply schema changes to database
```

Development runs at `http://localhost:5000`. Production API routes run through Vercel serverless functions in `api/`.

## Key Conventions

### TypeScript Path Aliases

```typescript
import { Foo } from '@/components/Foo'       // → client/src/components/Foo
import { Bar } from '@shared/schema'          // → shared/schema
```

### Data Fetching (Frontend)

Use TanStack Query for all server state. The `apiRequest()` utility in `lib/queryClient.ts` handles CSRF tokens and credentials automatically.

```typescript
// Preferred pattern
const { data } = useQuery({ queryKey: ['/api/events'], queryFn: () => apiRequest('/api/events') });

// Mutations
const mutation = useMutation({ mutationFn: (data) => apiRequest('/api/events', { method: 'POST', body: data }) });
```

Query stale time is 5 minutes. Invalidate relevant query keys after mutations.

### Internationalization

All user-facing strings must support both Norwegian (default) and English. Add translations to `client/src/lib/i18n.ts` — never hard-code Norwegian-only strings in JSX.

```typescript
const { t } = useLanguage();
return <h1>{t('events.title')}</h1>;
```

### Forms

Use React Hook Form + Zod for all forms:

```typescript
const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
```

### Database Schema

`shared/schema.ts` is the single source of truth for all types. Drizzle generates TypeScript types from the schema — use `InferSelectModel<typeof table>` and `InferInsertModel<typeof table>`.

**Important:** Dates are stored as `text` fields (not SQL `timestamp`) to avoid timezone issues. Format consistently as ISO strings or locale-appropriate display strings.

### Authentication

- JWT in `Authorization: Bearer <token>` header
- Admin role: full CRUD access
- Member role: read-only on most resources
- Rate limited: 5 login attempts per 15 minutes

Protect routes with the auth helpers in `api/_shared/middleware.js`.

### Security Rules

- Never build raw SQL strings — always use Drizzle's query builder
- Sanitize user input through `sanitizeText()`, `sanitizeHtml()`, `sanitizeNumber()` helpers
- File uploads: validate MIME type and extension, enforce 5 MB limit
- CORS: only whitelist approved origins — do not use `*` in production
- Never log sensitive data (passwords, tokens, full email addresses)

### File Uploads

Files go through the Vercel upload function → Cloudinary. Never write files to disk in serverless functions.

### Error Handling

Throw structured errors with HTTP status codes on the server. On the client, display errors via the `useToast()` hook — never use `alert()`.

## Environment Variables

Required at runtime (validated by `shared/env.ts` using Zod):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `SESSION_SECRET` | JWT secret (min 32 characters) |
| `ADMIN_SETUP_KEY` | One-time admin initialization key |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

Optional:

| Variable | Description |
|---|---|
| `GMAIL_APP_PASSWORD` | Gmail app password for email |
| `SENDGRID_API_KEY` | SendGrid alternative |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN |
| `SENTRY_DSN` | Backend Sentry DSN |
| `PORT` | Dev server port (default: 5000) |

## Database

Schema changes workflow:
1. Edit `shared/schema.ts`
2. Run `npm run db:push` to apply changes to the database
3. Commit the updated `migrations/` directory

Tables: `users`, `events`, `event_registrations`, `contact_messages`, `documents`, `site_settings`, `fau_board_members`.

## Testing

There is currently no test suite. When adding complex business logic, manually verify via the dev server. This is a known gap.

## Deployment

Production deploys automatically to Vercel on push to `main`. See `docs/DEPLOYMENT.md` for the full guide including environment variable setup, database provisioning, and rollback procedures.

The `vercel.json` file maps all non-asset routes to the serverless functions in `api/`.

## Component Library

UI primitives live in `client/src/components/ui/` and are managed by shadcn/ui. Do not hand-edit these files — use the shadcn CLI to add or update components. Feature components live in `client/src/components/`.
