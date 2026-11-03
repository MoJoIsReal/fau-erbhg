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
  { handler: 'registrations', method: 'GET', query: { eventId: '1', view: 'council' }, allowed: COUNCIL },
  { handler: 'registrations', method: 'PATCH', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'registrations', method: 'DELETE', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'documents', method: 'DELETE', query: { id: '1' }, allowed: COUNCIL },
  { handler: 'upload', method: 'POST', allowed: COUNCIL },
  { handler: 'upload', method: 'POST', query: { action: 'sign' }, allowed: COUNCIL },
  { handler: 'yearly-calendar', method: 'POST', allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'POST', query: { action: 'preview-import' }, allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'POST', query: { action: 'commit-import' }, allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'PUT', query: { id: '1' }, allowed: EDITORS },
  { handler: 'yearly-calendar', method: 'DELETE', query: { id: '1' }, allowed: EDITORS },
  settings('board-members', 'POST', ADMIN),
  settings('users', 'PATCH', ADMIN, { id: '1' }),
  settings('board-members', 'PUT', ADMIN, { id: '1' }),
  settings('board-members', 'DELETE', ADMIN, { id: '1' }),
  settings('kindergarten-info', 'PUT', ADMIN),
  settings('blog-posts', 'GET', COUNCIL, { includeArchived: 'true' }),
  settings('blog-posts', 'POST', COUNCIL),
  settings('blog-posts', 'PUT', COUNCIL, { id: '1' }),
  settings('blog-posts', 'PATCH', COUNCIL, { id: '1' }),
  settings('blog-posts', 'DELETE', COUNCIL, { id: '1' }),
  settings('contact-messages', 'GET', COUNCIL),
  settings('contact-messages', 'POST', COUNCIL, { id: '1' }),
  settings('contact-messages', 'PUT', COUNCIL, { id: '1' }),
  settings('contact-messages', 'DELETE', COUNCIL, { id: '1' }),
  settings('users', 'GET', ADMIN),
  settings('users', 'POST', ADMIN),
  settings('users', 'DELETE', ADMIN, { id: '5' }),
  settings('newsletter-subscribers', 'GET', ADMIN),
  settings('newsletter-subscribers', 'DELETE', ADMIN, { id: '1' }),
  { handler: 'media', method: 'GET', query: { action: 'list' }, allowed: ADMIN },
  { handler: 'media', method: 'GET', query: { action: 'link', id: '1' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'create' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'upload-init' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'upload-parts' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'upload-complete' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'upload-abort' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'publish' }, allowed: ADMIN },
  { handler: 'media', method: 'POST', query: { action: 'extend' }, allowed: ADMIN },
  { handler: 'media', method: 'DELETE', query: { id: '1' }, allowed: ADMIN },
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
// or it ships with no check that the guard is in the right place. Checked per
// route, not per file: a new method, ?action= or ?resource= in a handler that
// is already listed used to pass with no row of its own.
const PUBLIC_ROUTES = {
  documents: ['download'],
  media: ['view'],
  registrations: ['cancel-lookup', 'cancel', 'update-food'],
  // Import decisions inside a commit, not routes.
  'yearly-calendar': ['create', 'update', 'ignore'],
};
// The public signup.
const PUBLIC_METHODS = { registrations: ['POST'] };
test('every method, action and resource of a handler that checks a role is in the matrix', () => {
  for (const file of readdirSync(new URL('../api/', import.meta.url)).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(new URL(`../api/${file}`, import.meta.url), 'utf8');
    if (!/requireRole\(/.test(source)) continue;
    const handler = file.replace(/\.js$/, '');
    const rows = ROUTES.filter((route) => route.handler === handler);
    assert.ok(rows.length > 0, `api/${file} guards routes but is not in ROUTES`);

    const methods = new Set([...source.matchAll(/req\.method === '([A-Z]+)'/g)].map((match) => match[1]));
    for (const method of methods) {
      if (method === 'GET' || method === 'OPTIONS' || (PUBLIC_METHODS[handler] ?? []).includes(method)) continue;
      assert.ok(rows.some((route) => route.method === method), `${handler}: ${method} has no row in ROUTES`);
    }
    const named = [...source.matchAll(/(?<![.\w])(?:action|resource) === '([a-z-]+)'|req\.(?:query|body)\.(?:action|resource) === '([a-z-]+)'/g)]
      .map((match) => match[1] ?? match[2]);
    const table = source.match(/const WRITE_ACTIONS = \{([\s\S]*?)\};/)?.[1] ?? '';
    named.push(...[...table.matchAll(/^\s+'?([a-z-]+)'?:/gm)].map((match) => match[1]));
    for (const name of new Set(named)) {
      if ((PUBLIC_ROUTES[handler] ?? []).includes(name)) continue;
      assert.ok(rows.some((route) => Object.values(route.query ?? {}).includes(name)), `${handler}: ${name} has no row in ROUTES`);
    }
  }
});

// secure-settings multiplexes six resources, each with its own methods: a row
// per handler method is not enough there, so each resource's own methods are
// checked against its rows.
test('every method of every secure-settings resource is in the matrix', () => {
  const source = readFileSync(new URL('../api/secure-settings.js', import.meta.url), 'utf8');
  const resources = [...source.matchAll(/resource === '([a-z-]+)'\) \{\s*return await (\w+)\(/g)];
  assert.ok(resources.length >= 6, 'found the resource routing');
  for (const [, resource, fn] of resources) {
    const start = source.indexOf(`async function ${fn}(`);
    assert.ok(start !== -1, fn);
    const next = source.slice(start + 1).search(/\n(?:async function |export default )/);
    const body = source.slice(start, next === -1 ? undefined : start + 1 + next);
    for (const [, method] of body.matchAll(/req\.method === '([A-Z]+)'/g)) {
      if (method === 'GET') continue;
      assert.ok(ROUTES.some((route) => route.handler === 'secure-settings' && route.query?.resource === resource && route.method === method),
        `secure-settings ${resource} ${method} has no row in ROUTES`);
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
