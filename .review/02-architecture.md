# 02 — Architecture map (as built)

## Boundaries
```
Browser SPA (client/src)            ──fetch, credentials:include, X-CSRF-Token──▶  Vercel edge (vercel.json headers/CSP/rewrites)
  TanStack Query (key[0] = URL)                                                   │
  SafeHtml = DOMPurify re-sanitize                                                 ▼
                                                             api/*.js  withApiHandler → requireRole/requireCsrf → sanitize* → sql`…` → map*(row)
                                                               │            │                     │
                                                    api/_shared/ (auth, rate-limit, email, delivery, log, sentry, cloudinary)
                                                               │
                        ┌──────────────────────────────────────┼──────────────────────────────┐
                        ▼                                      ▼                              ▼
             Neon PostgreSQL (HTTP, one            Gmail SMTP (nodemailer)          Cloudinary (signed direct
             statement = one transaction)                                              upload; Admin API verify/destroy)
                        ▲
             Vercel Cron 07:00 / 19:00 UTC → api/cron/event-reminders.js (Bearer CRON_SECRET)
```

- **Trust boundary 1 (browser → API):** all input untrusted; UI guards (`client/src/App.tsx` route wrappers) are convenience only. Server authorization = `requireRole` (JWT verify + DB `token_version` + password-policy gate) in each handler.
- **Trust boundary 2 (capability links):** registration `cancel_token`, newsletter `confirm_token`/`unsubscribe_token` travel in email only and authorize without session/CSRF.
- **Trust boundary 3 (Cloudinary):** browser uploads straight to Cloudinary with a server signature; the server re-verifies the asset via Admin API before persisting a `documents` row.
- **Trust boundary 4 (cron):** bearer secret; can run retention DELETEs and mail fan-out; `?date=` caller-controlled once authorized.
- **Data boundary:** DB snake_case ↔ API camelCase via one `map*` per resource (`mapEvent`, `mapEntry`, `mapBlogPost`…); several GET paths alias columns inline instead (documents, blog-posts GET, registrations, contact-messages).
- **No cross-module cycles:** `api/*` → `api/_shared/*` → `shared/*.js`; `shared/schema.ts` is client-only. `shared/*.js` imported by both tiers.

## State machines (hidden side effects)
| Object | States / transitions | Writers |
|---|---|---|
| `events.status` | active → cancelled (PATCH `?action=cancel`); DELETE only when no registrations | `api/events.js` |
| `events.current_attendees` | +n on signup (same statement, `FOR UPDATE`), −n on council DELETE and token cancel; reconciled nightly | `api/registrations.js`, cron `reconcileEventAttendeeCounts` |
| `event_registrations.reminder_*` | claimed_at lease 10 min → sent_at stamped | cron `sendEventReminders` |
| `newsletter_subscribers.status` | pending → active (confirm) → unsubscribed; re-subscribe re-arms pending | `api/contact.js` |
| `newsletter_deliveries.status` | pending → processing (claim, attempts+1) → sent / skipped / pending(retry) / **failed (after 5)**; deferred back to pending | cron `broadcastNewsletter` |
| `events/yearly_calendar_entries/blog_posts.newsletter_sent_at` | stamped once no delivery row for the item is pending/processing | cron |
| `users.token_version` | +1 on logout and password change (revokes all sessions) | `api/auth.js` |
| Retention | contact_messages > 12 months, registrations/cancellations 6 months after event date; delivery history 90 days; rate-limit rows 7 days after window | cron `runMorningTasks` |

## Key flows
| ID | Flow (forward) | Return / error path |
|---|---|---|
| F-01 Login | `login-modal.tsx` → `apiRequest POST /api/auth?action=login` → `auth.js handleLogin` → `requireCsrf` → 3× `checkRateLimit` (UPSERT `api_rate_limits`) → `SELECT … FROM users WHERE username=` → bcrypt compare (dummy hash when absent) → `jwt.sign` → `Set-Cookie jwt, csrf-token` | 401 invalid creds, 429 + Retry-After, 500 config; client stores user in `['/api/auth']` cache |
| F-02 Session check | every protected handler → `requireRole` → `parseAuthToken` (cookie or Bearer) → `jwt.verify` (HS256, iss/aud) → `SELECT … FROM users WHERE id` → token_version match → password policy | 401 → `queryClient` clears auth cache (`recoverSession`); 403 `PASSWORD_CHANGE_REQUIRED` |
| F-03 Public signup | `event-registration-modal.tsx` → `POST /api/registrations` → oversized-field guard → IP limit → sanitize → `email_domain_blacklist` lookup → per-(IP,event,email) limit → event SELECT → (foto) `assignPhotoSlots` from snapshot → single CTE: `FOR UPDATE` event, capacity check, INSERT registration (`ON CONFLICT DO NOTHING`), INSERT `photo_event_slots`, UPDATE `current_attendees` → `waitUntil(sendEventConfirmationEmail)` | 400 capacity/duplicate/deadline, 404 inactive, 409 slot race after 3 tries, 429; 201 body minus `cancel_token` |
| F-04 Token cancel | email link → `/avmelding?token` → `registration-cancel.tsx` → `POST ?action=cancel-lookup` (read) → `POST ?action=cancel` → CTE DELETE registration (date ≥ Oslo today) + INSERT cancellation copy + UPDATE counter | 400 bad token, 404 not found/closed, 429 |
| F-05 Council event CRUD | `event-creation-modal.tsx` → POST/PUT `/api/events` → `requireRole(COUNCIL)` → `requireCsrf` → validate date/time/capacity/deadline/type → INSERT/UPDATE `RETURNING` → `mapEvent`; DELETE via materialized CTE guarded by `has_registrations` + FK RESTRICT | 400 validation, 404, 400 has registrations (also FK 23503 race) |
| F-06 Registration admin | `event-registrations-view.tsx` → GET `/api/registrations?eventId` (PII only if council) / `?cancelled=1` → DELETE `?id` (CTE delete + counter) | public caller gets `{count}` |
| F-07 Document upload | `file-upload-modal.tsx` / `RichTextEditor.tsx` → `POST /api/upload?action=sign` (validate name/mime/size, sign folder+public_id+allowed_formats) → browser → Cloudinary `auto/upload` → `POST /api/upload` (verify URL host/cloud/type/public_id, Admin API `resource`, provider format/size) → INSERT `documents` | 400 on each mismatch; orphaned Cloudinary asset if step 3 never happens |
| F-08 Document list/download/delete | `files.tsx` → GET `/api/documents` (public, LIMIT 500, includes `uploadedBy`) → `?action=download` 302 to stored URL; DELETE → re-verify stored URL → Cloudinary `destroy` → DELETE row | provider failure keeps row (retryable) |
| F-09 Contact form | `contact.tsx` → `POST /api/contact` → honeypot → size guard → IP limit → sanitize → per-identifier limit → INSERT `contact_messages` → `waitUntil` notify FAU + acknowledgement to sender | 201 returns the stored row |
| F-10 Contact reply | `messages.tsx` → `POST /api/secure-settings?resource=contact-messages&id` (COUNCIL+CSRF) → SELECT original → `sendEmail` → UPDATE status/responded_* | 502 on SMTP failure (row untouched) |
| F-11 Newsletter subscribe/confirm/unsubscribe | `newsletter-signup.tsx` / `newsletter.tsx` → `POST /api/contact?action=newsletter-*` → rate limits → UPSERT-ish (SELECT then UPDATE/INSERT) subscriber → confirmation mail; confirm/unsubscribe by token | always generic 200 for subscribe/unsubscribe |
| F-12 Newsletter broadcast (evening cron) | Vercel Cron → `GET /api/cron/event-reminders?task=newsletter` → fan-out INSERT…SELECT due items × active subscribers → claim ≤300 (`SKIP LOCKED`) → per row: build mail → `sendWithDeadline` → UPDATE sent / pending(backoff) / failed → stamp source items → count remaining | worker errors aggregated → handler 500 → Sentry |
| F-13 Morning cron | `GET /api/cron/event-reminders` → retention DELETEs → reconcile counters → rate-limit + delivery-history cleanup → registration reminders (claim ≤100 loops) | stage errors aggregated → 500 |
| F-14 Public reads | `home.tsx`, `calendar.tsx`, `news.tsx`, `/kalender.ics` → GET events (all, correlated SUM subquery), yearly-calendar by school year, blog-posts (≤500 with full HTML by default), kindergarten-info, board-members | 200 JSON / text/calendar |
| F-15 Yearly-calendar edit/import | `yearly-calendar-entry-modal.tsx`, `yearly-calendar-import-modal.tsx` → POST/PUT/DELETE `/api/yearly-calendar` (admin/member/staff + CSRF), `preview-import` / `commit-import` (≤500 rows, one statement per row) | per-row error summary |
| F-16 User admin | `staff-users-section.tsx` → `/api/secure-settings?resource=users` (ADMIN) → create member/staff with temp password emailed; delete member/staff | user row deleted again if the welcome email fails |
