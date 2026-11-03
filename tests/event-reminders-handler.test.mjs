// The scheduled handler run as Vercel runs it, through withApiHandler, against
// a scripted database. The work it schedules is tested in event-reminders,
// newsletter-broadcast and the integration suite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

process.env.GMAIL_USER = 'sender@example.test';
process.env.GMAIL_APP_PASSWORD = 'test-only-password';
const handler = await importHandler('api/cron/event-reminders.js');

// TEST-003. The handler itself was never run in a test: the newsletter task,
// the secret check and a hand-given ?date= (which answered 500 when it was
// not a date) only ran in production.
test('the cron handler checks its secret and date, and runs the evening task', async (t) => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  t.after(() => { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; });
  const cron = (query, secret = 'test-cron-secret') => ({ query, csrf: false, headers: secret ? { authorization: `Bearer ${secret}` } : {} });

  let sql = useDatabase(scriptedSql());
  assert.equal((await call(t, handler, cron({}, null))).statusCode, 401);
  assert.equal((await call(t, handler, cron({}, 'wrong'))).statusCode, 401);
  assert.deepEqual(sql.calls, []);

  for (const date of ['2026-13-45', 'i morgen', '2026-02-30']) {
    sql = useDatabase(scriptedSql());
    const res = await call(t, handler, cron({ date }));
    assert.equal(res.statusCode, 400, date);
    assert.deepEqual(sql.calls, [], date);
  }

  sql = useDatabase(scriptedSql());
  const evening = await call(t, handler, cron({ task: 'newsletter', date: '2099-09-24' }));
  assert.equal(evening.statusCode, 200);
  assert.deepEqual([evening.body.task, evening.body.targetDate], ['newsletter', '2099-09-24']);
  const fanOut = sql.calls.find(({ statement }) => statement.startsWith('WITH due_items AS'));
  assert.ok(fanOut, 'the evening run queues the next day');
  assert.ok(fanOut.values.includes('2099-09-24'));
});
