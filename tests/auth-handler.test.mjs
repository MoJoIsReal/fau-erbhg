import assert from 'node:assert/strict';
import test from 'node:test';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';
import { rateLimitKey } from '../api/_shared/rate-limit.js';
import { getJwtConfig } from '../api/_shared/jwt-config.js';

const handler = await importHandler('api/auth.js');

const USERNAME = 'member@example.test';
const PASSWORD = 'correct horse battery';
const HASH = bcryptjs.hashSync(PASSWORD, 4);
const CLIENT = { headers: { 'x-real-ip': '203.0.113.20' } };

function accounts(respond = () => []) {
  return (statement, values) => {
    if (statement.includes('FROM users WHERE username = ?')) {
      return values[0] === USERNAME
        ? [{ id: 2, username: USERNAME, name: 'Member', role: 'member', password: HASH, tokenVersion: 4,
          mustChangePassword: false, passwordChangedAt: new Date().toISOString() }]
        : [];
    }
    return respond(statement, values);
  };
}

const login = (body, options = {}) => ({ method: 'POST', query: { action: 'login' }, body, ...options });
const cookies = (res) => res.headers['set-cookie'] ?? [];

test('an unknown account and a wrong password get the same answer and no session', async (t) => {
  for (const body of [{ username: 'nobody@example.test', password: PASSWORD }, { username: USERNAME, password: 'wrong' }]) {
    useDatabase(scriptedSql({ respond: accounts() }));
    const res = await call(t, handler, login(body));
    assert.equal(res.statusCode, 401, body.username);
    assert.deepEqual(res.body, { error: 'Invalid credentials' });
    assert.deepEqual(cookies(res), []);
  }
});

test('login without the CSRF pair is refused before anything is looked up', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: accounts() }));
  const res = await call(t, handler, login({ username: USERNAME, password: PASSWORD }, { csrf: false }));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(sql.calls, []);
});

test('each of the three login limits refuses on its own, before the password is checked', async (t) => {
  const limits = [
    rateLimitKey(CLIENT, 'login', USERNAME), // this IP, this account
    rateLimitKey(CLIENT, 'login-ip', ''), // this IP, any account
    `login-account:${USERNAME}`, // this account, any IP
  ];
  for (const exhausted of limits) {
    const sql = useDatabase(scriptedSql({ respond: accounts(), rateCount: (key) => (key === exhausted ? 99 : 1) }));
    const res = await call(t, handler, login({ username: USERNAME, password: PASSWORD }));
    assert.equal(res.statusCode, 429, exhausted);
    assert.equal(res.headers['retry-after'], '60');
    assert.ok(!sql.calls.some(({ statement }) => statement.includes('FROM users')), 'no account lookup');
  }
});

test('a successful login issues an HttpOnly session and a readable CSRF cookie', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: accounts() }));
  const res = await call(t, handler, login({ username: USERNAME, password: PASSWORD }));
  assert.equal(res.statusCode, 200);
  assert.equal('password' in res.body.user, false);

  const [session, csrf] = cookies(res);
  assert.match(session, /^jwt=[^;]+; Path=\/; Max-Age=7200; SameSite=Strict; HttpOnly/);
  assert.match(csrf, new RegExp(`^csrf-token=${res.body.csrfToken}; .*SameSite=Strict`));
  assert.doesNotMatch(csrf, /HttpOnly/, 'the client must be able to echo the CSRF token');

  const token = decodeURIComponent(session.slice(4, session.indexOf(';')));
  const claims = jwt.verify(token, process.env.SESSION_SECRET, getJwtConfig().verifyOptions);
  assert.equal(claims.userId, 2);
  assert.equal(claims.tokenVersion, 4, 'revocation works by bumping this version');

  // Success forgives this account's failures, but not the IP-wide counter:
  // otherwise one valid login would reset a password-spraying run.
  const cleared = sql.calls.filter(({ statement }) => statement.startsWith('DELETE FROM api_rate_limits'))
    .map(({ values }) => values[0]);
  assert.deepEqual(cleared.sort(), [rateLimitKey(CLIENT, 'login', USERNAME), `login-account:${USERNAME}`].sort());
});

test('logout revokes every session of the user and expires both cookies', async (t) => {
  const sql = useDatabase(scriptedSql());
  const res = await call(t, handler, { method: 'POST', query: { action: 'logout' }, as: 'member' });
  assert.equal(res.statusCode, 200);
  const [bump] = sql.writes();
  assert.match(bump.statement, /^UPDATE users SET token_version = token_version \+ 1 WHERE id = \?$/);
  assert.deepEqual(bump.values, [2]);
  assert.deepEqual(cookies(res).map((cookie) => cookie.match(/Max-Age=(\d+)/)[1]), ['0', '0']);
});

function passwordChange(body, respond = () => []) {
  return useDatabase(scriptedSql({
    identities: { member: { mustChangePassword: true } },
    respond: (statement, values) => {
      if (statement.startsWith('SELECT id, username, name, role, password')) {
        return [{ id: 2, username: USERNAME, name: 'Member', role: 'member', password: HASH, tokenVersion: 0 }];
      }
      if (statement.startsWith('UPDATE users SET password')) {
        return [{ id: 2, username: USERNAME, name: 'Member', role: 'member', tokenVersion: 1 }];
      }
      return respond(statement, values);
    },
  }));
}

// A user flagged to change their password is blocked everywhere else, so this
// route has to stay reachable for them or the account is locked out.
test('a user who must change their password can, and the change revokes old sessions', async (t) => {
  const sql = passwordChange();
  const res = await call(t, handler, {
    method: 'POST', query: { action: 'change-password' }, as: 'member',
    body: { currentPassword: PASSWORD, newPassword: 'a much longer passphrase' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.passwordChangeRequired, false);
  const [update] = sql.writes();
  assert.match(update.statement, /must_change_password = false,.*token_version = token_version \+ 1/);
  assert.ok(await bcryptjs.compare('a much longer passphrase', update.values[0]), 'stores a hash of the new password');
  assert.equal(cookies(res).length, 2, 'the current browser gets a fresh session');
});

test('a short, unchanged or unverified new password changes nothing', async (t) => {
  for (const body of [
    { currentPassword: PASSWORD, newPassword: 'short' },
    { currentPassword: PASSWORD, newPassword: PASSWORD },
    { currentPassword: 'not the current one', newPassword: 'a much longer passphrase' },
  ]) {
    const sql = passwordChange();
    const res = await call(t, handler, { method: 'POST', query: { action: 'change-password' }, as: 'member', body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.deepEqual(sql.writes(), []);
  }
});

test('asking who is signed in without a session answers null, not an error', async (t) => {
  useDatabase(scriptedSql());
  const res = await call(t, handler, { query: { action: 'me' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});
