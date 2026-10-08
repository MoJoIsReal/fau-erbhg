# Traceability Matrix

Commit `041e0cf`. Flows come from `.review/02-architecture.md`; full evidence is in `.review/findings-trace.md`. Paths are relative to `client/src/` for UI and to the repository root for `api/`.

**Method**
- Static trace UI → DB → UI.
- Three handler suites run: registrations-handler, secure-settings-handler, event-reminders (32/32 pass).
- One probe of the reminder mail.
- No live runtime.

**Architecture notes for reading the table**
- There is no service layer, so the "Controller" column is the `api/*.js` handler and "Service" is `—` by design (AGENTS.md).
- "Data access" is the Neon tagged-template SQL in the same handler, via `api/_shared/database.js` `getDb()`.

**Totals:** PASS 6 · PARTIAL 8 · FAIL 1 · UNVERIFIED 0 · DEAD 0 · ORPHANED 0.

| Trace ID | Feature | UI location | UI handler | Client fn | Endpoint | Controller | Service | Data access | DB object | Input sig | Output sig | AuthZ | Validation | Error path | Return mapping | Status | Findings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Login / logout / change password / session | `components/login-modal.tsx:23`, `hooks/useAuth.ts:25`, `components/password-change-modal.tsx:19` | useMutation | `apiRequest` (GET csrf first) | POST `/api/auth?action=login\|logout\|change-password`; GET `/api/auth[?action=me\|csrf]` | `api/auth.js:116,224,260,339` | — | SQL + `rate-limit.js` | users, api_rate_limits | `{username,password}`, `{currentPassword,newPassword}` | `{user}` / `{userId,…}` + Set-Cookie jwt, csrf-token, login-device | CSRF on POST; `parseAuthToken` | strings; ≥12 chars; policy | 400/401/429 `{error}` with no `code`; client shows raw English | login `user.id` vs me `userId` (body unused) | PARTIAL | TRACE-003, MAINT-003, SEC-001 (account lock), SEC-004 |
| F-02 | Council mutation guard | every council write | — | `apiRequest` + `X-CSRF-Token` | any non-GET | `requireRole` `api/_shared/middleware.js:383` → `parseAuthToken :292` → `requireCsrf :279` | — | users lookup by id | users | cookie jwt / Bearer | 401/403 or pass | role from DB, token_version | — | 401 → `notifyUnauthorized` clears auth cache; DB error also 401 (OBS-001) | n/a | PASS | OBS-001 |
| F-03 | Public event signup | `components/event-registration-modal.tsx:97` | useMutation + Turnstile | `apiRequest` POST | POST `/api/registrations` | `api/registrations.js:280-628` | — | locking CTE (FOR UPDATE, NOT EXISTS + ON CONFLICT, slot reservation, counter) | events, event_registrations, photo_event_slots, email_domain_blacklist | name, email, phone, attendeeCount, childrenNames, photoSlots, food, comments, turnstileToken | 201 raw row minus `cancel_token` | public (Turnstile, per-IP/e-mail limits, daily mail cap) | sanitizers, attendee/name/food rules | 15 `SIGNUP_ERROR_CODES`, all translated and routed to fields | invalidates `/api/events` + food key; mail via `waitUntil` | PARTIAL | DB-001, SEC-003, SEC-006, MAINT-003, TRACE-006, A11Y-001…003 |
| F-04 | "Din påmelding" (cancel / food) | `pages/registration-cancel.tsx:160-184` | effect lookup + explicit clicks | `apiRequest` POST | `/api/registrations?action=cancel-lookup\|cancel\|update-food` | `handleCancel` `api/registrations.js:90` | — | single DELETE → archive INSERT → counter; slots CASCADE | event_registrations, event_registration_cancellations, events | `{token[,foodContribution]}` | lookup summary / `{success}` | 64-hex token + IP limit | `osloToday` window | 404 notFound, closed, food code mapped | cancel invalidates nothing | PASS | TRACE-006 |
| F-05 | Council attendee list / delete / export | `components/event-registrations-view.tsx:35,42`, `attendee-tooltip.tsx:27`, `potluck-contributions.tsx:28` | useQuery / useMutation | default queryFn | GET `/api/registrations?eventId=[&cancelled=1\|&food=1]`; DELETE `?id=` | `api/registrations.js:202-278,630-668` | — | aliased SELECTs; release CTE | event_registrations, event_registration_cancellations | eventId / id | council: `EventRegistration[]`; others: `{count}` | in-handler `parseAuthToken` (:233); DELETE `requireRole` | `sanitizeInteger` | **Broken hop: `api/registrations.js:277` → `event-registrations-view.tsx:137`.** An expired or invalid council session gets `200 {count}` under an array-typed key, so `.reduce` throws, the app-wide ErrorBoundary takes over, and no 401 triggers re-login | camelCase arrays; optimistic delete rolls back both caches | FAIL | TRACE-001, TEST-003 |
| F-06 | Event CRUD / cancel / ICS / link preview | `components/event-creation-modal.tsx:289`, `calendar-editor-tools.tsx:84-118`; `/kalender.ics`; bot `/kalender?vis=` | useMutation | `apiRequest` | `/api/events` GET/POST/PUT/PATCH(cancel)/DELETE; `?format=ics\|preview` (vercel.json rewrites) | `api/events.js:295-470` | — | RETURNING + derived attendee sum; guarded delete + FK RESTRICT | events, event_registrations, yearly_calendar_entries | event body (ISO date, H:MM, type, cap, deadline) | `mapEvent` JSON / text/calendar / HTML | council writes; public reads | `validateEventBody` | 400 raw English; `hasRegistrations` translated | `mapEvent` everywhere; share-id format agrees across 3 files | PASS | TRACE-003, PERF-005 |
| F-07 | Document upload / list / download / delete | `components/file-upload-modal.tsx:74`, `RichTextEditor.tsx:216`, `pages/files.tsx:99,246` | useMutation / href | `apiRequest` + browser POST to Cloudinary | `/api/upload?action=sign`, POST `/api/upload`, GET `/api/documents[?action=download]`, DELETE | `api/upload.js`, `api/documents.js` | — | INSERT RETURNING *; provider-first delete | documents | filename, mimeType, size → Cloudinary result | `{document: raw row}` / list with `fileUrl` | council writes | `validateUploadFile`, owned URL, `validateProviderUpload` | 400 raw English; null URL → DELETE 500 | no `map*`; client `Document` type ≠ wire | PARTIAL | MAINT-003, TRACE-007, TRACE-003 |
| F-08 | Contact form + council inbox / reply | `pages/contact.tsx:152`, `pages/messages.tsx:66-131` | useMutation | `apiRequest` | POST `/api/contact`; `secure-settings?resource=contact-messages` | `api/contact.js:22-172`; `api/secure-settings.js:494-627` | — | INSERT RETURNING *; UPDATEs | contact_messages | name, email, phone, subject enum, message, turnstileToken | public: raw row (PII echo); council: `mapContactMessage` | public / council | subject enum, limits | 400/413/429 raw; `TURNSTILE_FAILED` handled; reply 400/502/503 raw | council mail prints raw enum | PARTIAL | TRACE-003, TRACE-005, MAINT-003, SEC-003, SEC-006 |
| F-09 | Newsletter subscribe / confirm / unsubscribe / broadcast | `components/newsletter-signup.tsx:28`, `pages/newsletter.tsx:50`, `newsletter-subscribers-section.tsx:45` | useMutation / effect | `apiRequest` | `/api/contact?action=newsletter-*`; cron `?task=newsletter`; `secure-settings?resource=newsletter-subscribers` | `api/contact.js:224,314,351`; `api/cron/event-reminders.js:183`; `api/secure-settings.js:731` | — | upsert ON CONFLICT; outbox fan-out; SKIP LOCKED | newsletter_subscribers, newsletter_deliveries | email, name, language / token | status pages | tokens / CRON_SECRET / admin | token regex, honeypot, limits | translated status pages; subscribe error raw | `mapNewsletterSubscriber`; mail links match routes | PASS | SEC-007, SEC-008, PERF-006 |
| F-10 | Blog / news | `pages/content.tsx:100-200`, `news.tsx:111`, `news-post.tsx:36`, `home.tsx:109` | useMutation / useInfiniteQuery | `apiRequest`, custom queryFn | `secure-settings?resource=blog-posts` (+includeArchived, category, q, limit/offset, homepage, id) | `api/secure-settings.js:270-412` | — | parameterized filters, escaped LIKE | blog_posts | post body | `mapBlogPost` / `publicBlogPost` | council writes; public reads published | `sanitizeHtml`, enums, `sanitizeInteger` | translated generic toasts | predicate invalidation | PASS | SEC-014, TEST-001 |
| F-11 | Settings: board, kindergarten info, users | `pages/settings.tsx:242-480`, `components/staff-users-section.tsx:44` | useMutation | `apiRequest` | `secure-settings?resource=board-members\|kindergarten-info\|users` | `api/secure-settings.js:153-267,414-489,631-727` | — | RETURNING | fau_board_members, kindergarten_info, users | entity bodies | `map*` | admin writes | sanitizers, role enum | Norwegian-only user errors shown raw | **Hop mismatch:** kindergarten GET newest row (:429), PUT oldest (:479) | PARTIAL | TRACE-004, TRACE-003, SEC-011, TEST-001 |
| F-12 | Yearly calendar CRUD + Excel import | `components/yearly-calendar-entry-modal.tsx:152`, `yearly-calendar-import-modal.tsx:321,349` | useMutation | `apiRequest` | `/api/yearly-calendar` CRUD, `?action=preview-import\|commit-import` | `api/yearly-calendar.js:197-481` | — | single statements; import one `jsonb_to_recordset` | yearly_calendar_entries (CHECK 0014) | entry body / parsed rows + decisions | `mapEntry` (incl. `createdBy` publicly) | `YEARLY_CALENDAR_EDITORS` | `sanitizeEntryPayload`, shared validators | Norwegian errors regex-translated; some English untranslated | predicate invalidation | PASS | SEC-005, TRACE-003 |
| F-13 | Private media share admin | `pages/media-shares.tsx:213-300,545-590`, `lib/media-upload.ts:66-227` | submit / row actions | `apiRequest` | `/api/media` list, link, create, upload-init/parts/complete/abort, publish, extend, DELETE | `api/media.js:236-571` | — | INSERT…SELECT quota guard; R2 presign/multipart; `purgeShare` | media_shares, media_files, R2 | lifetime, PIN, files | `mapShare` | `MEDIA_SHARE_ROLES` | lifetime, PIN `^\d{4,8}$`, MIME, size, parts, etag, magic bytes | all coded; codes identical across tiers | `mapShare` == `MediaShareSummary` | PARTIAL | SEC-002, SEC-015, R2 runtime UNVERIFIED |
| F-14 | Share view | `share/share-page.tsx:48` | effect + PIN form | plain `fetch` | POST `/api/media?action=view` | `api/media.js:162` | — | token-hash lookup, PIN limits, presigned GETs | media_shares, media_files | `{token[,pin\|grant]}` | `SharedMedia` + presigned URLs | token + PIN / HMAC grant | well-formed token, size cap | code switch (`share-page.tsx:59-68`) | `mapSharedFile` == `SharedMedia` | PARTIAL | SEC-001, SEC-002, PERF-002 |
| F-15 | Cron: morning tasks + newsletter | `vercel.json` crons `0 7 * * *`, `0 19 * * *?task=newsletter` | — | — | GET `/api/cron/event-reminders` | `isAuthorizedCron :79`, `runMorningTasks :680`, `sendEventReminders :569`, `broadcastNewsletter :183` | — | claim CTEs, retention DELETEs, reconcile, purge | registrations, cancellations, events, contact_messages, deliveries, rate_limits, media_* | `Authorization: Bearer CRON_SECRET` | summary JSON / 500 AggregateError | CRON_SECRET, constant-time | `tomorrowInOslo` | stage isolation; non-mail failures not alerted | reminder prints raw `photo_slots` JSON; retention casts `::date` | PARTIAL | TRACE-002, TRACE-005, OBS-005, PERF-006 |

## FAIL detail

**F-05**
- **Broken link:** `api/registrations.js:232-277` (server) → `client/src/components/event-registrations-view.tsx:35,137` and `attendee-tooltip.tsx:27,43` (client).
- **Server side:** `isCouncilMember` is false whenever `parseAuthToken` returns `null`. That covers an expired JWT, a bumped `token_version`, a pending password change, and (because of OBS-001) any DB error. The handler then returns the public `200 {count: n}`.
- **Client side:** the same query key is typed `EventRegistration[]`, and `.reduce` / `.filter` are called on the object.
- **Result:** a TypeError reaches the only error boundary (`client/src/main.tsx:36`), so the whole SPA is replaced by the error screen and no 401 triggers the re-login path.
- **Fix:** tracked as TRACE-001.

## Reverse trace

**Client → route:** every client URL literal and every e-mail link resolves to an existing handler/action or SPA route. No ORPHANED.

**Route → client:**
- The public `{count}` aggregate has no client consumer.
- `/api/cron/*` is reached only by `vercel.json` and tests (expected).

**Unused exports:**
- `MEDIA_ERROR_CODES` (`shared/media.js:92`)
- `isTurnstileEnabled` (`api/_shared/turnstile.js:44`)
- `DELIVERY_LEASE_MINUTES` (`api/_shared/delivery.js:4`), duplicated as a literal three times

See MAINT-004.

**Tables and columns:**
- `site_settings` is reserved and unused (deliberate).
- `photo_event_slots` is write-only by design: a uniqueness backstop.
- `newsletter_deliveries.description`, `.last_error` and `.sent_at` are never read by the API.

**Consistent across tiers:**
- **Query keys:** every key's first element is the fetched URL.
- **Enums:** EVENT_TYPES, contact subjects, yearly categories (migration 0014), delivery states (0017), `SIGNUP_ERROR_CODES` and media codes.
