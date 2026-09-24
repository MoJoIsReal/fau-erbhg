// Shared fixtures for the suites in this directory. Not a suite itself: the
// runner only picks up *.test.mjs.
import { mock } from 'node:test';
import { build } from 'esbuild';
import jwt from 'jsonwebtoken';

export const SESSION_SECRET = 'test-only-session-secret-with-at-least-32-bytes';
process.env.SESSION_SECRET ??= SESSION_SECRET;

// Bundle a client module (TypeScript, JSX, path imports) with esbuild and
// import the result in-process, without writing anything to disk. A node
// bundle gets a `require` shim for the CommonJS packages React SSR pulls in.
export async function importBundle(options) {
  const banner = options.platform === 'node'
    ? { js: `import { createRequire as bundleRequire } from "node:module"; const require = bundleRequire(${JSON.stringify(import.meta.url)});` }
    : undefined;
  const result = await build({ bundle: true, format: 'esm', write: false, banner, ...options });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

// The subset of a Vercel/Node response the handlers and middleware use.
export function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end(body) { if (body !== undefined) this.body = body; return this; },
    redirect(code, location) { this.statusCode = code; this.headers.location = location; return this; },
  };
}

// ---------------------------------------------------------------------------
// Handler harness: run a real api/*.js handler, through the real middleware,
// against a scripted database. Only database.js is replaced; auth, CSRF,
// sanitizers and error handling are the production code.
//
// Needs `node --test --experimental-test-module-mocks`, which `npm test` passes.

const USERS = {
  admin: { id: 1, username: 'admin@example.test', name: 'Admin' },
  member: { id: 2, username: 'member@example.test', name: 'Member' },
  staff: { id: 3, username: 'staff@example.test', name: 'Staff' },
};

let currentSql = null;
let databaseMocked = false;

function mockDatabase() {
  if (databaseMocked) return;
  if (typeof mock.module !== 'function') {
    throw new Error('Handler suites need `node --test --experimental-test-module-mocks` (npm test passes it)');
  }
  mock.module(new URL('../api/_shared/database.js', import.meta.url).href, {
    namedExports: {
      getDb() {
        if (!currentSql) throw new Error('No scripted database: call useDatabase() first');
        return currentSql;
      },
    },
  });
  databaseMocked = true;
}

// Import a handler's default export with database.js mocked. Call this before
// anything else imports api/_shared/middleware.js in the same test file.
export async function importHandler(path) {
  mockDatabase();
  return (await import(new URL(`../${path}`, import.meta.url).href)).default;
}

export function useDatabase(sql) {
  currentSql = sql;
  return sql;
}

const WRITE = /\b(INSERT INTO|UPDATE \w+ SET|DELETE FROM) (\w+)/;

// A tagged-template stand-in for the Neon client. It answers the identity
// lookup every authenticated request makes and the rate-limit upsert (with
// `rateCount`, a number or a function of the key), records every statement,
// and hands anything else to `respond(statement, values)`.
export function scriptedSql({ respond = () => [], rateCount = 1, identities = {} } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const statement = strings.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.startsWith('INSERT INTO api_rate_limits')) {
      const count = typeof rateCount === 'function' ? rateCount(values[0]) : rateCount;
      return [{ count, retryAfter: 60 }];
    }
    if (/^SELECT username, name, role, token_version/.test(statement)) {
      const role = Object.keys(USERS).find((name) => USERS[name].id === values[0]);
      return role ? [identity(role, identities[role])] : [];
    }
    return (await respond(statement, values)) ?? [];
  };
  sql.calls = calls;
  // Statements that changed data, rate-limit bookkeeping excluded.
  sql.writes = () => calls.filter(({ statement }) => {
    const match = statement.match(WRITE);
    return match && match[2] !== 'api_rate_limits';
  });
  return sql;
}

function identity(role, overrides = {}) {
  return {
    username: USERS[role].username,
    name: USERS[role].name,
    role,
    tokenVersion: 0,
    mustChangePassword: false,
    passwordChangedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function tokenFor(role, { tokenVersion = 0 } = {}) {
  const user = USERS[role];
  return jwt.sign(
    { userId: user.id, username: user.username, role, tokenVersion },
    process.env.SESSION_SECRET,
    { algorithm: 'HS256', issuer: 'fau-erdal-barnehage', audience: 'fau-erdal-barnehage-web', expiresIn: '5m' },
  );
}

// A request as the browser would send it. `as` signs in with a role; `csrf`
// controls whether the double-submit cookie and header are both present.
export function request({ method = 'GET', url = '/api/test', query = {}, body = {}, as = null, csrf = true, headers = {} } = {}) {
  const cookies = [];
  if (as) cookies.push(`jwt=${tokenFor(as)}`);
  if (csrf) cookies.push('csrf-token=test-csrf');
  return {
    method,
    url,
    query,
    body,
    headers: {
      'x-real-ip': '203.0.113.20',
      ...(cookies.length ? { cookie: cookies.join('; ') } : {}),
      ...(csrf ? { 'x-csrf-token': 'test-csrf' } : {}),
      ...headers,
    },
  };
}

const quieted = new WeakSet();

// Run a handler and return the response, with its log lines kept off the
// test output for the rest of test `t`.
export async function call(t, handler, options) {
  if (!quieted.has(t)) {
    quieted.add(t);
    for (const level of ['log', 'warn', 'error']) t.mock.method(console, level, () => {});
  }
  const res = mockResponse();
  await handler(request(options), res);
  return res;
}
