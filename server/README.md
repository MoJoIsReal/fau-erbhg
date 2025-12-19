# Server Directory

## Purpose

This directory contains the **local development server** for the FAU Erdal Barnehage application.

## Important Note

**⚠️ This code is NOT used in production on Vercel.**

When deployed to Vercel:
- The application uses **serverless functions** in `/api/` directory
- The `/server/` directory code is only for local development with `npm run dev`

## Contents

### Core Files
- **`index.ts`** - Express server entry point for local development
- **`routes.ts`** - Route definitions that mirror `/api` endpoints
- **`vite.ts`** - Vite integration for serving the client in development

### Services
- **`auth.ts`** - Authentication utilities (JWT, password hashing)
- **`email.ts`** - Email sending service (nodemailer with Gmail)
- **`cloudinary.ts`** - Image upload service integration
- **`scheduler.ts`** - Background job scheduler (event reminders)

### Database
- **`db.ts`** - Drizzle ORM database connection
- **`storage.ts`** - Storage interface definition
- **`database-storage.ts`** - Database storage implementation
- **`init-database.ts`** - Database initialization script
- **`init-admin.ts`** - Admin user setup script

### Security
- **`security.ts`** - Security middleware (rate limiting, CSP headers, input sanitization)

## Development vs Production

| Feature | Development (`/server`) | Production (`/api`) |
|---------|------------------------|---------------------|
| Runtime | Express on Node.js | Vercel Serverless Functions |
| Scheduler | ✅ Runs automatically | ❌ Not available* |
| Hot Reload | ✅ Yes | N/A |
| Environment | `npm run dev` | Vercel deployment |

*Note: Event reminders in production would need a separate cron job or scheduled function.

## Running Locally

```bash
# Start development server
npm run dev

# Server runs on http://localhost:5000
# Client served via Vite on same port
```

## Shared Code

Both `/server` and `/api` use:
- `/shared/schema.ts` - Database schemas and types
- `/shared/constants.ts` - Shared constants (emails, addresses, etc.)
- `/shared/env.ts` - Environment variable types

## Maintenance

When adding new features:
1. Add serverless function in `/api/` for production
2. Update `/server/routes.ts` to mirror the endpoint for local development
3. Keep business logic in shared utilities when possible
