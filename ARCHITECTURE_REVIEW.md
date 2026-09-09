# Architecture Review

## System context

FAU Erdal Barnehage is a bilingual React single-page application deployed with
Vercel serverless functions. It has no separate application-service or
repository tier: route handlers authenticate, validate, execute Neon tagged
SQL, map results, and initiate Cloudinary/Gmail work directly.

```text
Browser
  React 19 + Wouter + TanStack Query + React Hook Form/Zod
      | HTTPS/JSON, JWT cookie, double-submit CSRF header
      v
Vercel edge/routing and eight api/*.js handlers
      | requireRole / sanitizers / direct tagged SQL
      +------------------------+-----------------------+
      v                        v                       v
Neon PostgreSQL          Cloudinary upload       Gmail SMTP
      ^                        ^                       ^
      |                        |                       |
daily Vercel cron -------------+-----------------------+
```

## Boundaries and responsibilities

| Boundary | Responsibility | Trust considerations |
|---|---|---|
| Browser | Rendering, navigation, form schemas, optimistic state, direct signed Cloudinary upload | All browser values remain untrusted. UI route guards are convenience only. |
| `client/src/lib/queryClient.ts` | Credentialed HTTP, CSRF header, structured client errors | Query keys are executable URL contracts; only the first key item is fetched. |
| `api/*.js` | HTTP dispatch, role checks, validation, business workflow, response mapping | Primary authorization and validation boundary. Large handlers currently mix too many concerns. |
| `api/_shared` | JWT/CSRF/RBAC, sanitization, DB/mail/storage adapters, rate limiting and telemetry | Security-sensitive shared kernel; should receive the strongest unit/contract coverage. |
| Neon | Persistence, uniqueness, atomic CTEs and rate-limit state | Several invariants remain application-only; production constraints and privileges were unavailable. |
| Cloudinary/Gmail/Sentry | Public assets, outbound mail and error telemetry | External availability, metadata and retention are outside this repository. |

## Domain map

* **Identity:** `users`, JWT cookie, token-version revocation and password-age policy.
* **Events:** `events`, `event_registrations`, public signup, capacity and photo slots.
* **Content:** blog posts, board members and kindergarten information, multiplexed by `secure-settings`.
* **Communications:** contact messages/replies, newsletter subscribers and scheduled reminders.
* **Documents:** signed direct upload, provider verification, metadata and public downloads.
* **Yearly calendar:** entries, Excel import/export, drag/drop, PDF generation and newsletter flags.

## Dependency assessment

The frontend-to-API boundary and shared schema/constants are clear, SQL uses the
Neon tagged-template API, and deployment has one backend implementation. There
are no message queues or caches beyond TanStack Query/browser/CDN caching.
However, `secure-settings.js`, `registrations.js`, and the yearly-calendar page
combine dispatch, policy, persistence, external side effects and presentation.
Extract domain handlers and injected adapters only after contract/integration
tests exist. A generic repository layer would add ceremony without solving the
observed atomicity and delivery problems; a small **transaction script + durable
outbox** pattern is a better fit.

## Recommended target evolution

1. Retain serverless route files as thin HTTP adapters.
2. Extract typed domain commands (`registerForEvent`, `deliverNewsletter`,
   `deleteDocument`) with explicit transaction boundaries.
3. Add a durable outbox/delivery ledger for mail and Cloudinary cleanup.
4. Add database constraints for relationships and domain ranges after a data
   audit, with handlers translating constraint errors to stable HTTP errors.
5. Generate or share explicit request/response schemas; do not rely on Drizzle
   select types to describe raw `RETURNING *` results.

