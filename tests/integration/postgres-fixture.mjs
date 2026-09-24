import { spawn } from 'node:child_process';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function testConnection(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set TEST_DATABASE_URL to an isolated local fau_integration_test database'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.pathname !== '/fau_integration_test' || url.username !== 'fau_test'
      || url.search || url.hash) {
    throw new Error('Refusing non-test PostgreSQL target');
  }
  return url;
}

// Never falls back to DATABASE_URL, .env, libpq service files or psql startup files.
export function database(value = process.env.TEST_DATABASE_URL) {
  const url = testConnection(value);
  return async function query(statement) {
    const output = await new Promise((resolve, reject) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
      Object.assign(env, { PGHOST: url.hostname.replace(/[\[\]]/g, ''), PGPORT: url.port || '5432',
        PGUSER: 'fau_test', PGDATABASE: 'fau_integration_test', PGPASSWORD: decodeURIComponent(url.password),
        PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=15000 -c lock_timeout=10000' });
      const child = spawn(process.env.TEST_PSQL || 'psql', ['-X', '-q', '--csv', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env, windowsHide: true });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
      child.stdin.end(statement);
    });
    return csvRows(output);
  };
}

function csvRows(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  const headers = rows.shift() || [];
  return rows.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}

export function literal(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Invalid number'); return String(value); }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return "E'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
}

// Execute the tagged template directly from the production source. This seam
// copies no SQL and fails if an edit makes the selected statement ambiguous.
export async function productionStatement(file, marker, bindings = {}) {
  const source = (await readFile(new URL('../../' + file, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const matches = [...source.matchAll(/await sql`([\s\S]*?)`/g)].filter(match => match[1].includes(marker));
  if (matches.length !== 1) throw new Error(`Expected one SQL statement for ${file}: ${marker}`);
  const tag = (strings, ...values) => strings.reduce((text, part, index) => text + part + (index < values.length ? literal(values[index]) : ''), '');
  return new Function('sql', ...Object.keys(bindings), 'return sql`' + matches[0][1] + '`')(tag, ...Object.values(bindings));
}

export async function initialize(query) {
  // Guard also server identity before destructive fixture reset. This role and
  // database are created solely for tests; CI's service is destroyed after use.
  const [identity] = await query('SELECT current_database() AS db, current_user AS role;');
  if (identity.db !== 'fau_integration_test' || identity.role !== 'fau_test') throw new Error('Unexpected test database identity');
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  // Loaded here rather than at the top: the offline guard test imports this
  // module for testConnection alone, and drizzle-kit takes a second to load.
  const [{ build }, { generateDrizzleJson, generateMigration }, { is, getTableName }, { PgTable }] = await Promise.all([
    import('esbuild'), import('drizzle-kit/api'), import('drizzle-orm'), import('drizzle-orm/pg-core'),
  ]);
  const directory = path.resolve('node_modules/.cache/fau-integration');
  await mkdir(directory, { recursive: true });
  const outfile = path.join(directory, 'schema.mjs');
  await build({ entryPoints: ['shared/schema.ts'], outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm' });
  const schema = await import(pathToFileURL(outfile).href);
  const migrations = [];
  for (const file of (await readdir('migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    migrations.push(await readFile(path.join('migrations', file), 'utf8'));
  }
  // Production got every table a migration creates from that migration, and
  // the CHECK constraints live only there (schema.ts declares none). Creating
  // them from Drizzle first turned each `CREATE TABLE IF NOT EXISTS` into a
  // no-op, so CI ran against looser tables than Neon — which is how a status
  // the 0008 check rejected passed this suite. Drizzle supplies only the base
  // tables that predate the migrations.
  const migrationTables = new Set(migrations.flatMap(text =>
    [...text.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map(match => match[1])));
  const baseSchema = Object.fromEntries(Object.entries(schema)
    .filter(([, value]) => !(is(value, PgTable) && migrationTables.has(getTableName(value)))));
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(baseSchema));
  await query(statements.join('\n'));
  for (const migration of migrations) {
    await query(migration);
  }
}
