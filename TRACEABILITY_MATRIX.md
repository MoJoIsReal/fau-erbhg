# UI-to-Database Traceability Matrix

## Method and notation

This static audit followed every frontend API query/mutation and grouped purely
local controls (tabs, theme, filters, calendar navigation and exports). There is
no service/repository layer; `Controller / data access` therefore names the
serverless handler and its direct tagged SQL. `PASS` means the static signatures,
authorization, validation and return path agree; it does not imply a live Neon,
Cloudinary or Gmail test.

| ID | Feature / UI and handler | Client / HTTP | Controller / data access / DB | Input -> output; auth; validation; error/return | Status | Findings |
|---|---|---|---|---|---|---|
| TR-01 | Login modal submit | `apiRequest`, GET csrf then POST `/api/auth?action=login` | `auth.js`; users + api_rate_limits | credentials -> user; public+CSRF; generic 401; cache user | PASS | SEC-001/005/007 |
| TR-02 | Layout logout | POST `/api/auth?action=logout` | `auth.js`; increment users.token_version | no body -> success; auth+CSRF; cache cleared | PASS | — |
| TR-03 | Password modal | POST `/api/auth?action=change-password` | `auth.js`; users | old/new -> success; auth+CSRF+policy | PASS | SEC-001 |
| TR-04 | Events list/calendar | GET `/api/events` | `events.js`; events | none -> camelCase Event[]; public | PASS | — |
| TR-05 | Create/edit event modal | POST/PUT `/api/events[?id]` | `events.js`; events | Event form -> event; council+CSRF; sanitized | PASS | TRACE-005 |
| TR-06 | Cancel/delete event | PATCH cancel / DELETE `/api/events?id` | `events.js`; events + registration precheck | id -> event/success; council+CSRF | PASS | DB-004 |
| TR-07 | Public registration modal | POST `/api/registrations` | `registrations.js`; events + event_registrations CTE | registration -> row; rate limited and sanitized | PARTIAL | DB-002, SEC-002 |
| TR-08 | Registration list/export | GET `/api/registrations?eventId` | `registrations.js`; event_registrations | id -> rows for council, aggregate for public | PASS | — |
| TR-09 | Attendee tooltip | query key `['/api/events', id, 'registrations']` | default query fetches only `/api/events` | Event[] incorrectly read as registrations | FAIL | TRACE-001 |
| TR-10 | Delete registration | DELETE `/api/registrations?id` | `registrations.js`; DELETE registration then UPDATE event | id -> success; council+CSRF; optimistic rollback only covers HTTP failure | PARTIAL | DB-003 |
| TR-11 | Document list/download | GET `/api/documents`; GET download action | `documents.js`; documents; 302 Cloudinary | none/id -> metadata/redirect; public | PASS | SEC-003 |
| TR-12 | File/RichText upload | POST sign -> Cloudinary -> POST metadata | `upload.js`; provider API + documents | claimed metadata -> signed upload/document; council+CSRF | PARTIAL | SEC-003/004 |
| TR-13 | Delete document | DELETE `/api/documents?id` | `documents.js`; documents then Cloudinary destroy | id -> success; council+CSRF | PARTIAL | TRACE-007 |
| TR-14 | Contact form | POST `/api/contact` | `contact.js`; contact_messages + async Gmail | inquiry -> row; public, honeypot/rate limits | PARTIAL | SEC-002 |
| TR-15 | Newsletter signup | POST contact subscribe action | `contact.js`; subscriber upsert + Gmail | email/name/lang -> generic accepted | PASS | SEC-002 |
| TR-16 | Confirm/unsubscribe page | POST contact confirm/unsubscribe | `contact.js`; newsletter_subscribers | crypto token -> success; public rate limit | PASS | — |
| TR-17 | Home/news/public info | GET secure-settings board/blog/info | `secure-settings.js`; three content tables | filters -> published/public DTOs | PASS | — |
| TR-18 | Content CRUD | POST/PUT/DELETE blog resource | `secure-settings.js`; blog_posts | draft/id -> row/refetch; council+CSRF | PARTIAL | TRACE-005/006 |
| TR-19 | Board settings CRUD | POST/PUT/DELETE board resource | `secure-settings.js`; fau_board_members | member/id -> row/refetch; admin+CSRF | PARTIAL | TRACE-005/006 |
| TR-20 | Kindergarten settings | PUT kindergarten-info | `secure-settings.js`; kindergarten_info | full form -> row/refetch; admin+CSRF | PARTIAL | TRACE-005 |
| TR-21 | Messages list/status/reply/delete | secure-settings contact-messages methods | `secure-settings.js`; contact_messages + Gmail | status/reply/id -> message; admin+CSRF on writes | PARTIAL | TRACE-002/006, SEC-002 |
| TR-22 | Managed users | GET/POST/DELETE users resource | `secure-settings.js`; users + Gmail | account/id -> temporary credential; admin+CSRF | PASS | SEC-007 |
| TR-23 | Subscriber administration | GET/DELETE subscriber resource | `secure-settings.js`; newsletter_subscribers | id -> list/success; admin+CSRF | PASS | — |
| TR-24 | Yearly calendar/upcoming | GET `/api/yearly-calendar?schoolYear` | `yearly-calendar.js`; yearly_calendar_entries | year -> mapped entries; public | PASS | — |
| TR-25 | Calendar entry modal CRUD | POST/PUT/DELETE yearly-calendar | `yearly-calendar.js`; yearly_calendar_entries | entry/id -> row; authorized roles+CSRF | PARTIAL | TRACE-004/005 |
| TR-26 | Calendar drag/edit | PUT yearly-calendar | same handler/table | merged full entry -> row; optimistic rollback/refetch | PARTIAL | A11Y-001 |
| TR-27 | Excel preview/commit | POST preview-import / commit-import | `yearly-calendar.js`; reads/writes up to 500 entries | rows/decisions -> preview/results; authorized+CSRF | PASS (static) | MAINT-001 |
| TR-28 | Language/theme/tabs/filters/month navigation/PDF/Excel/ICS/external links | local handlers/browser APIs | no API or database | local state/file/navigation | PASS (static) | A11Y-001/002/004, PERF-001 |
| TR-29 | Scheduled registration reminder/retention | Vercel GET cron | `event-reminders.js`; registrations/events/contact/rate limits + Gmail | date -> counts; bearer cron secret | PARTIAL | REL-001, DB-003 |
| TR-30 | Scheduled newsletter | Vercel GET cron `task=newsletter` | `event-reminders.js`; events/calendar/subscribers + Gmail | date -> delivery counts; bearer secret | FAIL (reliability) | DB-001, PERF-002 |

## Broken-link evidence

* **TR-09:** the tooltip supplies a structured query key, but the default query
  function requests only element zero. It therefore receives public events and
  reads them as registrations.
* **TR-21:** `/messages` accepts members in its route guard even though the API
  requires admin for every method. Direct navigation succeeds and then stalls on
  a 403.
* **TR-25:** PUT omits POST's required calendar/date validation and can pass null
  into NOT NULL database columns, producing a 500 for non-current clients.
* **TR-30:** work is marked sent before recipient delivery. Failures and the cap
  leave undelivered recipients with no retry path.

## Reverse traceability

All eight top-level API route files have a browser caller; the cron route is
scheduler-only by design. The `site_settings` table/type has no current API or UI
caller and is classified **ORPHANED / POSSIBLE legacy**. No stored procedures,
views, triggers, queue consumers or application repository/service methods are
present in tracked source. Database-native cascades and production-only objects
could not be verified without the live database catalog.

## Coverage

* Top-level route handlers: **8/8**, including method/action/resource branches.
* Scheduled handlers: **1/1**.
* Application tables actively queried: **12** (`users`, `events`, registrations,
  messages, subscribers, documents, board members, rate limits, blacklist,
  yearly calendar, blog posts and kindergarten info); schema-only tables: **1**.
* Grouped user/system flows: **30** — 16 PASS, 12 PARTIAL, 2 FAIL.
* Verification: static source, successful type check/build/smoke tests. Live
  database/provider/browser/assistive-technology behavior remains unverified.
