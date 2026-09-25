// api/secure-settings.js through the handler harness: the wire shape of every
// read, the query options the pages depend on, and input the handler refuses.
import assert from 'node:assert/strict';
import test from 'node:test';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

const handler = await importHandler('api/secure-settings.js');

// One full row per table, as the database would hold it.
const ROWS = {
  fau_board_members: { id: 1, name: 'Kari', role: 'Leder', sort_order: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
  blog_posts: {
    id: 4, title: 'Dugnad', content: '<p>Hei</p>', status: 'published', category: 'news',
    published_date: '2026-09-01T00:00:00.000Z', author: 'FAU', show_on_homepage: true,
    notify_newsletter: true, newsletter_sent_at: '2026-09-02T19:00:00.000Z', created_by: 'member@example.test',
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
  },
  kindergarten_info: {
    id: 1, contact_email: 'post@example.test', address: 'Erdal', opening_hours: '07–17', number_of_children: 90,
    owner: 'Askøy kommune', description: 'Om barnehagen', styrer_name: 'Styrer', styrer_email: 'styrer@example.test',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
  },
  contact_messages: {
    id: 7, name: 'Ola', email: 'ola@example.test', phone: '12345678', subject: 'Hei', message: 'Spørsmål',
    status: 'new', created_at: '2026-09-03T08:00:00.000Z', responded_at: null, responded_by: null, response_message: null,
  },
  users: { id: 5, username: 'member@example.test', password: 'hash', name: 'Member', role: 'member', token_version: 0, created_at: '2026-02-01T00:00:00.000Z' },
  newsletter_subscribers: {
    id: 9, email: 'parent@example.test', name: 'Parent', language: 'no', status: 'active',
    confirm_token: null, unsubscribe_token: 'secret-token', created_at: '2026-03-01T00:00:00.000Z',
    confirmed_at: '2026-03-01T00:05:00.000Z', unsubscribed_at: null,
    pending_deliveries: 1, failed_deliveries: 2,
  },
};

// Enough of a SELECT (or RETURNING) to answer it from one full row: split the
// column list at top-level commas; `x AS "y"` takes the alias, `t.col` the
// column, `*` the whole row. The same fixture therefore answers a query that
// aliases in SQL and one that maps a raw row, which is the point of the
// snapshots below.
function project(statement, row) {
  const list = statement.match(/^SELECT (.*?) FROM /)?.[1] ?? statement.match(/ RETURNING (.*)$/)?.[1];
  if (!list || list.trim() === '*') return { ...row };
  const items = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { items.push(current.trim()); current = ''; } else current += char;
  }
  items.push(current.trim());
  return Object.fromEntries(items.map((item) => {
    const alias = item.match(/\s+as\s+"?(\w+)"?$/i)?.[1];
    const source = item.split(/\s+as\s+/i)[0].split('.').pop();
    const name = alias ?? source;
    // An aggregate (`COUNT(…) AS x`) has no source column; the row carries x.
    return [name, source in row ? row[source] : row[name]];
  }));
}

function database(overrides = {}) {
  const rows = { ...ROWS, ...overrides };
  return scriptedSql({
    respond(statement) {
      const table = statement.match(/(?:FROM|INTO|UPDATE) (\w+)/)?.[1];
      if (!rows[table]) return [];
      return [project(statement, rows[table])];
    },
  });
}

const wire = (body) => JSON.parse(JSON.stringify(body));

const read = async (t, query, as = null, overrides = {}) => {
  const sql = useDatabase(database(overrides));
  const res = await call(t, handler, { query, as });
  return { res, body: wire(res.body), sql };
};

test('every read keeps its wire shape', async (t) => {
  const post = {
    id: 4, title: 'Dugnad', content: '<p>Hei</p>', category: 'news', publishedDate: '2026-09-01T00:00:00.000Z',
    author: 'FAU', showOnHomepage: true,
  };
  const cases = [
    [{ resource: 'board-members' }, null, [{ id: 1, name: 'Kari', role: 'Leder', sortOrder: 0 }]],
    [{ resource: 'blog-posts' }, null, [post]],
    [{ resource: 'blog-posts', id: '4' }, null, [post]],
    [{ resource: 'blog-posts', includeArchived: 'true' }, 'member', [{
      id: 4, title: 'Dugnad', content: '<p>Hei</p>', status: 'published', category: 'news',
      publishedDate: '2026-09-01T00:00:00.000Z', author: 'FAU', showOnHomepage: true, notifyNewsletter: true,
      newsletterSentAt: '2026-09-02T19:00:00.000Z', createdBy: 'member@example.test',
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    }]],
    [{ resource: 'kindergarten-info' }, null, {
      id: 1, contactEmail: 'post@example.test', address: 'Erdal', openingHours: '07–17', numberOfChildren: 90,
      owner: 'Askøy kommune', description: 'Om barnehagen', styrerName: 'Styrer', styrerEmail: 'styrer@example.test',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }],
    [{ resource: 'contact-messages' }, 'member', [{
      id: 7, name: 'Ola', email: 'ola@example.test', phone: '12345678', subject: 'Hei', message: 'Spørsmål',
      status: 'new', createdAt: '2026-09-03T08:00:00.000Z', respondedAt: null, respondedBy: null, responseMessage: null,
    }]],
    [{ resource: 'users' }, 'admin', [{ id: 5, username: 'member@example.test', name: 'Member', role: 'member', createdAt: '2026-02-01T00:00:00.000Z' }]],
  ];
  for (const [query, as, expected] of cases) {
    const { res, body } = await read(t, query, as);
    assert.equal(res.statusCode, 200, JSON.stringify(query));
    assert.deepEqual(body, expected, JSON.stringify(query));
  }
});

test('the subscriber list carries delivery counts and never a token', async (t) => {
  const { res, body } = await read(t, { resource: 'newsletter-subscribers' }, 'admin');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body, [{
    id: 9, email: 'parent@example.test', name: 'Parent', language: 'no', status: 'active',
    createdAt: '2026-03-01T00:00:00.000Z', confirmedAt: '2026-03-01T00:05:00.000Z', unsubscribedAt: null,
    pendingDeliveries: 1, failedDeliveries: 2,
  }]);
});

// SEC-005. A fraction or out-of-range number used to reach LIMIT, an ::int
// cast or an integer column and come back as a database error — a 500.
test('ids, limits and offsets must be whole numbers in range', async (t) => {
  for (const query of [
    { resource: 'blog-posts', limit: '1.5' },
    { resource: 'blog-posts', limit: '101' },
    { resource: 'blog-posts', offset: '-1' },
    { resource: 'blog-posts', offset: '2.5' },
    { resource: 'blog-posts', id: '1.5' },
    { resource: 'blog-posts', id: '2147483648' },
  ]) {
    const { res, sql } = await read(t, query);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
    assert.ok(!sql.calls.some(({ statement }) => statement.includes('FROM blog_posts')), JSON.stringify(query));
  }
  for (const [resource, as] of [['users', 'admin'], ['newsletter-subscribers', 'admin']]) {
    const sql = useDatabase(database());
    const res = await call(t, handler, { method: 'DELETE', query: { resource, id: '1.5' }, as });
    assert.equal(res.statusCode, 400, resource);
    assert.deepEqual(sql.writes(), [], `${resource}: parseInt used to delete id 1`);
  }
});

// PERF-002. The homepage used to download up to 500 posts to show three.
test('the homepage asks for its own posts only', async (t) => {
  const { res, body, sql } = await read(t, { resource: 'blog-posts', homepage: 'true', limit: '3' }, null, {
    blog_posts: { ...ROWS.blog_posts, show_on_homepage: null },
  });
  assert.equal(res.statusCode, 200);
  const select = sql.calls.find(({ statement }) => statement.includes('FROM blog_posts'));
  assert.match(select.statement, /\? = false OR show_on_homepage IS TRUE/);
  assert.equal(select.values.includes(true), true, 'the homepage filter is on');
  assert.equal(select.values.at(-2), 3, 'LIMIT 3');
  // NULL means not on the homepage: the query skips it, and the mapper says so.
  assert.equal(body[0].showOnHomepage, false);

  const { sql: plain } = await read(t, { resource: 'blog-posts' });
  const unfiltered = plain.calls.find(({ statement }) => statement.includes('FROM blog_posts'));
  assert.equal(unfiltered.values.includes(true), false, 'the news page is not filtered');
});

// SEC-006. Two admins creating the same user at once both passed the lookup;
// the second INSERT was a unique violation and a 500.
test('a user created twice at once is a 400 and sends no login mail', async (t) => {
  process.env.GMAIL_USER = 'sender@example.test';
  process.env.GMAIL_APP_PASSWORD = 'test-only-password';
  t.after(() => { delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; });
  const sql = useDatabase(scriptedSql({
    // The lookup finds nobody; by the INSERT the other request has won.
    respond: () => [],
  }));
  const res = await call(t, handler, {
    method: 'POST',
    query: { resource: 'users' },
    body: { username: 'new@example.test', name: 'New', role: 'member' },
    as: 'admin',
  });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Brukernavnet er allerede i bruk' });
  assert.match(sql.calls.find(({ statement }) => statement.startsWith('INSERT INTO users')).statement, /ON CONFLICT \(username\) DO NOTHING/);
  assert.equal(sql.calls.filter(({ statement }) => statement.startsWith('DELETE FROM users')).length, 0);
});

test('the unused staff-users alias is gone', async (t) => {
  const { res } = await read(t, { resource: 'staff-users' }, 'admin');
  assert.equal(res.statusCode, 400);
});
