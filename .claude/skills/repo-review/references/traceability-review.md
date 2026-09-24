# Traceability Review

Work from the flow IDs (F-nn) in `.review/02-architecture.md`. Each flow becomes one row in TRACEABILITY_MATRIX.md.

## Forward path
UI element → event handler → client/API function → HTTP method + route → handler/controller → validation → authz → service → data access → DB object (table/view/function) → side effects.

## Return path
DB rows → mapping/model → response shape → serialization → status code → client parsing → state/cache update → rendered UI (including loading and empty states).

## Error path
Validation failure, authz failure, not found, conflict, DB/network error. For each, check:
- what status and body the server returns
- whether the client distinguishes it
- what the user sees
- whether anything is logged

## Contract checks at every hop
Field names and casing, IDs (string vs number), parameter order, types, nullability/optional fields, enums/string unions, dates (UTC vs local, date-only vs timestamp, serialization format), decimals/currency, arrays vs single values, defaults, pagination params, status codes, and i18n keys present in every language.
For each mismatch, decide whether it is **deliberate**, **safe (coerced)** or **defective**, and cite both sides.

## DB side effects
Follow each write: triggers, FK cascades, soft-delete flags, audit tables, queue/outbox rows, cron jobs that read the data later, cache invalidation, emails/notifications sent. Flag hidden side effects that change correctness or authz.

## Reverse trace
Grep for:
- routes with no client caller
- client functions calling routes that don't exist
- exported service/data functions with no callers
- tables/columns never read or never written
- unused DTOs/types
- i18n keys that are unused or missing
- duplicate implementations of the same operation

Account for convention-based routing (file-based `api/` routes), dynamic imports, cron config (`vercel.json`), and tests-only callers before calling something DEAD or ORPHANED.

## Status
- **PASS:** every hop verified.
- **PARTIAL:** some hops verified.
- **FAIL:** name the broken hop.
- **UNVERIFIED:** needs runtime.
- **DEAD:** no entry point.
- **ORPHANED:** an entry point with a missing target.
