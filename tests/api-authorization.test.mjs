// The authorization model, checked through the real handlers: UI route guards
// are convenience only, so every protected route has to refuse the wrong
// caller itself — and refuse before it reads or writes anything.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

const ROLES = ['anonymous', 'staff', 'member', 'admin'];
const COUNCIL = ['admin', 'member'];
const ADMIN = ['admin'];
const EDITORS = ['admin', 'member', 'staff'];

const settings = (resource, method, allowed, query = {}) =>
  ({ handler: 'secure-settings', method, query: { resource, ...query }, allowed });

const ROUTES = [
  { handler: 'events', method: 'POST', allowed: COUNCIL },
  { handler: 'events', method: 'PUT', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'events', method: 'PATCH', query: { id: '1', action: 'cancel' }, allowed: COUNCIL },
  { handler: 'events', method: 'DELETE', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'registrations', method: 'GET', query: { eventId: '1', cancelled: '1' }, allowed: COUNCIL },
  { handler: 'registrations', method: 'DELETE', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'documents', method: 'DELETE', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'upload', method: 'POST', allowed: COUNCIL },
  { handler: 'yearly-calendar', method: 'POST', allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'PUT', query: { id: '1' }, allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'DELETE', query: { id: '1' }, allowed: EDITORS },
  settings('board-members', 'POST', ADMIN),
  settings('board-members', 'PUT', ADMIN, { id: '1' }),
  settings('board-members', 'DELETE', ADMIN, { id: '1' }),
  settings('kindergarten-info', 'PUT', ADMIN),
  settings('blog-posts', 'GET', COUNCIL, { includeArchived: 'true' }),
  settings('blog-posts', 'POST', COUNCIL),
  settings('blog-posts', 'PUT', COUNCIL, { id: '1' }),
  settings('blog-posts', 'DELETE', COUNCIL, { id: '1' }),
  settings('contact-messages', 'GET', COUNCIL),
  settings('contact-messages', 'POST', COUNCIL, { id: '1' }),
  settings('contact-messages', 'PUT', COUNCIL, { id: '1' }),
  settings('contact-messages', 'DELETE', COUNCIL, { id: '1' }),
  settings('users', 'GET', ADMIN),
  settings('users', 'POST', ADMIN),
  settings('users', 'DELETE', ADMIN, { id: '5' }),
  settings('staff-users', 'GET', ADMIN),
  settings('newsletter-subscribers', 'GET', ADMIN),
  settings('newsletter-subscribers', 'DELETE', ADMIN, { id: '1' }),
];

const handlers = {};
for (const name of new Set(ROUTES.map((route) => route.handler))) {
  handlers[name] = await importHandler(`api/${name}.js`);
}

const label = ({ handler, method, query = {} }) =>
  `${method} /api/${handler}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;

// Everything a rejected request is allowed to have run: the identity lookup.
const onlyIdentityLookups = (sql) =>
  sql.calls.every(({ statement }) => statement.startsWith('SELECT username, name, role, token_version'));

for (const route of ROUTES) {
  test(`${label(route)} admits exactly ${route.allowed.join(', ')}`, async (t) => {
    for (const role of ROLES) {
      const sql = useDatabase(scriptedSql());
      const res = await call(t, handlers[route.handler], {
        method: route.method,
        query: route.query ?? {},
        as: role === 'anonymous' ? null : role,
      });
      const who = `${role} → ${label(route)}`;

      if (route.allowed.includes(role)) {
        assert.ok(![401, 403].includes(res.statusCode), `${who} should pass the gate, got ${res.statusCode}`);
        continue;
      }
      assert.equal(res.statusCode, role === 'anonymous' ? 401 : 403, who);
      assert.ok(onlyIdentityLookups(sql), `${who} ran more than the identity lookup:\n${
        sql.calls.map(({ statement }) => statement).join('\n')}`);
    }
  });
}

test('an allowed role without the CSRF pair changes nothing', async (t) => {
  for (const route of ROUTES.filter(({ method }) => method !== 'GET')) {
    const sql = useDatabase(scriptedSql());
    const res = await call(t, handlers[route.handler], {
      method: route.method,
      query: route.query ?? {},
      as: route.allowed[route.allowed.length - 1],
      csrf: false,
    });
    assert.equal(res.statusCode, 403, label(route));
    assert.deepEqual(res.body, { error: 'Invalid CSRF token' }, label(route));
    assert.deepEqual(sql.writes(), [], label(route));
  }
});

// A new handler that guards a route with requireRole has to be listed above,
// or it ships with no check that the guard is in the right place.
test('every handler that checks a role is covered by the matrix', () => {
  const covered = new Set(ROUTES.map((route) => route.handler));
  for (const file of readdirSync(new URL('../api/', import.meta.url)).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(new URL(`../api/${file}`, import.meta.url), 'utf8');
    if (/requireRole\(/.test(source)) {
      assert.ok(covered.has(file.replace(/\.js$/, '')), `api/${file} guards routes but is not in ROUTES`);
    }
  }
});

// Authentication must never make a public endpoint stricter, and only the
// council may see who signed up.
test('the registration list is an aggregate for everyone but the council', async (t) => {
  const respond = (statement) => {
    if (statement.includes('SUM(attendee_count)')) return [{ count: 3 }];
    if (statement.includes('FROM event_registrations')) return [{ id: 1, name: 'Kari', email: 'kari@example.test' }];
    return [];
  };
  for (const role of ['anonymous', 'staff']) {
    useDatabase(scriptedSql({ respond }));
    const res = await call(t, handlers.registrations, { query: { eventId: '1' }, as: role === 'anonymous' ? null : role });
    assert.equal(res.statusCode, 200, role);
    assert.deepEqual(res.body, { count: 3 }, role);
  }
  for (const role of COUNCIL) {
    useDatabase(scriptedSql({ respond }));
    const res = await call(t, handlers.registrations, { query: { eventId: '1' }, as: role });
    assert.equal(res.body[0].email, 'kari@example.test', role);
  }
});
