# Performance Review

Report only material issues. Label each one: **measured** (you have numbers), **evidenced** (clear from the code, e.g. a query inside a loop), or **needs metrics** (needs a query plan or production data).

## Application / runtime
- Serverless: cold-start weight (heavy top-level imports), DB connection per invocation vs pooling/HTTP driver, function duration limits, work that belongs in a cron or queue.
- Sequential awaits that could run in parallel, and unbounded `Promise.all` fan-out.
- Unbounded reads, i.e. no pagination or limit.
- Large JSON responses and over-fetching columns.
- Missing caching headers on cacheable GETs; cache invalidation correctness.
- Memory: loading whole files or tables into memory, buffering uploads.

## Frontend
- Bundle size and code-splitting (lazy routes), stale-chunk recovery after deploys.
- Re-render storms: unstable deps, context over-broadcast.
- Request waterfalls, duplicate fetches, missing request dedup/caching (React Query etc.).
- Images: size, format, lazy loading. Fonts.
- Long lists without virtualization. Layout shift.

## Database
- N+1 queries and repeated queries per request; round trips inside loops.
- `SELECT *` or over-fetching; missing LIMIT.
- Non-SARGable predicates: a function applied to a column, leading wildcard `LIKE`, implicit casts, `OR` across columns.
- Indexes: for each proposed index, name the query, its filter/sort columns, the expected selectivity, and the write cost. Check FK columns and unique constraints that enforce business rules.
- Transactions: scope and duration, isolation level, lock ordering and deadlock risk, check-then-write races.
- Triggers, cascades and computed columns that add hidden cost.
- Migrations: locking DDL on large tables, backfills done in a single statement.
- Count queries or aggregates on hot paths.

## Output
For each issue: access pattern → cost driver → expected scale at which it hurts → fix → how to measure before and after.
