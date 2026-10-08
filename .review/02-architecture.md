# 02 — Architecture map

## Layers and boundaries
- Browser SPA (`client/src`) → `client/src/lib/queryClient.ts` (`apiRequest`, default queryFn; attaches `X-CSRF-Token` from `csrf-token` cookie, credentials: include) → Vercel function `api/<resource>.js` → `withApiHandler` (`api/_shared/middleware.js:98`; security headers, CORS allowlist, preflight, `handleError` redaction, request log) → handler: `requireRole`/`requireAuth` (JWT cookie or Bearer; DB lookup of user + token_version) → `requireCsrf` (double-submit) → sanitizers (`sanitizeText/Html/Email/…`, `requireIntId`) → Neon SQL tagged templates (`api/_shared/database.js`) → PostgreSQL → `map*(row)` camelCase → JSON.
- Share page (`client/del.html`, `client/src/share/`) — separate bundle, own CSP, no Sentry/analytics; talks only to `/api/media?action=view` with a capability token + optional PIN; gets presigned R2 GET URLs.
- Shared runtime code `shared/*.js` + `.d.ts` used by both tiers; `shared/schema.ts` types/zod only (client).
- External: Cloudinary (signed direct browser upload → `/api/upload` records URL after owned-URL + provider metadata verification), R2 (presigned PUT/multipart, GET), Gmail SMTP, Turnstile siteverify, Sentry envelope HTTP, YouTube embeds.
- Trust boundaries: anonymous public (signup, contact, newsletter, ICS feed, link preview, public GETs); capability tokens (registration cancel token 64-hex, newsletter confirm/unsubscribe tokens, media share token + PIN + HMAC view grant); session roles admin/member/staff; cron (CRON_SECRET bearer, `api/cron/event-reminders.js:79 isAuthorizedCron`).
- Roles: `COUNCIL_ROLES` (admin, member), `ADMIN_ONLY`, `YEARLY_CALENDAR_EDITORS` (incl. staff), `MEDIA_SHARE_ROLES` in `shared/constants.js`.

## State machines / hidden side effects
- Event registration: signup atomic locking CTE (capacity, `events.current_attendees`), photo slot reservation via unique `photo_event_slots` with retry; cancel by token deletes registration + inserts `event_registration_cancellations` + releases capacity in one statement; council DELETE; cron `reconcileEventAttendeeCounts` repairs counter; reminders claim fields on registration row.
- Newsletter: subscribe (pending + confirm token mail) → confirm → active; unsubscribe token; blog post `notify_newsletter` + event reminders → `newsletter_deliveries` outbox (status pending/sending/sent/failed, leases, SKIP LOCKED) broadcast 19:00 UTC.
- Contact messages: insert + email to council + acknowledgement (global daily public mail cap `sendPublicMail`), council reply email, retention cleanup in cron.
- Documents: Cloudinary upload → row; delete = provider-first, row kept on provider failure.
- Media shares: draft → files uploading (R2 multipart) → published (expiry) → extend / revoke → purge (cron + draft TTL 24h); token stored hashed + sealed (AES) for re-display; PIN hashed; view grant HMAC 12h.
- Yearly calendar: CRUD + Excel import preview/commit (source stamping, UIDs feed `/kalender.ics` via `shared/calendar-feed.js`).
- Auth: login rate limits (IP+account, IP, account-wide failures), login-device cookie, token_version bump on logout/password change, password expiry policy.
- Cron morning: rate-limit cleanup, attendee reconcile, delivery history cleanup, privacy retention, reminders, media purge.

## Flows
- F-01 Login: `login-modal.tsx:23` → GET `/api/auth?action=csrf` → POST `/api/auth?action=login` → `api/auth.js:116 handleLogin` (rate limits `rate-limit.js`, bcrypt, device cookie) → `users` → set `jwt`+`csrf-token` cookies → `useAuth` `/api/auth?action=me`. Logout/change-password `auth.js:224/260` bump token_version.
- F-02 Session-authorized mutation guard (all council writes): `apiRequest` → `requireRole` `middleware.js:383` → `parseAuthToken` `:292` (JWT verify + users lookup, token_version) → `requireCsrf` `:279`.
- F-03 Public event signup: `event-registration-modal.tsx:97` (Turnstile) → POST `/api/registrations` → `registrations.js:281` (validate, Turnstile, rate limit, blacklist?, locking CTE on `events`, `event_registrations`, `photo_event_slots`) → confirmation mail via `sendPublicMail` (`registrations.js:661`) → 201 → invalidate queries.
- F-04 Registration capability (Din påmelding): `/avmelding?token=` `registration-cancel.tsx` → POST `registrations?action=cancel-lookup|cancel|update-food` → `registrations.js:90 handleCancel` → delete + `event_registration_cancellations` + capacity release / food update.
- F-05 Registrations read: `GET /api/registrations?eventId=` (public count, `&food=1` dishes, council full list `registrations.js:202-280`) → `event-registrations-view.tsx`, attendee export (`client/src/lib/*export*`).
- F-06 Event CRUD + cancel + ICS/link preview: `event-creation-modal.tsx:289`, `calendar-editor-tools.tsx:84` → `api/events.js:298-470` (`validateEventBody`, `mapEvent`), `?format=ics` `respondWithCalendarFeed :99` (`shared/calendar-feed.js`), `?format=preview` `:156` (`link-preview.js` HTML render, bot UA rewrite in vercel.json).
- F-07 Document/image upload: `file-upload-modal.tsx:74` / `RichTextEditor.tsx:216` → POST `/api/upload?action=sign` → browser → Cloudinary → POST `/api/upload` (`upload.js`, `upload-validation.js` verify owned URL + provider metadata) → `documents`. Download `documents.js:15` action=download; DELETE `documents.js:74`.
- F-08 Contact form + messages admin: `contact.tsx:152` → POST `/api/contact` (`contact.js`, Turnstile, rate limit, `contact_messages`, mail to council + ack) → `/messages` `messages.tsx` → `secure-settings?resource=contact-messages` `secure-settings.js:494` (reply email `contact-emails.js:115`).
- F-09 Newsletter: `newsletter-signup.tsx:28` → `contact.js:224/314/351` (subscribe/confirm/unsubscribe) → `newsletter_subscribers`; broadcast `cron/event-reminders.js:183 broadcastNewsletter` → `newsletter_deliveries` → `email.js sendPooledEmail`. Admin list/delete `secure-settings.js:731`.
- F-10 Blog posts/news: `content.tsx:100-116` → `secure-settings?resource=blog-posts` `:270` (council writes, `sanitizeHtml`), public GET (`publicBlogPost`), `news.tsx`/`news-post.tsx` render via `safe-html.tsx`.
- F-11 Settings (board members, kindergarten info, users): `settings.tsx`, `staff-users-section.tsx` → `secure-settings.js:153/423/635` (admin), temp password `password-policy.js:9`.
- F-12 Yearly calendar CRUD + Excel import: `yearly-calendar-entry-modal.tsx:152`, `yearly-calendar-import-modal.tsx:321/349` → `api/yearly-calendar.js:199-481` (`shared/yearly-calendar-utils.js`, `calendar-entries.js`) → `yearly_calendar_entries`; PDF/Excel export client-side.
- F-13 Private media share admin: `media-shares.tsx` + `lib/media-upload.ts:67` → `api/media.js` create/upload-init/parts/complete/abort/publish/extend/revoke (`r2.js`, `media-share.js`) → `media_shares`, `media_files`, R2.
- F-14 Media share view: `client/src/share/share-page.tsx:49` → POST `/api/media?action=view` `media.js:162` (token hash lookup, PIN verify, rate limit, view grant) → presigned GETs.
- F-15 Cron: Vercel Cron → GET `/api/cron/event-reminders[?task=newsletter]` → `isAuthorizedCron :79` → `runMorningTasks :680` / `broadcastNewsletter :183`.

## Cross-module dependencies
`api/*` → `api/_shared/*` → `shared/*.js`. Client → `shared/*.js` (+ `.d.ts`) and `shared/schema.ts`. No cycles observed among `api/_shared` (to verify). `api/registrations.js` exports `handleCancel` used only internally/tests.
