# Findings — trace (flows F-01…F-15)

Scope: forward/return/error paths, contracts at every hop, DB side effects, reverse trace for the flows in `.review/02-architecture.md`. Read-only. Static tracing + three handler suites (registrations-handler, secure-settings-handler, event-reminders: 32/32 pass) + one scratch probe of `registrationReminderEmail`. No live Vercel/Neon/R2/Cloudinary/Gmail.
Status: PASS = every hop holds; PARTIAL = a non-core hop has a defect or depends on runtime; FAIL = a named hop breaks for a realistic input.

## 1. Per-flow matrix

| Trace ID | Feature | UI location | UI handler | Client fn | Endpoint | Handler | Data access | DB object | AuthZ | Validation | Error path | Return mapping | Status | Findings |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Login/logout/change-pw/session | login-modal.tsx:23, useAuth.ts:25, password-change-modal.tsx:19 | mutations | apiRequest (csrf prefetch) | POST /api/auth?action=login\|logout\|change-password; GET /api/auth | auth.js:116/224/260/339 | SQL + rate-limit.js | users, api_rate_limits | CSRF on POSTs; parseAuthToken | typeof string, ≥12 chars | 400/401/429 `{error}` no `code`; client shows raw English `error.message` (login-modal.tsx:47, password-change-modal.tsx:45) | login `user.id` vs me `userId` (auth.js:213 vs :354); login body unused → safe | PARTIAL | TRACE-1, TRACE-7 |
| F-02 | Council mutation guard | all council writes | — | apiRequest + X-CSRF-Token | any non-GET | requireRole middleware.js:383 → requireAuth → parseAuthToken :292 → requireCsrf :279 | users lookup | users | present | — | 401 → notifyUnauthorized clears ['/api/auth']; 403 codes → generic toasts | n/a | PASS | (TRACE-2) |
| F-03 | Public signup | event-registration-modal.tsx:97 | mutate + Turnstile | apiRequest POST | POST /api/registrations | registrations.js:280-628 | locking CTE (FOR UPDATE, NOT EXISTS + ON CONFLICT DO NOTHING, slot reservation, single counter UPDATE) | events, event_registrations, photo_event_slots, email_domain_blacklist | public (Turnstile + limits) | sanitizers, attendee/names/food rules | all 15 SIGNUP_ERROR_CODES translated (i18n.ts:1574/2632), routed to fields | 201 raw row minus cancel_token; invalidates /api/events + food key; mail via waitUntil | PARTIAL | TRACE-4, TRACE-8 |
| F-04 | Din påmelding | registration-cancel.tsx:160-184, FoodSection:46 | effect + clicks | apiRequest POST | ?action=cancel-lookup\|cancel\|update-food | handleCancel registrations.js:90 | single DELETE → archive INSERT → counter; slots CASCADE (0009) | event_registrations, event_registration_cancellations, events | 64-hex token + IP limit | osloToday guard | 404 → notFound; closed; food code mapped | aliases; cancel invalidates nothing | PASS | TRACE-8 |
| F-05 | Registrations read/delete/export | event-registrations-view.tsx:35/42, attendee-tooltip.tsx:27, potluck-contributions.tsx:28 | useQuery | default queryFn | GET ?eventId(&cancelled=1/&food=1); DELETE ?id | registrations.js:202-278, 630-668 | aliased SELECTs; release CTE | same | council in-handler (:233); else `{count}` 200 | sanitizeInteger | **broken hop:** expired council session → 200 `{count}` (:277) under a key typed EventRegistration[] → `.reduce` TypeError (view:137) → app-wide ErrorBoundary; no 401 so no session recovery | camelCase arrays; optimistic delete rolls back both caches | FAIL | TRACE-2 |
| F-06 | Event CRUD/cancel/ICS/preview | event-creation-modal.tsx:289, calendar-editor-tools.tsx:84-118, /kalender.ics, bot /kalender?vis= | mutations | apiRequest | /api/events GET/POST/PUT/PATCH/DELETE, format=ics\|preview | events.js:295-470 | RETURNING + derived sum; MATERIALIZED delete guard + FK RESTRICT | events, event_registrations, yearly_calendar_entries | council writes | validateEventBody (ISO date, H:MM, EVENT_TYPES, cap, deadline→ISO; client local→ISO :71) | 400 English raw; hasRegistrations translated (:105) | mapEvent everywhere; share-id formats agree (vercel.json, link-preview.js:47, calendar-entries.js:205-209) | PASS | TRACE-1 |
| F-07 | Upload/list/download/delete documents | file-upload-modal.tsx:74, RichTextEditor.tsx:216, files.tsx:99/246 | mutations/href | apiRequest + fetch Cloudinary | /api/upload?action=sign, /api/upload, /api/documents[?action=download], DELETE | upload.js, documents.js | INSERT RETURNING *; provider-first delete | documents | council writes | validateUploadFile, owned URL, api.resource, validateProviderUpload | 400 English raw; null URL → DELETE 500 | no map*; client Document type ≠ wire (fileUrl vs cloudinaryUrl) | PARTIAL | TRACE-7, TRACE-9; provider UNVERIFIED |
| F-08 | Contact + inbox/reply | contact.tsx:152, messages.tsx:66-131 | mutations | apiRequest | POST /api/contact; secure-settings?resource=contact-messages | contact.js:22-172, secure-settings.js:494-627 | INSERT RETURNING *; UPDATEs | contact_messages | public / council | subject enum matches contact.tsx:256-259 | 400/413/429 English raw; TURNSTILE_FAILED handled; reply 400/502/503 raw | mapContactMessage; public POST echoes raw row incl. PII; council mail prints raw subject enum | PARTIAL | TRACE-1, TRACE-6, TRACE-7 |
| F-09 | Newsletter | newsletter-signup.tsx:28, newsletter.tsx:50, newsletter-subscribers-section.tsx:45 | mutation/effect | apiRequest | /api/contact?action=newsletter-*; cron ?task=newsletter; resource=newsletter-subscribers | contact.js:224/314/351, event-reminders.js:183, secure-settings.js:731 | upsert ON CONFLICT; outbox fan-out; SKIP LOCKED; stamping off delivery rows | newsletter_subscribers, newsletter_deliveries (CASCADE) | tokens / CRON_SECRET / admin | TOKEN_RE, honeypot, limits | translated status pages; subscribe error raw | mapNewsletterSubscriber; ?bekreft/?avmeld links match newsletter.tsx:37-38 | PASS | TRACE-1, A-2 |
| F-10 | Blog/news | content.tsx:100-200, news.tsx:111, news-post.tsx:36, home.tsx:109 | mutations/queries | apiRequest, custom infinite queryFn | resource=blog-posts (+includeArchived, category, q, limit/offset, homepage, id) | secure-settings.js:270-412 | parameterized filters | blog_posts | council writes/archived | sanitizeHtml, enums, sanitizeInteger | translated generic toasts | mapBlogPost/publicBlogPost; predicate invalidation | PASS | A-5 |
| F-11 | Settings (board, kindergarten info, users) | settings.tsx:242-480, staff-users-section.tsx:44 | mutations | apiRequest | resource=board-members\|kindergarten-info\|users | secure-settings.js:153-267, 414-489, 631-727 | RETURNING | fau_board_members, kindergarten_info, users | admin writes | sanitizers, role enum | Norwegian-only user errors shown raw | map* present; **hop mismatch:** kindergarten GET newest row (:429), PUT oldest (:479) | PARTIAL | TRACE-5, TRACE-1 |
| F-12 | Yearly calendar + import | yearly-calendar-entry-modal.tsx:152, import-modal.tsx:321/349 | mutations | apiRequest | /api/yearly-calendar CRUD, preview-import, commit-import | yearly-calendar.js:197-481 | single stmt; import one jsonb_to_recordset stmt | yearly_calendar_entries (CHECK 0014 == YEARLY_CALENDAR_CATEGORIES) | YEARLY_CALENDAR_EDITORS | sanitizeEntryPayload, shared validators | NO errors regex-translated to EN (import-modal:182); EXISTING_NOT_FOUND/decision errors English in NO | mapEntry; predicate invalidation | PASS | TRACE-1 |
| F-13 | Media share admin | media-shares.tsx:213-300, 545-590; lib/media-upload.ts:66-227 | submit/row actions | apiRequest | /api/media list/link/create/upload-*/publish/extend, DELETE | media.js:236-571 | INSERT…SELECT quota guard; R2 presign/multipart; purgeShare | media_shares, media_files (CASCADE), R2 | admin | lifetime, PIN, MIME, size, parts, etag, magic bytes | all coded; codes identical in shared/media.js:92, media.d.ts:28, client | mapShare == MediaShareSummary | PARTIAL | TRACE-10; R2 UNVERIFIED |
| F-14 | Share view | share/share-page.tsx:48 | effect + PIN | plain fetch | POST /api/media?action=view | media.js:162 | hash lookup, PIN limits, presigned GETs | media_shares, media_files | token + PIN/grant | well-formed token, size cap | code switch (share-page:59-68) | mapSharedFile == SharedMedia | PARTIAL | presign UNVERIFIED |
| F-15 | Cron | vercel.json crons 0 7 / 0 19 ?task=newsletter | — | — | GET /api/cron/event-reminders | isAuthorizedCron:79, runMorningTasks:680, sendEventReminders:569, broadcastNewsletter:183 | claim CTEs, retention DELETEs, reconcile | registrations, cancellations, events, contact_messages, deliveries, rate_limits, media_* | CRON_SECRET | tomorrowInOslo | stage isolation → AggregateError 500 + log | reminder prints raw photo_slots JSON; retention casts ::date | PARTIAL | TRACE-3, TRACE-6 |

Counts: PASS 6 · PARTIAL 8 · FAIL 1 · UNVERIFIED 0 · DEAD 0 · ORPHANED 0.

### Reverse trace
- Client → route: every client URL literal resolves to an existing handler/action; every e-mail link resolves to an SPA route (App.tsx:110-172). No ORPHANED calls.
- Route → client: public `{count}` aggregate (registrations.js:270-277) has no client consumer. `/api/cron/*` reached only from vercel.json and tests. The `GET /api/events?id=` branch claimed in 01-inventory does not exist.
- Exports with no caller (incl. tests): `MEDIA_ERROR_CODES` (shared/media.js:92), `isTurnstileEnabled` (turnstile.js:44), `DELIVERY_LEASE_MINUTES` (delivery.js:4 — cron hard-codes `INTERVAL '10 minutes'`, duplicate constant can drift).
- Tables/columns: `site_settings` reserved/unused (deliberate); `photo_event_slots` write-only by design (uniqueness backstop); `newsletter_deliveries.description` always NULL, read only as fallback; `newsletter_deliveries.last_error`/`sent_at` never read by the API.
- Query keys: every key's first element is the fetched URL (news.tsx custom queryFn).
- Enums consistent both sides: EVENT_TYPES, contact subjects, yearly categories (0014), delivery states (0017), SIGNUP_ERROR_CODES, media codes.

## 2. Findings

### TRACE-1 Server `error` text reaches users untranslated in most mutation toasts
Area: TRACE · Severity: Medium · Confidence: CONFIRMED · Verified: static
Where: `client/src/lib/queryClient.ts:15` (ApiError.message = body.error); callers login-modal.tsx:47, password-change-modal.tsx:45, contact.tsx:185, newsletter-signup.tsx:55, event-creation-modal.tsx:319, file-upload-modal.tsx:144, staff-users-section.tsx:65,90, yearly-calendar-entry-modal.tsx:186,207, yearly-calendar-import-modal.tsx:343,397, messages.tsx:133, settings.tsx:415, calendar-editor-tools.tsx:114
Evidence: callers render `error.message || t.…` (translation only when body empty). Server bodies are fixed English strings with no `code` (auth.js:124,161,184,267-273,295; contact.js:53,78,92,264; events.js:263-280; upload.js:93-177; secure-settings.js:571-595); some Norwegian-only (secure-settings.js:663,676). Import modal regex-matches Norwegian text (import-modal.tsx:185-207); EXISTING_NOT_FOUND (yearly-calendar.js:184) and decision errors English, untranslated in NO.
Cause → Impact: only signup, Turnstile, media and hasRegistrations key off `code`, contrary to AGENTS.md ("never matches the `error` text"). Norwegian parent sees "Invalid credentials"/"Too many messages. Try again later."; English-UI admin sees "Brukernavnet er allerede i bruk". The i18n ratchet cannot see server strings.
Fix: stable `code`s for user-reachable refusals mapped to `t.*`. · Test: handler suites assert `code` + client-invariants guard. · Regression risk: low.
Scope: all non-signup mutations. Tests: registrations-handler (signup codes only).

### TRACE-2 Registrations GET returns `200 {count}` to an expired council session under an array-typed key
Area: TRACE · Severity: Medium · Confidence: HIGH (contract) / POSSIBLE (timing) · Verified: static
Where: `api/registrations.js:232-277` → `event-registrations-view.tsx:35,137,160`; `attendee-tooltip.tsx:27,43`
Evidence: `isCouncilMember` needs a valid session (:233), otherwise `json({count})` (:277). Both components use key `/api/registrations?eventId=${id}` typed `EventRegistration[]` and call `.reduce`/`.map` unguarded. JWT lives 2 h (auth.js:94); `useAuth` re-checks every 15 min or on focus (useAuth.ts:21-22). 200 status → `notifyUnauthorized` (queryClient.ts:55) never fires.
Cause → Impact: expired council member opens "Påmeldte" or the tooltip refetches → TypeError → top-level ErrorBoundary (main.tsx:36) replaces the whole SPA. Same when a password change is pending.
Fix: 401 when an invalid/expired session cookie is presented (keep `{count}` for anonymous), or explicit `?view=council` with `requireRole`; `Array.isArray` guard client-side. · Test: harness with expired JWT. · Regression risk: low (`{count}` has no consumer).
Dependencies: F-02. Tests: registrations-handler, read-error-ui.test.mjs:24.

### TRACE-3 Retention casts text dates; one bad legacy value fails the retention stage daily
Area: TRACE · Severity: Medium · Confidence: POSSIBLE · Verified: static
Where: `api/cron/event-reminders.js:530-552` (`created_at::timestamptz`, `e.date::date`)
Evidence: both columns text (schema.ts:22,117); events.js:192-196 says "neste fredag" and 2026-02-31 were stored historically; migration 0018 leaves non-NOW() values as-is (0018:12-14). A failed cast aborts the DELETE; the stage is isolated (:682-690) so the run 500s every day.
Cause → Impact: GDPR deletion of registrations/cancellations/contact messages stops; only a `cron.stage_failed` log shows it.
Fix: regex-guard the casts or compare against an ISO text cutoff as events.js:80,113 does; report query for non-ISO rows. · Test: integration with a bad-date row. · Regression risk: low.

### TRACE-4 `schema.ts` omits migration-only objects the handlers depend on
Area: TRACE · Severity: Medium · Confidence: POSSIBLE · Verified: static
Where: `migrations/0001:8,14` vs `shared/schema.ts:60-69`; `package.json:17` `db:push`
Evidence: unique index `(event_id, lower(email))` is what makes signup's `ON CONFLICT DO NOTHING` (registrations.js:510-516) catch concurrent duplicates (`NOT EXISTS` reads the pre-lock snapshot); not declared in schema.ts. `registered_at DEFAULT NOW()::text` stores non-ISO text in production (0018 missed it); in CI the Drizzle base table is created first so 0001's ADD COLUMN is a no-op and new rows get NULL (postgres-fixture.mjs:89-102) → CI ≠ production. CHECKs and the 0010 partial index are migration-only (CHECKs documented deliberate, subsystems.md:157-159). Conversely schema.ts declares indexes no migration creates (see perf ambiguities).
Cause → Impact: documented `npm run db:push` plausibly drops the index → concurrent duplicate signups both insert and double-count capacity. `registered_at` violates the ISO rule and orders differently in CI.
Fix: declare the index and an ISO default in schema.ts, backfill migration, declare CHECKs via `check()` or retire `db:push`. · Test: integration asserts index + ISO format. · Regression risk: medium.

### TRACE-5 Kindergarten info: GET reads the newest row, PUT updates the oldest
Area: TRACE · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: `api/secure-settings.js:425-430` vs `:479`; no single-row constraint (schema.ts:216)
Impact: with two rows the admin's save appears to revert; homepage shows the other row.
Fix: one selector or enforce a single row. · Test: harness with two rows. Tests: secure-settings-handler.test.mjs:18,96.

### TRACE-6 Outbound mail prints raw stored values
Area: TRACE · Severity: Low · Confidence: CONFIRMED · Verified: unit (probe)
Where: `api/cron/event-reminders.js:138,155`; `api/contact.js:188,198`
Evidence: probe printed `Fototidspunkt: ["09:00","09:10"]` with no child names; council notification shows raw enum `concern` though `contactSubjectLabel` (contact-emails.js:22) exists.
Fix: `resolvePhotoSlotsForRegistration` paired with names as registrations.js:684-686 does; `contactSubjectLabel`. · Tests: event-reminders.test.mjs:21 (photoSlots null only).

### TRACE-7 Resources without `map*` return raw/ad-hoc shapes that drift from client types
Area: TRACE · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: documents.js:50-71,122-126; upload.js:196-201; contact.js:123-127,168; registrations.js:627; auth.js:211-218 vs :353-359
Evidence: document list returns `fileUrl` but client `Document` type (schema.ts:380) declares `cloudinaryUrl`/`uploadedBy`; upload/delete return snake_case rows; contact POST echoes the full row incl. PII to the submitter; login returns `id`, me returns `userId`.
Impact: harmless today, types are wrong. Fix: `mapDocument`/`mapRegistration` + wire types; contact POST returns `{success}`; login returns `userId`.

### TRACE-8 Cache-invalidation gaps after public registration changes
Area: TRACE · Severity: Low · Confidence: CONFIRMED · Verified: static
Where: registration-cancel.tsx:176-184 (cancel: no invalidation); event-registration-modal.tsx:112-113 (signup misses council `/api/registrations?eventId=` key)
Impact: seat counts/"full" state stale up to 5 min (staleTime, queryClient.ts:162). Fix: invalidate `['/api/events']` after cancel and eventId-prefixed keys after signup.

### TRACE-9 Documents outside the upload-flow shape can't be managed
Area: TRACE · Severity: Low · Confidence: POSSIBLE · Verified: static
Where: documents.js:96 (`new URL(null)` → 500; download treats null as 404 at :31); upload.js:171 (default category 'annet'); files.tsx:42,124 (UI shows only protokoll/vedtekter/budsjett)
Impact: legacy/other-category rows invisible and undeletable in the UI but still in the public list; URL-less row 500s on delete.
Fix: handle null URL in DELETE; validate category server-side or show "other" in the UI.

### TRACE-10 Media quota and file-count checks are not race-safe despite the comment
Area: TRACE · Severity: Low · Confidence: HIGH · Verified: reasoned
Where: media.js:342-360 (same root cause as INPUT-3). Client is currently sequential (media-shares.tsx:262) → low risk.

## Blocked/unverified
- No live Vercel/Neon/Cloudinary/R2 (presign, multipart ETag CORS exposure)/Gmail/Turnstile; F-07, F-13–F-15 traced to the call site only.
- `npm run test:integration` not run (TRACE-3, -4, -10 reasoned). `drizzle-kit push` not executed (TRACE-4).
- Production data unknown (TRACE-3, -5, -9). TRACE-2 crash not observed in a browser.

## Positive findings
- Signup one atomic CTE (lock, capacity, insert, slot reservation, single counter write); all 15 signup codes translated and routed to fields.
- Cancel one statement (delete, archive, counter release); CASCADEs agree between schema.ts and 0009/0016.
- Read paths derive attendee counts; cron reconcile race-safe (event-reminders.js:479-497).
- Newsletter outbox end to end: unique rows, SKIP LOCKED leases, source-eligibility re-check, row-based stamping, states match 0017 CHECK.
- Every client URL and e-mail link resolves; share-id format agrees across vercel.json, link-preview, calendar-entries.
- Query keys/invalidations consistent; optimistic delete rolls back both caches.
- Media share contract typed end to end (mapShare/mapSharedFile match schema.ts; codes identical in shared/media.js, media.d.ts, clients).
- Write-side dates ISO; cancel windows use Europe/Oslo.

## Ambiguities
- A-1: date change doesn't reset `newsletter_sent_at` (events.js:345-360, yearly-calendar.js:438-460) → moved event never gets a reminder for its new date.
- A-2: second open of confirm link → 400/error page though address active; confirm tokens never expire; pending subscribers never purged.
- A-3: contact replies always Norwegian; no language stored on the message.
- A-4: import update leaves `category`, `start/end_time`, `notify_newsletter` untouched when `entry_type` changes.
- A-5: blog `publishedDate` unvalidated; mixes date-only and ISO.
- A-6: date-only strings parsed with `new Date()` and formatted without `timeZone` (registrations.js:678,739; event-reminders.js:112,177; registration-cancel.tsx:205) — correct only while server is UTC and browsers in Europe.
- A-7: media.js uses code `NOT_DRAFT` for "not published" (:252, :524).
- A-8: 01-inventory claimed an events GET-by-id branch that does not exist (corrected).
