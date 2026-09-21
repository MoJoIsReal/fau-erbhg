# FAU Erdal Barnehage — guide for AI coding agents

> Single source of truth for agent instructions. `CLAUDE.md` imports this file
> and adds only Claude-specific workflow notes — edit this file for anything
> about the repository itself.

Bilingual (Norwegian/English) web app for a Norwegian kindergarten parent
association: events and signups, documents, contact/newsletter, yearly calendar,
and an admin area for council members. React SPA on Vercel + Neon PostgreSQL.

## Setup and commands

`node_modules` is **not** checked in and may be absent in a fresh session — run
`npm ci` first.

```bash
npm ci             # install (required before any check/test/build)
npm run dev        # Vite dev server on http://localhost:5000 (frontend only)
npm run check      # tsc --noEmit + the i18n ratchet (scripts/check-i18n.mjs)
npm test           # test:unit then test:smoke
npm run build      # production frontend build (Vite → dist/public)
npm run verify     # check + test + build, i.e. exactly what CI runs
npm run db:push    # push shared/schema.ts to the DB (needs DATABASE_URL)
```

There is **no local backend**. `api/*.js` only executes on Vercel (or under
`vercel dev`). Don't add an Express/Node server to test handlers locally — test
their extracted logic instead (see Testing).

There is no ESLint/Prettier/formatter in this repo. Match the style of the file
you are editing; do not add a linter as a side effect of another task.

## Repository map

```
client/src/         React SPA. pages/ = routes, components/ = features,
                    components/site/ = the design system's own primitives,
                    components/ui/ = shadcn primitives (do not hand-edit),
                    assets/illustrations/ = the shipped page artwork,
                    lib/ = i18n, queryClient, exports; contexts/, hooks/
api/*.js            The entire backend: 8 Vercel serverless route handlers
api/cron/           Scheduled handler (Vercel Cron)
api/_shared/        Backend-only helpers: middleware, database, email,
                    cloudinary, rate-limit, newsletter, delivery, sentry, log
shared/             Code used by BOTH tiers (see "The shared/ boundary")
attached_assets/    Uploaded source material, never served — including
                    illustrations/, the six commissioned page originals
migrations/*.sql    Hand-applied SQL, run through the Neon SQL editor
tests/*.test.mjs    node:test suites; scripts/smoke-tests.mjs is the second tier
docs/               Architecture, subsystem rules, deployment, review backlog
```

## Architecture rules

**One backend.** Every endpoint is a Vercel serverless function in `api/*.js`.
Never introduce a second backend mirror or a service/repository layer — handlers
authenticate, validate, run SQL and shape the response themselves.

**Handler shape.** Every route is `export default withApiHandler(async function
handler(req, res) {…})`. `withApiHandler` applies security headers, handles CORS
preflight and funnels throws into `handleError`. Throw structured errors; don't
write your own try/catch envelope.

**Query-param routing.** The Vercel Hobby plan caps this project at 12
functions and 9 are used, so several handlers multiplex resources:
`api/auth.js?action=csrf|login|logout|me|change-password`,
`api/documents.js?action=download`,
`api/contact.js?action=newsletter-subscribe|newsletter-confirm|newsletter-unsubscribe`,
`api/secure-settings.js?resource=users|staff-users|board-members|kindergarten-info|blog-posts|contact-messages|newsletter-subscribers`.
Prefer extending an existing handler over adding a file. (This is also why there
is no `/api/health` — uptime monitors hit `GET /api/events`.)

**SQL, not an ORM.** Queries use the Neon tagged-template client from
`api/_shared/database.js` (`` sql`… ${value} …` ``, always parameterized).
Handlers never call Drizzle's query builder. Drizzle is used only to declare
`shared/schema.ts`, from which it generates the shared TS types and the
`drizzle-zod` insert schemas the browser forms validate against.

**Row mapping.** The DB is snake_case, the API contract is camelCase. Each
resource has exactly one `map*(row)` function (`mapEvent` in `api/events.js`,
`mapEntry` in `api/yearly-calendar.js`, …) that defines the wire shape; queries
return raw rows and map through it. Add fields there, not ad hoc per endpoint.

**The `shared/` boundary.** `api/` runs unbundled, so shared runtime code is
plain `.js` with a hand-written `.d.ts` sibling for the typed client
(`constants`, `photo-slots`, `yearly-calendar-*`, `calendar-feed`, `html-text`).
`shared/schema.ts` is the one TypeScript file — it is types/schema only and is
**never imported by `api/`**. If you add shared runtime code, write `.js` + a
`.d.ts`; if you add types, they belong in `schema.ts`.

**Deploys** happen automatically on push to `main` (Vercel). Nothing else
publishes the site.

Deeper detail, only when a task needs it: [`docs/architecture.md`](docs/architecture.md)
(boundaries, trust model), [`docs/subsystems.md`](docs/subsystems.md) (yearly
calendar, calendar feed, newsletter invariants),
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (Vercel, env vars, rollback).

## Where things live

| Task | Start here |
|---|---|
| Page/route | `client/src/pages/*.tsx`, routes registered in `client/src/App.tsx` |
| UI text (any user-facing string) | `client/src/lib/i18n.ts` — grep for a nearby key, it is 2.5k lines |
| Data fetching / CSRF / auth errors | `client/src/lib/queryClient.ts` |
| New or changed endpoint | the matching `api/<resource>.js` |
| Auth, CSRF, sanitizers, roles | `api/_shared/middleware.js` |
| DB access | `api/_shared/database.js` (`getDb()`) |
| Table shape, shared types, insert schemas | `shared/schema.ts` + a `migrations/*.sql` |
| Email / newsletter sending | `api/_shared/{email,newsletter,delivery,contact-emails}.js` |
| Uploads | `api/upload.js` + `api/_shared/upload-validation.js` |
| Structured logs, request ids | `api/_shared/log.js` (`withApiHandler` calls it) |
| Scheduled work | `api/cron/event-reminders.js`, schedules in `vercel.json` |
| Video embeds (sanitizer + CSP) | `shared/video-embed.js`, and the four files [`docs/subsystems.md`](docs/subsystems.md) names |
| Roles/enums shared by both tiers | `shared/constants.js` |
| A colour, radius, shadow, spacing or type step | `client/src/index.css` tokens, exposed as utilities by `tailwind.config.ts` |
| Hero, section, card, chip, banner, empty state | `client/src/components/site/` |
| Calendar category colours | `client/src/lib/calendar-kind-style.ts` → the `--cat-*` tokens |

## The design system

The visual layer implements the *FAU Erdal Barnehage UI Design & Style Guide
1.0*. Three rules keep it coherent:

**Tokens are the source of truth.** Every colour, radius, shadow, container
width, motion duration and type step is a custom property in
`client/src/index.css`; `tailwind.config.ts` does nothing but expose those as
utilities. Don't write a hex value, a one-off `rounded-[14px]` or a bespoke
shadow in a component — add or reuse a token. Tailwind's default spacing scale
*is* the guide's 8px system, so `gap-6` and `py-16` are already compliant.

Two tokens deliberately depart from the guide's published values, both for
contrast, and both are commented where they are declared: `--color-text-muted`
is a darkened sibling of the guide's `--color-muted` (which is 3.99:1 on sand,
under the 4.5:1 the same guide requires of body text), and each calendar
category has an AA-safe `--cat-*-text` beside the guide's published
`--cat-*-dot` hue.

**Type comes from the scale.** `text-display`, `text-h1`…`text-h4`,
`text-body-lg`, `text-body`, `text-small`, `text-micro`. Each is a `clamp()`
between the guide's mobile and desktop sizes, so one class covers both ends and
there are no breakpoint-swapped font sizes to keep in sync. Weight stays a
separate utility, and a page uses at most three of 400/600/700.

**Reach for `components/site/` before writing markup.** `PageHero`,
`Section`/`SectionHeader`/`Surface`/`EmptyState`, `FilterChip`/
`SegmentedControl`/`StatusPill`, `InfoBanner`/`IllustrationBanner`,
`EditorSurface`, and `Artwork` + the illustration library. Cards are
not the default container — the guide asks for spacing and typography first —
and editor-only controls always go inside `EditorSurface`, never among the
public filters.

Dark mode is a derived theme, not a second design: the same hues re-anchored on
an ink ground in the `.dark` block. Anything you add should work by swapping
tokens, not by adding `dark:` variants.

Accessibility is part of the system, not a later pass: 4.5:1 for body text
(3:1 for large text and meaningful graphics) in **both** themes, a visible 3px
focus ring, 44px minimum touch targets, and category or status never carried by
colour alone — always a label or an icon beside the dot.

Two areas are intentionally outside it. `client/src/pages/yearly-calendar.tsx`
keeps its poster styling because it mirrors the PDF it generates
(`client/src/lib/yearly-calendar-pdf.tsx`), and the colour values users pick for
yearly-calendar entries are stored data rather than design tokens.

## Conventions

**Data fetching.** TanStack Query for all server state; stale time is 5 minutes;
invalidate the affected query keys after a mutation. The query key's first item
is the URL the default queryFn fetches — a key like `['/api/events', id, 'x']`
still fetches `/api/events`, so pass a real URL or a custom `queryFn`.
`apiRequest(method, url, data?)` returns a `Response`; call `.json()` yourself.
It attaches the `csrf-token` cookie as `X-CSRF-Token` on non-GET and always
sends credentials.

**i18n is enforced.** Every user-facing string goes in `client/src/lib/i18n.ts`
so the typed `Translations` interface forces both languages. Inline
`language === 'no' ? … : …` copy is capped by a ratchet in
`scripts/check-i18n.mjs` (`BUDGET`, currently 45) that `npm run check` runs —
the number may fall, never rise. Locale ids and date-fns locales are the
legitimate inline cases.

**Forms.** React Hook Form + `zodResolver`, using the `insertXSchema` exports
from `shared/schema.ts` where one exists.

**Dates.** Most date columns are `text` holding ISO strings, deliberately, to
avoid timezone drift; `api_rate_limits` is the exception (`timestamptz`).

**Errors.** Server: throw with a status, let `handleError` respond and redact.
Client: `useToast()` — never `alert()`.

**Auth model.** JWT in an HttpOnly `jwt` cookie (`Authorization: Bearer` still
accepted as a fallback), plus a double-submit `csrf-token` cookie. Guard with
`requireAuth` / `requireRole(req, res, COUNCIL_ROLES, sql)` and `requireCsrf` on every
state-changing endpoint. Roles: `admin` (everything, and sole access to
site settings, board members, kindergarten info, users, newsletter subscribers),
`member` (events, registrations, documents, blog posts, yearly calendar, contact
messages), `staff` (yearly calendar entries only). UI route guards are
convenience only — authorization is the handler's job.

**Security non-negotiables.** Parameterized SQL only. Sanitize input through
the `sanitizeText/Html/Email/Phone/Number` helpers in `middleware.js`. Uploads
must pass MIME + extension + `MAX_UPLOAD_SIZE_BYTES` validation and the returned
Cloudinary URL must belong to our `cloud_name` under `fau-documents/`. Never
widen CORS to `*`. Never log emails, phone numbers or tokens — use
`safeErrorForLog` / `redactSensitiveText`. Never write files to disk in a
serverless function.

## Testing and validation

`tests/*.test.mjs` run on `node --test` with no database, network or
credentials: they import `api/_shared/*` and `shared/*` directly and stub what
they need. `scripts/smoke-tests.mjs` is an assertion-based second tier that also
grep-guards source-level regressions.

```bash
node --test tests/calendar-feed.test.mjs   # one suite while iterating
npm test                                   # both tiers
npm run verify                             # the full CI gate
```

Before calling a change done:

1. `npm run check` — always (type errors and untranslated copy are the two most
   common breakages).
2. The suite(s) covering what you touched, then `npm test`.
3. `npm run build` if you changed anything under `client/` or the Vite config.

`npm run verify` covers all three when you'd otherwise run them individually.
Add a test whenever you touch `api/_shared/` or `shared/` — that is the layer
the suites can actually reach. Never point automated tests at the production
Neon database.

## Safety boundaries

- `client/src/components/ui/**` — shadcn primitives, regenerate via the shadcn
  CLI, do not hand-edit. One documented exception exists: `button`, `input`,
  `textarea`, `select` and `card` carry the design guide's sizing, radius,
  focus-ring and disabled tokens, because those are what give every control in
  the app its 44px touch target and 3px focus ring. Keep any regeneration to
  structure and re-apply those token values; do not add markup or props here.
- `migrations/*.sql` — append a new numbered file; never edit or renumber an
  applied one. Schema changes need **both** `shared/schema.ts` and a migration
  (see `migrations/README.md`).
- `package-lock.json`, `attached_assets/`, `dist/` — don't hand-edit; Dependabot
  owns dependency bumps.
- `.env*`, secrets, production Vercel/Neon/Cloudinary config — never commit
  values; `.env.example` documents the variables and `docs/DEPLOYMENT.md`
  explains them.
- `vercel.json` — routing, CSP and cron schedules. A change here can take the
  site down; keep it deliberate and mention it in the PR description.
- Calendar-feed `UID`s and the outbox stamping logic — see
  [`docs/subsystems.md`](docs/subsystems.md) before touching either.

## Change discipline

Make the smallest coherent change. Look at a sibling handler/page/test before
introducing a pattern; this codebase is small and internally consistent, so
reuse beats invention. Don't refactor code the task didn't ask about, and don't
"fix" audit findings opportunistically — each one is a scoped task with its own
acceptance criteria. The live plan is [`REVIEW_TASKS.md`](REVIEW_TASKS.md) at the
repository root (the 2026-09-18 audit); [`docs/review-backlog.md`](docs/review-backlog.md)
is the superseded 2026-09-09 backlog, whose checkbox state is stale and whose task
IDs mean different things despite reusing the same prefixes.
