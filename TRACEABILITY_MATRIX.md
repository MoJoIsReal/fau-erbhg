# Traceability Matrix — FAU Erdal Barnehage

**Review date:** 2026-09-18 · **Commit:** `0b38ac5` · Companion to [`REPO_REVIEW.md`](REPO_REVIEW.md)

Each row traces one user-facing flow through every layer:

```
UI element → event handler → client call → HTTP method+URL → handler branch → SQL/table
           → response mapping → TanStack Query cache → rendered UI,  plus the error path
```

Cross-layer compatibility was checked for field names (DB `snake_case` vs API `camelCase` vs
client usage), identifiers, types, nullability, enum values, date/time semantics, status
codes and response schemas. Every difference was classified as deliberate, harmless or
defective rather than merely listed.

**Status legend** — `PASS` contract holds end to end including the error path ·
`PARTIAL` works but has a named defect or unhandled state · `FAIL` a broken link, named
explicitly · `UNVERIFIED` cannot be proven without a deployment · `DEAD` implemented with no
reachable caller · `ORPHANED` handler branch with no client caller.

**Totals: 57 flows — 46 PASS · 7 PARTIAL · 3 FAIL · 1 UNVERIFIED · 1 DEAD · 2 ORPHANED.**

| Trace | Feature | UI location | UI handler | Client call | Endpoint | Handler branch | SQL / table | Auth | Validation | Error path | Return mapping | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TR-01 | Events list (public) | events.tsx:103 / calendar tab | `useQuery` | default queryFn | `GET /api/events` | events.js:104-113 | `SELECT * FROM events WHERE status IN ('active','cancelled')` | public | — | throws→`data=[]` empty state | `mapEvent` camelCase | PASS | matches `Event` type exactly |
| TR-02 | Create event | event-creation-modal.tsx:265 | RHF+zod submit | `apiRequest POST` | `POST /api/events` | events.js:120-165 | `INSERT … RETURNING *` | COUNCIL + CSRF | title/date/time, `EVENT_TYPES`, deadline ISO | `onError` toast (NO-only) | `mapEvent`, body discarded | PASS | MAINT-4 |
| TR-03 | Edit event | event-creation-modal.tsx:263 | same | `apiRequest PUT` | `PUT /api/events?id=` | events.js:167-224 | `UPDATE … RETURNING *` | COUNCIL + CSRF | same + 404 | `onError` toast (NO-only) | `mapEvent`, discarded | PASS | `toIsoDateTime` → UTC ISO; `toDateTimeLocalInputValue` reverses it correctly |
| TR-04 | Cancel event | events.tsx:135 | `cancelMutation` | `apiRequest PATCH` | `PATCH /api/events?id=&action=cancel` | events.js:226-246 | `UPDATE status='cancelled' RETURNING *` | COUNCIL + CSRF | id int, 404 | `onError` toast | `mapEvent`, discarded; invalidate `/api/events` | PASS | |
| TR-05 | Delete event | events.tsx:107 | `deleteMutation` | `apiRequest DELETE` | `DELETE /api/events?id=` | events.js:248-311 | CTE `target/deleted`, FK 23503 catch | COUNCIL + CSRF | id int | `getApiErrorBody()?.hasRegistrations` → specific toast; else generic | `{success,message}` | PASS | best error handling in the codebase; 400/404/409 all reach a toast |
| TR-06 | iCalendar feed | calendar-subscribe.tsx:42-44 | copy / webcal / Google link | browser (not `apiRequest`) | `GET /kalender.ics[?lang=en]` → rewrite → `/api/events?format=ics` | events.js:100-102 → :56-90 | events + `yearly_calendar_entries` (`day_event`,`closed`), 1-year cutoff | public | `lang` normalised to no/en | n/a (calendar app) | `buildCalendarFeed` text/calendar | **UNVERIFIED** | TRACE-7: `?lang=en` survival through the Vercel rewrite not provable locally |
| TR-07 | Public event signup | event-registration-modal.tsx:79 | RHF + `insertEventRegistrationSchema` | `apiRequest POST` | `POST /api/registrations` | registrations.js:91-355 | blacklist check, rate limit, capacity+insert+photo-slot CTE | **public, no CSRF** (deliberate) | sanitize name/email/phone/count, children JSON, deadline, capacity | substring-matched toasts + `form.setError` | raw snake_case row, discarded | PARTIAL | MAINT-5 (string matching); TRACE-6 (registrations key not invalidated) |
| TR-08 | Council registrations list | event-registrations-view.tsx:34 | `useQuery` | default queryFn | `GET /api/registrations?eventId=` | registrations.js:69-79 | `SELECT … ORDER BY registered_at DESC` | council via `parseAuthToken` | eventId int | throws→`[]` | aliased camelCase | PASS | |
| TR-09 | Delete registration | event-registrations-view.tsx:38 | `deleteRegistrationMutation` | `apiRequest DELETE` | `DELETE /api/registrations?id=` | registrations.js:357-395 | CTE delete + `current_attendees` decrement | COUNCIL + CSRF | id int, 404 | toast + **partial** rollback | `{success:true}` | **FAIL** | **TRACE-3** — `["/api/events"]` optimistic decrement never rolled back |
| TR-10 | Public attendee count | — | — | — | `GET /api/registrations?eventId=` (anon/staff) | registrations.js:81-89 | `SUM(attendee_count)` | public | — | — | `{count:number}` | **DEAD** | no caller; MAINT-2 crash risk if role state goes stale |
| TR-11 | Documents list | files.tsx:70, admin.tsx:63 | `useQuery` | default queryFn | `GET /api/documents` | documents.js:41-64 | `SELECT … LIMIT 500` | public | — | `error` destructured in files.tsx | aliased camelCase (`fileUrl`…) | PASS | MAINT-3: `Document` type says `cloudinaryUrl` |
| TR-12 | Upload document | file-upload-modal.tsx:86,119 | 3-step mutation | `apiRequest POST` ×2 + raw `fetch` to Cloudinary | `POST /api/upload?action=sign` → Cloudinary → `POST /api/upload` | upload.js:48-88 / :89-197 | `INSERT … RETURNING *` | COUNCIL + CSRF (both steps) | ext+MIME+size client & server, cloud_name, `fau-documents/`, provider re-check | `onError` toast | `{success,document:rawRow,fileUrl,publicId}`, discarded | PASS | strongest validation chain in the app |
| TR-13 | Download document | files.tsx:263,364 | `window.open` | none (browser nav) | `GET /api/documents?action=download&id=` | documents.js:14-37 | `SELECT cloudinary_url` | public (by design) | id required, 404 ×2 | new tab shows JSON 404 | `302` redirect | PASS | a 404 lands as raw JSON in a new tab — cosmetic |
| TR-14 | Delete document | files.tsx:75 | `deleteDocumentMutation` | `apiRequest DELETE` | `DELETE /api/documents?id=` | documents.js:66-108 | `DELETE … RETURNING` + Cloudinary destroy | COUNCIL + CSRF | id int, 404 | `onError` toast (NO-only) | `{success,message,deletedDocument}` | PASS | MAINT-4 |
| TR-15 | Contact form | contact.tsx:103,111 | RHF + `insertContactMessageSchema` | `apiRequest POST` | `POST /api/contact` | contact.js:32-146 | `INSERT contact_messages RETURNING *` | public, no CSRF | honeypot, subject enum, anon rules, rate limit | `onError` toast | 201 raw row / **204** honeypot | PASS | 204 is `res.ok` → success toast for bots, deliberate |
| TR-16 | Newsletter subscribe | newsletter-signup.tsx:21 | form submit | `apiRequest POST` | `POST /api/contact?action=newsletter-subscribe` | contact.js:189-263 | upsert `newsletter_subscribers` status `pending` | public | honeypot, email, rate limit | `onError` toast | `{success:true}` (always, non-enumerable) | PASS | |
| TR-17 | Newsletter confirm | newsletter.tsx:49 (`?bekreft=`) | `useEffect` + ref guard | `apiRequest POST` | `POST /api/contact?action=newsletter-confirm` | contact.js:266-298 | `UPDATE … status='active' WHERE confirm_token=` | public token | 64-hex regex, IP limit | `.catch → setStatus("error")` + StatusCard | `{success:true}` / 400 | PASS | double-effect guarded by `handled.current` |
| TR-18 | Newsletter unsubscribe | newsletter.tsx:49 (`?avmeld=`) | same | `apiRequest POST` | `POST /api/contact?action=newsletter-unsubscribe` | contact.js:301-331 | `UPDATE … status='unsubscribed'` | public token | 64-hex regex, IP limit | same | `{success:true}` always | PASS | idempotent by design |
| TR-19 | Subscribers admin list | newsletter-subscribers-section.tsx:38 | `useQuery` | default queryFn | `GET /api/secure-settings?resource=newsletter-subscribers` | secure-settings.js:571-580 | `SELECT … ORDER BY created_at DESC` | ADMIN_ONLY | — | throws→`[]` | aliased camelCase | PASS | |
| TR-20 | Delete subscriber | newsletter-subscribers-section.tsx:44 | `deleteMutation` | `apiRequest DELETE` | `…&resource=newsletter-subscribers&id=` | secure-settings.js:584-595 | `DELETE … RETURNING id` | ADMIN_ONLY + CSRF | id int, 404 | `onError` toast ✔ | `{success:true}` | PASS | dead `res.status!==204` guard, harmless |
| TR-21 | Homepage posts | home.tsx:73 | `useQuery` | default queryFn | `GET /api/secure-settings?resource=blog-posts` | secure-settings.js:159-167 | `WHERE status='published' LIMIT 500` | public | — | throws→`[]` | aliased camelCase | PASS | filtered client-side on `showOnHomepage !== false` |
| TR-22 | News / Tips list | news.tsx:82 | `useInfiniteQuery` + "Last flere" | **custom** queryFn w/ limit+offset | `GET …&category=…&limit=10&offset=N` | secure-settings.js:136-170 | `LIMIT/OFFSET`, category whitelist | public | limit 1..100, offset ≥0 | `isError` → error Card ✔ | aliased camelCase | PASS | one of only two pages with a real error branch |
| TR-23 | News permalink | news-post.tsx:31 | `useQuery` + `.find()` | default queryFn | `GET /api/secure-settings?resource=blog-posts` | secure-settings.js:159-167 | up to 500 full posts | public | — | not-found Card ✔ | aliased camelCase | PARTIAL | **PERF-1** — whole list fetched to render one post |
| TR-24 | Admin post list | content.tsx:79, admin.tsx:57 | `useQuery` | default queryFn | `…&resource=blog-posts&includeArchived=true` | secure-settings.js:145-157 | all statuses | COUNCIL (inside GET) | — | throws→empty state | aliased camelCase | PARTIAL | TRACE-1: empty state masks a 401 |
| TR-25 | Create / edit post | content.tsx:99,106 | `savePost` | `apiRequest POST/PUT` | `…&resource=blog-posts[&id=]` | secure-settings.js:176-247 | `INSERT/UPDATE … RETURNING *` | COUNCIL + CSRF | title+content, category & status enums | `catch` → toast | **raw snake_case**, written into state | **FAIL** | **TRACE-2** |
| TR-26 | Archive / homepage toggle | content.tsx:196,220 | `updatePostMutation` | `apiRequest PUT` | `…&resource=blog-posts&id=` | secure-settings.js:199-247 | `UPDATE … RETURNING *` | COUNCIL + CSRF | `published_date = publishedDate \|\| now` | `catch` → toast | raw row, discarded | PARTIAL | sends the whole post back; after TR-25 the date can be reset to today |
| TR-27 | Delete post | content.tsx:113 | `deletePost` | `apiRequest DELETE` | `…&resource=blog-posts&id=` | secure-settings.js:249-262 | `DELETE FROM blog_posts` | COUNCIL + CSRF | id required | `catch` → toast ✔ | `{message}` | PASS | no 404 when id doesn't exist (silent success) |
| TR-28 | Yearly calendar view | yearly-calendar.tsx:470, useUpcomingItems.ts:36,39 | `useQuery` | default queryFn | `GET /api/yearly-calendar?schoolYear=` | yearly-calendar.js:173-181 | `SELECT … WHERE school_year=` | public | schoolYear int, 400 | throws→`[]` | `mapEntry` camelCase | PASS | `showOnHomepage`/`showForParents`/`notifyNewsletter` null-coalesced to `false` in `mapEntry` — correct nullable-boolean handling |
| TR-29 | Create entry | yearly-calendar-entry-modal.tsx:146 | modal submit | `apiRequest POST` | `POST /api/yearly-calendar` | yearly-calendar.js:340-358 | `INSERT … RETURNING *` | `YEARLY_CALENDAR_EDITORS` + CSRF | `sanitizeEntryPayload`: type/colour/week/date/`HH:MM` | `onError` toast | `mapEntry` 201, discarded | PASS | payload keys ↔ `mapEntry` keys line up exactly |
| TR-30 | Edit entry | yearly-calendar-entry-modal.tsx:143 | modal submit | `apiRequest PUT` | `PUT /api/yearly-calendar?id=` | yearly-calendar.js:361-398 | `UPDATE … RETURNING *` | same | same + 404 | `onError` toast | `mapEntry` | PASS | |
| TR-31 | Drag-move entry | yearly-calendar.tsx:495 `handleDragEnd` | dnd-kit `onDragEnd` | `apiRequest PUT` | `PUT /api/yearly-calendar?id=` | yearly-calendar.js:361-398 | `UPDATE` | same | type-change resets `showOnHomepage`/`notifyNewsletter` (deliberate) | snapshot + **full rollback** + toast ✔ | `mapEntry`, discarded; `onSettled` invalidate | PASS | the correct optimistic pattern; contrast TR-09 |
| TR-32 | Delete entry | yearly-calendar-entry-modal.tsx:166 | modal delete | `apiRequest DELETE` | `DELETE /api/yearly-calendar?id=` | yearly-calendar.js:400-411 | `DELETE … RETURNING id` | same | id int, 404 | `onError` toast | `{success:true}` | PASS | |
| TR-33 | Excel import — preview | yearly-calendar-import-modal.tsx:326 | file pick → preview | dynamic import parser + `apiRequest POST` | `POST /api/yearly-calendar?action=preview-import` | yearly-calendar.js:191-210 | reads existing entries, no write | editors + CSRF | ≤500 rows, per-row text sanitize | `onError` toast ✔ | `{rows:[{status,defaultAction,existing,…}]}` | PASS | parser dynamically imported |
| TR-34 | Excel import — commit | yearly-calendar-import-modal.tsx:364 | "Import" | `apiRequest POST` | `POST /api/yearly-calendar?action=commit-import` | yearly-calendar.js:212-332 | per-row `INSERT`/`UPDATE … RETURNING *` | editors + CSRF | server re-runs the preview + `existingId` must match | per-row errors → partial-import toast ✔ | `{created:[mapEntry],updated:[…],ignored,errors}` | PASS | server re-derives the decision rather than trusting the client |
| TR-35 | Yearly calendar PDF | yearly-calendar.tsx:594 | `downloadPdf` | client-only, dynamic import | — | — | — | — | — | `catch` → toast ✔ | Blob download | PASS | 1.19 MB chunk correctly split out |
| TR-36 | Excel template | yearly-calendar.tsx:619 | `downloadTemplate` | client-only, dynamic import | — | — | — | — | — | `catch` → toast ✔ | Blob download | PASS | |
| TR-37 | Users/staff list | staff-users-section.tsx:43 | `useQuery` | default queryFn | `GET /api/secure-settings?resource=users` | secure-settings.js:497-507 | `WHERE role IN ('member','staff')` | ADMIN_ONLY | — | throws→`[]` | aliased camelCase | PASS | |
| TR-38 | Create user | staff-users-section.tsx:49 | `createMutation` | `apiRequest POST` | `…?resource=users` | secure-settings.js:511-553 | `INSERT … RETURNING id,username,name,role` + email, rollback `DELETE` on send failure | ADMIN_ONLY + CSRF | email/name/role enum, duplicate check, email configured | `onError` toast ✔ | explicit column list (no drift) | PASS | account is deleted again if the invite email fails — correct |
| TR-39 | Delete user | staff-users-section.tsx:77 | `deleteMutation` | `apiRequest DELETE` | `…?resource=users&id=` | secure-settings.js:556-567 | `DELETE … RETURNING id` | ADMIN_ONLY + CSRF | id int, 404 | **none** | `{success:true}` | **FAIL** | **TRACE-4** — silent failure, no toast |
| TR-40 | `resource=staff-users` | — | — | — | `/api/secure-settings?resource=staff-users` | secure-settings.js:626-628 | → `handleUsers` | ADMIN_ONLY | — | — | — | **ORPHANED** | no client caller |
| TR-41 | Board members list | home.tsx:68, content.tsx:75, settings.tsx:66 | `useQuery` | default queryFn | `GET …?resource=board-members` | secure-settings.js:37-45 | `SELECT … sort_order as "sortOrder"` | public | — | throws→`[]` | aliased camelCase | PASS | |
| TR-42 | Save board members | settings.tsx:79,87 (`handleSave` loop) | Save button | `apiRequest POST`/`PUT` per row | `…?resource=board-members[&id=]` | secure-settings.js:56-107 | `INSERT`/`UPDATE … RETURNING *` | ADMIN_ONLY + CSRF | name+role required, sortOrder 0..1000 | one generic toast, loop aborts | **raw snake_case**, but **discarded** | PARTIAL | **TRACE-8** — partial write on mid-loop failure |
| TR-43 | Delete board member | settings.tsx:95 | `removeMember` | `apiRequest DELETE` | `…?resource=board-members&id=` | secure-settings.js:110-123 | `DELETE FROM fau_board_members` | ADMIN_ONLY + CSRF | id required | `catch` → toast ✔ | `{message}` | PASS | no 404 for a missing id |
| TR-44 | Kindergarten info read | home.tsx:81, settings.tsx:184 | `useQuery` | default queryFn | `GET …?resource=kindergarten-info` | secure-settings.js:267-281 | `ORDER BY id DESC LIMIT 1` | public | 404 when unseeded | throws→`undefined`, optional-chained | aliased camelCase | PASS | a 404 on an unseeded DB is indistinguishable from a network error client-side |
| TR-45 | Kindergarten info save | settings.tsx:196 | `saveKindergartenInfo` | `apiRequest PUT` | `PUT …?resource=kindergarten-info` | secure-settings.js:292-330 | `UPDATE … RETURNING *` | ADMIN_ONLY + CSRF | all six required fields sanitised, 404 | `catch` → toast ✔ | raw snake_case, **discarded** | PASS | dirty-flag from `JSON.stringify` compare |
| TR-46 | Messages list | messages.tsx:60, admin.tsx:51 | `useQuery` | default queryFn | `GET …?resource=contact-messages` | secure-settings.js:344-353 | `SELECT … ORDER BY created_at DESC` | COUNCIL | — | throws→`[]` empty inbox | aliased camelCase | PARTIAL | TRACE-1: a 401 renders as "no inquiries"; `admin.tsx:52` correctly gates with `enabled: isCouncil` |
| TR-47 | Message status | messages.tsx:66 | `updateStatusMutation` | `apiRequest PUT` | `…?resource=contact-messages&id=` | secure-settings.js:359-391 | `UPDATE …` (stamps `responded_by` only for `responded`) | COUNCIL + CSRF | status enum, 404 | `onError` toast ✔ | raw snake_case, **discarded** | PASS | |
| TR-48 | Reply to message | messages.tsx:111 | `replyMutation` | `apiRequest POST` | `POST …?resource=contact-messages&id=` | secure-settings.js:394-444 | send email **then** `UPDATE … RETURNING` aliased | COUNCIL + CSRF | reply length, recipient present, 502/503 | `onError` toast ✔ | explicit camelCase ✔ | PASS | only marks "responded" after Gmail accepts — correct ordering |
| TR-49 | Delete message | messages.tsx:88 | `deleteMutation` | `apiRequest DELETE` | `…?resource=contact-messages&id=` | secure-settings.js:447-459 | `DELETE FROM contact_messages` | COUNCIL + CSRF | id required | `onError` toast ✔ | `{message}` | PASS | |
| TR-50 | CSRF priming | login-modal.tsx:25 | inside login mutation | `apiRequest GET` | `GET /api/auth?action=csrf` | auth.js:44-53 | none | public | — | login `onError` toast | `{csrfToken}` + cookie | PASS | the only caller |
| TR-51 | Login | login-modal.tsx:26 | form submit | `apiRequest POST` | `POST /api/auth?action=login` | auth.js:56-148 | `SELECT … FROM users`, bcrypt, 3 rate limits | CSRF (from TR-50) | username+password, 401/429 | `onError` toast ✔ | `{user:{id,…},csrfToken}` — **discarded**, then `invalidate`+`refetch` `['/api/auth']` | PASS | body uses `id`, `GET /api/auth` uses `userId`; harmless because the body is never stored |
| TR-52 | Current user | useAuth.ts:16 (Layout) | mount | default queryFn | `GET /api/auth` | auth.js:311-315 → `handleMe` | `SELECT … WHERE id=` | cookie/Bearer | — | **`200 null`** when anonymous, so no 401 | `{userId,username,name,role,passwordChangeRequired}` | PARTIAL | **TRACE-1** — never refetches, so it cannot notice expiry |
| TR-53 | Logout | layout.tsx → `useAuth.logout` | click | `apiRequest POST` | `POST /api/auth?action=logout` | auth.js:151-186 | `token_version + 1`, clears both cookies | CSRF | — | **none** | `{success,message}` | **FAIL** | **TRACE-5** — silent no-op on failure |
| TR-54 | Forced password change | password-change-modal.tsx:28 (rendered by layout.tsx:569 on `user.passwordChangeRequired`) | form submit | `apiRequest POST` | `POST /api/auth?action=change-password` | auth.js:189-268 | bcrypt verify, `UPDATE … RETURNING` aliased, `token_version+1`, re-issues both cookies | auth + CSRF | ≥12 chars client & server, must differ, 400/404 | `onError` toast ✔ | `{user:{userId,…}}` → `setQueryData(['/api/auth'], data.user)` | PASS | the response's `userId` shape **matches** the GET shape — correct, unlike TR-51's body |
| TR-55 | `?action=me` | — | — | — | `GET /api/auth?action=me` | auth.js:312 | → `handleMe` | auth | — | — | — | **ORPHANED** | alias; clients use the bare GET |
| TR-56 | Editor image upload | RichTextEditor.tsx:205,240 | toolbar image button | `apiRequest POST` ×2 + Cloudinary `fetch` | `POST /api/upload?action=sign`, `POST /api/upload` | upload.js:48-197 | `INSERT documents` (category `editor-image`) | COUNCIL + CSRF | full upload chain (TR-12) | component-local | reads `data.fileUrl \|\| data.document?.cloudinary_url` | PASS | reads both shapes defensively — correct given the raw `RETURNING *` |
| TR-57 | Homepage "Hva skjer" / footer | home.tsx:64, layout.tsx:52, admin.tsx:70 | `useUpcomingItems` | 3 × default queryFn | `/api/events` + `/api/yearly-calendar?schoolYear={N,N+1}` | — | — | public | day-key dedupe, `closed` always shown | throws→`[]` | merged `UpcomingItem[]` | PASS | `new Date("YYYY-MM-DD")`=UTC vs local midnight is correct for UTC+1/+2; would misbehave west of UTC |

---

## Failures — the exact broken link

| Trace | Finding | The broken link |
|---|---|---|
| **TR-09** Delete registration | `TRACE-003` | `event-registrations-view.tsx:42-68` optimistically mutates **two** caches (`/api/registrations?eventId=` and `/api/events`) but snapshots only the first. `onError` (`:79-88`) restores only the first, and `invalidateQueries(["/api/events"])` appears only in `onSuccess` — there is no `onSettled`. A rejected delete therefore leaves the event card showing a decremented attendee count that is wrong until something else triggers a refetch; with `refetchOnWindowFocus: false` that may be never. |
| **TR-25** Create / edit blog post | `TRACE-002` | `api/secure-settings.js:189-197` and `:225-244` return raw `RETURNING *` rows (`published_date`, `show_on_homepage`, `notify_newsletter`, `newsletter_sent_at`) while the GET at `:137-168` aliases to camelCase. `content.tsx:175` writes that raw row straight into render state via `setPosts`. The four fields the card renders become `undefined`. The follow-on is the real damage: `content.tsx:228` then sends `{...post, showOnHomepage: !post.showOnHomepage}` back to the PUT, and `secure-settings.js:232` does `published_date = ${publishedDate \|\| now}` — **silently resetting the post's publish date to today**. |
| **TR-53** Logout | `TRACE-007` | `useAuth.ts:20-31` has no `onError`. `api/auth.js:154` returns `403 Invalid CSRF token` when the `csrf-token` cookie has expired — exactly the state a user is in when they still believe they are signed in. Clicking "Logg ut" then does nothing: no redirect, no toast, and `token_version` is never incremented, so the session is not revoked server-side. |

## Partials

| Trace | Why not PASS |
|---|---|
| **TR-07** Public event signup | `MAINT-013` — errors classified by substring-matching the message (`errorMessage.includes("already registered")`) when the server already returns `{error, category}` / `{error, suggestion}` and `getApiErrorBody()` exists to read them. `TRACE-008` — the council registrations list is not invalidated. |
| **TR-23** News permalink | `PERF-004` — fetches up to 500 full posts (each body capped at 50 000 chars) to render one article. |
| **TR-24** Admin post list | `TRACE-001` — a 401 after token expiry renders as the empty state *"Ingen innlegg ennå"*, so the blog looks deleted. |
| **TR-26** Archive / homepage toggle | Sends the whole post object back; after TR-25 has poisoned it with a raw row, the publish date resets to today. |
| **TR-42** Save board members | `TRACE-005` — a sequential `mutateAsync` loop with no per-item error handling. A mid-loop failure persists the prefix, skips the invalidation, and leaves the UI showing every row as saved. |
| **TR-46** Messages list | `TRACE-001` — a 401 renders as "no inquiries". Note `admin.tsx:52` gets this right with `enabled: isCouncil`; `messages.tsx:60` does not. |
| **TR-52** Current user | `TRACE-001` — `refetchOnWindowFocus: false`, `refetchInterval: false`, and the `Layout`-level query never remounts, so client auth state can never notice the 2 h expiry. |

## Unverified, dead and orphaned

| Trace | Status | Detail |
|---|---|---|
| **TR-06** iCalendar feed | `UNVERIFIED` | `?lang=en` reaches the handler only if Vercel merges an incoming query into a rewrite destination that already carries one (`vercel.json` → `/api/events?format=ics`). Not exercisable locally. If it does not merge, English subscribers silently get the Norwegian feed. Settle with `curl -s 'https://<preview>/kalender.ics?lang=en' \| head`. |
| **TR-10** Public attendee count | `DEAD` | `api/registrations.js:81-89` returns `{count}` for anonymous/staff callers. No client consumes it — `AttendeeTooltip` is rendered only under `canManageEvents`. Related to `MAINT-009`: the tooltip types the response unconditionally as `EventRegistration[]`, so if client role state goes stale (TRACE-001) it receives `{count: 3}` with status 200 and `registrations.map` throws during render, collapsing the app into the top-level ErrorBoundary. `= []` does not protect against this — the default applies only when `data` is `undefined`. |
| **TR-40** `?resource=staff-users` | `ORPHANED` | Routed to `handleUsers` at `api/secure-settings.js:626-628`; no client reference. Documented alias, harmless. |
| **TR-55** `?action=me` | `ORPHANED` | `api/auth.js:312`; every client call is a bare `GET /api/auth`. Harmless alias. |

## Reverse traceability

- **No client call to a non-existent endpoint or parameter.** Every `apiRequest` URL and every
  `queryKey[0]` in `client/src` maps to an implemented `action=` / `resource=` branch with a
  matching HTTP method.
- **No unused exports** in `client/src/lib` or `client/src/hooks` — `getCookie`,
  `getApiErrorBody`, `getApiErrorMessage`, `ApiError`, `formatDate`, `formatFileSize` and all
  five hooks have live callers.
- **One orphaned database table:** `site_settings` is declared in `shared/schema.ts:153` with
  an insert schema and a type, and has zero readers and zero writers anywhere in `api/`,
  `shared/` or `client/` (filed as `ARCH-001`; matches the open backlog item of the same name).

## Deliberate cross-layer differences, verified safe

These are differences a mechanical diff would flag. Each was checked and is **not** a defect:

- **`POST /api/auth?action=login` returns `{user: {id, …}}` while `GET /api/auth` returns
  `{userId, …}`.** The login body is never stored — the client invalidates and refetches — so
  the mismatch is inert. The change-password response, which *is* written to the cache via
  `setQueryData`, correctly uses the `userId` shape.
- **`GET /api/auth` returns `200 null` for an anonymous visitor rather than 401.** Handled
  correctly: `useAuth` receives `null`, `isAuthenticated` is `false`, and no 401 is ever thrown
  on that key.
- **`POST /api/contact` returns `204` for a honeypot hit**, which is `res.ok`, so bots receive a
  success toast. Deliberate.
- **`news.tsx:82` uses the key `[url, "paginated"]`.** Pagination works because it is a
  `useInfiniteQuery` with an **explicit** `queryFn` appending `&limit=&offset=`, so the default
  queryFn's "fetch `queryKey[0]` only" rule never applies. `getNextPageParam` matches the
  server's `LIMIT/OFFSET`; the server clamps `limit` to 1..100 and `PAGE_SIZE` is 10.
- **`content.tsx:89-94` enumerates four blog-post keys for invalidation.** This is *necessary*,
  not redundant: TanStack matches key elements, and `"…blog-posts"` does not prefix-match the
  different string `"…blog-posts&category=news"`. All four live keys are covered.
- **Client and server HTML allowlists are byte-identical on tags and schemes**, both rebuild
  iframe `src` through the *same shared* `youtubeEmbedSrc()`, and both drop a src-less iframe.
  Two asymmetries exist and are harmless: the client omits `target`/`rel` from `ALLOWED_ATTR`
  then re-adds them in a post-pass, and tolerates `title` on `img` which the server strips on
  write. **No content is kept by one side and dropped by the other**, so there is no
  "disappears on save" or "renders as a hole" case.
- **`mapEntry` null-coalesces `showOnHomepage` / `showForParents` / `notifyNewsletter` to
  `false`.** Correct handling of nullable booleans crossing the wire.
- **`useUpcomingItems` compares `new Date("YYYY-MM-DD")` (UTC) against local midnight.**
  Correct for UTC+1/+2; would misbehave only west of UTC, which is out of scope for this
  deployment.

## Coverage and limits

57 flows across 14 pages, 24 non-`ui` components and all 51 endpoint operations. Verified with
`npm run check` (passing, i18n ratchet 45/45) and `npm run build` (clean).

Not covered: anything requiring a running deployment (TR-06's rewrite behaviour), a browser
(focus order, reflow) or the production database (whether any flow's data is *already* in a
drifted state — see `DB-001`/`DB-002` in the main review).
