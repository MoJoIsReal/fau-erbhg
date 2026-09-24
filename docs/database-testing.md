# Isolated PostgreSQL integration tests

`npm test` remains offline and credential-free. `npm run test:integration` is a
separate gate requiring PostgreSQL 17 and `psql` on PATH (or `TEST_PSQL` pointing
to that executable). CI provisions a disposable PostgreSQL 17 service; it does
not read repository secrets or connect to Neon.

## Local setup

Use a dedicated local PostgreSQL instance. For example, with Docker installed:

```bash
docker run --name fau-integration --rm -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=fau_test -e POSTGRES_PASSWORD=test-only-password -e POSTGRES_DB=fau_integration_test postgres:17
```

Wait for `pg_isready` to report readiness. Install a PostgreSQL client locally,
then set the test connection explicitly:

```powershell
$env:TEST_DATABASE_URL = 'postgres://fau_test:test-only-password@127.0.0.1:55432/fau_integration_test'
npm ci
npm run test:integration
docker stop fau-integration
```

On a POSIX shell, use `export TEST_DATABASE_URL='postgres://…'` instead. A native
PostgreSQL installation works too: create the dedicated `fau_test` role and
`fau_integration_test` database on loopback, use its actual port/password, and
stop/delete the disposable cluster after testing. Never reuse an application
or developer database. On Windows, the official PostgreSQL download page links
to EDB's portable binary distribution, including `initdb`, `pg_ctl` and `psql`.

## Guard and fixture contract

The connection guard accepts only loopback hosts, the exact database name
`fau_integration_test`, and role `fau_test`. URL query overrides are rejected.
There is no fallback to `DATABASE_URL` or `.env`. The adapter strips inherited
libpq settings, disables psql startup files and checks the connected database
and role before resetting the fixture.

**Each run drops/recreates the test database's `public` schema.** It generates
DDL from the current `shared/schema.ts` using the installed Drizzle tooling,
then executes numbered SQL migrations in order on that empty schema. This
covers current declarations plus supplemental constraints/indexes; it does not
prove upgrades against historical production data. No migrations are edited.
A test failure leaves only synthetic records in this disposable database;
the next run resets them, and destroying the service removes them altogether.

The test seam extracts a uniquely identified tagged SQL template directly from
the production handler and evaluates its fixture bindings. SQL is not copied
into a parallel backend. A renamed/ambiguous statement fails the test setup.
The psql adapter quotes fixture values and returns CSV rows; it never sends mail,
loads provider credentials or starts an application server.

## Covered behavior

- Multiple PostgreSQL sessions waiting concurrently for the same event lock:
  final-seat contention and duplicate signup preserve exact counters.
- Conflicting photo reservations roll back the losing statement; a fresh slot
  succeeds, with unique normalized reservations and correct counters.
- Concurrent/repeated cancellation releases once and records one history row;
  event deletion restrictions and photo/history cascades are exercised.
- Concurrent newsletter claims return disjoint deliveries; live leases exclude
  repeat claims, expired leases recover, subscriber deletion cascades.
- Six-month registration/cancellation, twelve-month contact-message and
  ninety-day terminal-delivery retention keep recent/pending records.

For a negative control, temporarily omit `photo_event_slots_event_slot_unique_idx`
from the disposable fixture: the photo test must reject two successful
reservations of the same slot. Restore the fixture and rerun the complete suite.
Never weaken a production constraint for this check. Track pending release
verification in [DEPLOYMENT.md](./DEPLOYMENT.md).
