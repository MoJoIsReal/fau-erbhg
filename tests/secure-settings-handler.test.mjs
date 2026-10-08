// api/secure-settings.js through the handler harness: the wire shape of every
// read, the query options the pages depend on, and input the handler refuses.
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import nodemailer from 'nodemailer';
import { call, fields, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

// Mail is captured, and a test can make the provider refuse it. Each event is
// also logged in `timeline`, next to the statements, to check what came first.
const sent = [];
let refuseMail = false;
const timeline = [];
mock.method(nodemailer, 'createTransport', () => ({
  close() {},
  async sendMail(message) {
    timeline.push('mail');
    if (refuseMail) throw new Error('535 Authentication failed');
    sent.push(message);
  },
}));

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
  assert.deepEqual(res.body, { error: 'Username is already in use', code: 'USERNAME_TAKEN' });
  assert.match(sql.calls.find(({ statement }) => statement.startsWith('INSERT INTO users')).statement, /ON CONFLICT \(username\) DO NOTHING/);
  assert.equal(sql.calls.filter(({ statement }) => statement.startsWith('DELETE FROM users')).length, 0);
});

test('the unused staff-users alias is gone', async (t) => {
  const { res } = await read(t, { resource: 'staff-users' }, 'admin');
  assert.equal(res.statusCode, 400);
});

// The write paths had no behavioural test: dropping the role filter on users
// DELETE, or marking a reply sent before Gmail accepted it, passed CI.

const asAdmin = (method, resource, { query = {}, body } = {}) =>
  ({ method, query: { resource, ...query }, body, as: 'admin' });
const statementsOf = (sql, prefix) => sql.calls.filter(({ statement }) => statement.startsWith(prefix));

test('deleting a user can only ever remove a member or staff account', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: (statement) => (statement.startsWith('DELETE FROM users') ? [{ id: 5 }] : []) }));
  const res = await call(t, handler, asAdmin('DELETE', 'users', { query: { id: '5' } }));
  assert.equal(res.statusCode, 200);
  const [remove] = statementsOf(sql, 'DELETE FROM users');
  assert.match(remove.statement, /WHERE id = \? AND role IN \(\?, \?\)/);
  assert.deepEqual(remove.values, [5, 'member', 'staff'], 'an admin account is never in the set');

  // An admin's id (or one already gone) matches nothing: a 404, not a success.
  useDatabase(scriptedSql());
  const admin = await call(t, handler, asAdmin('DELETE', 'users', { query: { id: '1' } }));
  assert.deepEqual([admin.statusCode, admin.body.code], [404, 'NOT_FOUND']);
});

function inquiryDatabase(row) {
  return useDatabase(scriptedSql({
    respond(statement) {
      timeline.push(statement.split(' ').slice(0, 2).join(' '));
      if (statement.startsWith('SELECT * FROM contact_messages')) return row ? [row] : [];
      if (statement.startsWith('UPDATE contact_messages')) return [{ ...row, status: 'responded' }];
      return [];
    },
  }));
}
const reply = (message, id = '7') => ({ method: 'POST', query: { resource: 'contact-messages', id }, body: { message }, as: 'member' });

test('a reply is marked as sent only after the mail went out', async (t) => {
  process.env.GMAIL_USER = 'fau@example.test';
  process.env.GMAIL_APP_PASSWORD = 'test-only-password';
  t.after(() => { delete process.env.GMAIL_USER; delete process.env.GMAIL_APP_PASSWORD; refuseMail = false; });

  sent.length = 0; timeline.length = 0;
  let sql = inquiryDatabase(ROWS.contact_messages);
  let res = await call(t, handler, reply('Takk, vi ser på det.'));
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ola@example.test');
  assert.ok(timeline.indexOf('mail') < timeline.indexOf('UPDATE contact_messages'), 'mail first, then the status');
  assert.equal(fields(statementsOf(sql, 'UPDATE contact_messages')[0]).response_message, 'Takk, vi ser på det.');

  // Gmail refuses: the inquiry stays unanswered in the list.
  refuseMail = true; sent.length = 0;
  sql = inquiryDatabase(ROWS.contact_messages);
  res = await call(t, handler, reply('Takk, vi ser på det.'));
  assert.deepEqual([res.statusCode, res.body.code], [502, 'REPLY_SEND_FAILED']);
  assert.deepEqual(statementsOf(sql, 'UPDATE contact_messages'), []);
  refuseMail = false;

  // Nobody to answer, nothing to say, or nothing to answer: refused, no mail.
  for (const [row, message, status, code] of [
    [{ ...ROWS.contact_messages, email: null, subject: 'anonymous' }, 'Svar', 400, 'NO_REPLY_ADDRESS'],
    [ROWS.contact_messages, '   ', 400, 'REPLY_REQUIRED'],
    [null, 'Svar', 404, 'NOT_FOUND'],
  ]) {
    sent.length = 0;
    sql = inquiryDatabase(row);
    res = await call(t, handler, reply(message));
    assert.deepEqual([res.statusCode, res.body.code], [status, code]);
    assert.equal(sent.length, 0);
    assert.deepEqual(statementsOf(sql, 'UPDATE contact_messages'), []);
  }
});

test('a reply cannot go out without mail configured', async (t) => {
  delete process.env.GMAIL_USER;
  sent.length = 0;
  const sql = inquiryDatabase(ROWS.contact_messages);
  const res = await call(t, handler, reply('Svar'));
  assert.deepEqual([res.statusCode, res.body.code], [503, 'EMAIL_NOT_CONFIGURED']);
  assert.deepEqual(statementsOf(sql, 'UPDATE contact_messages'), []);
});

// notify_newsletter has three states on update: leave it, set it, clear it.
// An editor that does not send the flag must not switch a post's newsletter
// off (or on) as a side effect.
test('updating a post keeps, sets or clears its newsletter flag, and sanitizes the content', async (t) => {
  for (const [notifyNewsletter, stored] of [[undefined, null], [true, true], [false, false]]) {
    const sql = useDatabase(database());
    const res = await call(t, handler, {
      method: 'PUT', query: { resource: 'blog-posts', id: '4' }, as: 'member',
      body: { title: 'Dugnad', content: '<p>Hei</p><script>alert(1)</script><img src=x onerror=alert(1)>', notifyNewsletter },
    });
    assert.equal(res.statusCode, 200, String(notifyNewsletter));
    const [update] = statementsOf(sql, 'UPDATE blog_posts');
    assert.match(update.statement, /notify_newsletter = COALESCE\(\?::boolean, notify_newsletter\)/);
    assert.ok(update.values.includes(stored), `${notifyNewsletter} → ${stored}`);
    const content = update.values.find((value) => typeof value === 'string' && value.startsWith('<p>'));
    assert.doesNotMatch(content, /<script|onerror/);
  }

  const sql = useDatabase(database());
  const res = await call(t, handler, { method: 'PUT', query: { resource: 'blog-posts', id: '4' }, as: 'member', body: { title: '', content: '<p>x</p>' } });
  assert.deepEqual([res.statusCode, res.body.code], [400, 'REQUIRED_FIELDS']);
  assert.deepEqual(statementsOf(sql, 'UPDATE blog_posts'), []);
});

test('board members and kindergarten info refuse incomplete input and store it sanitized', async (t) => {
  let sql = useDatabase(database());
  let res = await call(t, handler, asAdmin('POST', 'board-members', { body: { name: '<b>Kari</b>', role: 'Leder' } }));
  assert.equal(res.statusCode, 201);
  const insert = fields(statementsOf(sql, 'INSERT INTO fau_board_members')[0]);
  assert.equal(insert.name, 'bKari/b', 'tags stripped');
  assert.equal(insert.role, 'Leder');

  for (const body of [{ name: '', role: 'Leder' }, { name: 'Kari', role: '' }]) {
    sql = useDatabase(database());
    res = await call(t, handler, asAdmin('POST', 'board-members', { body }));
    assert.deepEqual([res.statusCode, res.body.code], [400, 'REQUIRED_FIELDS']);
    assert.deepEqual(statementsOf(sql, 'INSERT INTO fau_board_members'), []);
  }

  sql = useDatabase(database());
  res = await call(t, handler, asAdmin('PUT', 'kindergarten-info', { body: { contactEmail: 'not-an-address' } }));
  assert.deepEqual([res.statusCode, res.body.code], [400, 'REQUIRED_FIELDS']);
  assert.deepEqual(statementsOf(sql, 'UPDATE kindergarten_info'), []);
});
