import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { database, initialize, literal, productionStatement } from './postgres-fixture.mjs';

const sql = database();
before(async () => { await initialize(sql); });
const registrationFile = 'api/registrations.js';
const cronFile = 'api/cron/event-reminders.js';
async function event(type = 'event', capacity = 1, date = '2099-09-24') {
  const [row] = await sql(`INSERT INTO events (title, description, date, time, location, type, max_attendees)
    VALUES ('Test', '', ${literal(date)}, '12:00', 'Test', ${literal(type)}, ${capacity}) RETURNING id;`);
  return Number(row.id);
}
async function signup(eventIdNum, email, slots = null) {
  return productionStatement(registrationFile, 'WITH target_event AS', {
    eventIdNum, nowIso: new Date().toISOString(), requestedAttendees: 1,
    sanitizedName: 'Test', sanitizedEmail: email, sanitizedPhone: null,
    sanitizedComments: null, sanitizedLanguage: 'no', childrenNamesParam: slots ? '["Test child"]' : null,
    photoSlotsParam: slots ? JSON.stringify(slots) : null,
  });
}
// Hold the event row until every contender is waiting on its lock. Each psql
// process has its own backend and transaction; no sequential mocked promises.
async function race(id, statements) {
  let locked;
  const blocker = sql(`BEGIN; SELECT id FROM events WHERE id=${id} FOR UPDATE;
    SELECT pg_sleep(1.5); COMMIT;`);
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await sql("SELECT count(*) AS count FROM pg_stat_activity WHERE usename='fau_test' AND wait_event='PgSleep';");
    if (Number(rows[0].count)) { locked = true; break; }
  }
  assert.ok(locked, 'blocker has the event lock');
  const pending = Promise.allSettled(statements.map(statement => sql(statement)));
  // Each contender is a separate psql process, so poll until they have
  // started and queued on the lock rather than sampling once.
  let waiting = 0;
  for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
    const [rows] = await sql("SELECT count(*) AS count FROM pg_stat_activity WHERE usename='fau_test' AND wait_event_type='Lock';");
    waiting = Number(rows.count);
  }
  assert.ok(waiting >= 2, 'multiple real sessions wait concurrently');
  const outcomes = await pending;
  await blocker;
  return outcomes;
}

test('simultaneous final-seat and duplicate requests preserve exact capacity', async () => {
  for (const duplicate of [false, true]) {
    const id = await event('event', duplicate ? 10 : 1);
    const statements = await Promise.all(Array.from({ length: 6 }, (_, i) => signup(id, `${duplicate ? 'same' : i}@example.test`)));
    const results = await race(id, statements);
    assert.ok(results.every(result => result.status === 'fulfilled'), JSON.stringify(results));
    const [state] = await sql(`SELECT current_attendees, (SELECT count(*) FROM event_registrations WHERE event_id=${id}) AS registrations FROM events WHERE id=${id};`);
    assert.deepEqual(state, { current_attendees: '1', registrations: '1' });
  }
});

test('photo slot collision rolls back the loser; a fresh allocation succeeds', async () => {
  const id = await event('foto');
  const outcomes = await race(id, await Promise.all(['a', 'b'].map(name => signup(id, `${name}@example.test`, ['12:00']))));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(result => result.status === 'rejected').reason.message, /23505[\s\S]*photo_event_slots_event_slot_unique_idx/);
  const [winner] = await sql(`SELECT email FROM event_registrations WHERE event_id=${id};`);
  await sql(await signup(id, winner.email === 'a@example.test' ? 'b@example.test' : 'a@example.test', ['12:05']));
  const [state] = await sql(`SELECT current_attendees, (SELECT count(DISTINCT slot) FROM photo_event_slots WHERE event_id=${id}) AS slots FROM events WHERE id=${id};`);
  assert.deepEqual(state, { current_attendees: '2', slots: '2' });
});

test('concurrent cancellation releases once, preserves history and executes cascades/restriction', async () => {
  const id = await event('foto');
  await sql(await signup(id, 'cancel@example.test', ['12:00']));
  await assert.rejects(sql(`DELETE FROM events WHERE id=${id};`), /23503/);
  const [registration] = await sql(`SELECT cancel_token FROM event_registrations WHERE event_id=${id};`);
  const cancel = await productionStatement(registrationFile, 'INSERT INTO event_registration_cancellations', { token: registration.cancel_token, osloToday: () => '2099-09-24' });
  const results = await race(id, [cancel, cancel, cancel]);
  assert.ok(results.every(result => result.status === 'fulfilled'));
  assert.equal(results.reduce((count, result) => count + result.value.length, 0), 1);
  assert.equal((await sql(`SELECT current_attendees FROM events WHERE id=${id};`))[0].current_attendees, '0');
  assert.equal((await sql(`SELECT * FROM photo_event_slots WHERE event_id=${id};`)).length, 0);
  assert.equal((await sql(`SELECT * FROM event_registration_cancellations WHERE event_id=${id};`)).length, 1);
  assert.equal((await sql(cancel)).length, 0);
  await sql(`DELETE FROM events WHERE id=${id};`);
  assert.equal((await sql(`SELECT * FROM event_registration_cancellations WHERE event_id=${id};`)).length, 0);
});

test('concurrent delivery claims are exclusive, expired leases recover, subscriber deletion cascades', async () => {
  const [subscriber] = await sql("INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at, status) VALUES ('delivery@example.test', 'test-token', NOW()::text, 'active') RETURNING id;");
  await sql(`INSERT INTO newsletter_deliveries (item_type,item_id,subscriber_id,title,event_date)
    SELECT 'event', n, ${subscriber.id}, 'Test', '2099-09-24' FROM generate_series(1,6) n;`);
  const claim = await productionStatement(cronFile, 'WITH candidates AS', { targetDate: '2099-09-24', MAX_NEWSLETTER_EMAILS_PER_RUN: 3 });
  const results = await Promise.all([sql(`BEGIN; ${claim}; DO $$ BEGIN PERFORM pg_sleep(0.3); END $$; COMMIT;`), sql(claim)]);
  const ids = results.flat().map(row => row.id);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.equal((await sql(claim)).length, 0);
  await sql(`UPDATE newsletter_deliveries SET claimed_at=NOW()-INTERVAL '11 minutes' WHERE id=${ids[0]};`);
  const recovered = await sql(claim);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].attempts, '2');
  await sql(`DELETE FROM newsletter_subscribers WHERE id=${subscriber.id};`);
  assert.equal((await sql('SELECT * FROM newsletter_deliveries;')).length, 0);
});

test('privacy and delivery retention enforce the six/twelve-month and ninety-day windows', async () => {
  const dates = await sql("SELECT (CURRENT_DATE-INTERVAL '7 months')::date AS old, (CURRENT_DATE-INTERVAL '5 months')::date AS recent;");
  const old = await event('event', 10, dates[0].old), recent = await event('event', 10, dates[0].recent);
  for (const id of [old, recent]) {
    await sql(`INSERT INTO event_registrations (event_id,name,email) VALUES (${id},'Test','retention@example.test');
      INSERT INTO event_registration_cancellations (event_id,registration_id,name,email) VALUES (${id},1,'Test','cancelled@example.test');`);
  }
  await sql("INSERT INTO contact_messages (name,email,subject,message,created_at) VALUES ('Test','old@example.test','Test','Test',(NOW()-INTERVAL '13 months')::text), ('Test','recent@example.test','Test','Test',(NOW()-INTERVAL '11 months')::text);");
  for (const marker of ['DELETE FROM contact_messages', 'DELETE FROM event_registrations r\n', 'DELETE FROM event_registration_cancellations c']) {
    await sql(await productionStatement(cronFile, marker));
  }
  assert.equal((await sql(`SELECT * FROM event_registrations WHERE event_id=${old};`)).length, 0);
  assert.equal((await sql(`SELECT * FROM event_registrations WHERE event_id=${recent};`)).length, 1);
  assert.equal((await sql(`SELECT * FROM event_registration_cancellations WHERE event_id=${old};`)).length, 0);
  assert.equal((await sql(`SELECT * FROM event_registration_cancellations WHERE event_id=${recent};`)).length, 1);
  assert.deepEqual(await sql('SELECT email FROM contact_messages;'), [{ email: 'recent@example.test' }]);
  const [sub] = await sql("INSERT INTO newsletter_subscribers (email,unsubscribe_token,created_at) VALUES ('retention@example.test','retention-token',NOW()::text) RETURNING id;");
  await sql(`INSERT INTO newsletter_deliveries (item_type,item_id,subscriber_id,title,event_date,status,updated_at)
    VALUES ('event',1,${sub.id},'Test','2099-09-24','sent',NOW()-INTERVAL '91 days'),
    ('event',2,${sub.id},'Test','2099-09-24','pending',NOW()-INTERVAL '91 days'),
    ('event',3,${sub.id},'Test','2099-09-24','sent',NOW()-INTERVAL '89 days');`);
  await sql(await productionStatement(cronFile, 'DELETE FROM newsletter_deliveries', { DELIVERY_RETENTION_DAYS: 90 }));
  assert.deepEqual(await sql('SELECT item_id FROM newsletter_deliveries ORDER BY item_id;'), [{ item_id: '2' }, { item_id: '3' }]);
});

test('a delivery that has used every attempt is retired as failed', async () => {
  const [subscriber] = await sql("INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at, status) VALUES ('retire@example.test', 'retire-token', NOW()::text, 'active') RETURNING id;");
  const [delivery] = await sql(`INSERT INTO newsletter_deliveries (item_type,item_id,subscriber_id,title,event_date,status,attempts,claimed_at)
    VALUES ('news', 1, ${subscriber.id}, 'Test', '2099-09-24', 'processing', 5, NOW()) RETURNING id;`);
  await sql(await productionStatement(cronFile, "exhausted ? 'failed'", {
    exhausted: true, retryAt: new Date().toISOString(), safeError: 'mailbox unavailable', delivery: { id: delivery.id },
  }));
  assert.deepEqual(await sql(`SELECT status, claimed_at FROM newsletter_deliveries WHERE id=${delivery.id};`), [{ status: 'failed', claimed_at: '' }]);
  await sql(`DELETE FROM newsletter_subscribers WHERE id=${subscriber.id};`);
});

test('the delivery claim reports whether the queued item is still one to send', async () => {
  const [subscriber] = await sql("INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at, status) VALUES ('eligible@example.test', 'eligible-token', NOW()::text, 'active') RETURNING id;");
  const active = await event('event', 10, '2099-10-01');
  const cancelled = await event('event', 10, '2099-10-01');
  await sql(`UPDATE events SET notify_newsletter = true WHERE id IN (${active}, ${cancelled});
    UPDATE events SET status = 'cancelled' WHERE id = ${cancelled};
    INSERT INTO newsletter_deliveries (item_type,item_id,subscriber_id,title,event_date) VALUES
      ('event', ${active}, ${subscriber.id}, 'Test', '2099-10-01'),
      ('event', ${cancelled}, ${subscriber.id}, 'Test', '2099-10-01'),
      ('news', 999999, ${subscriber.id}, 'Deleted post', '2099-10-01');`);
  const claim = await productionStatement(cronFile, 'WITH candidates AS', { targetDate: '2099-10-01', MAX_NEWSLETTER_EMAILS_PER_RUN: 10 });
  const claimed = (await sql(claim)).filter(row => row.email === 'eligible@example.test');
  const eligible = Object.fromEntries(claimed.map(row => [`${row.itemType}:${row.itemId}`, row.sourceEligible]));
  assert.deepEqual(eligible, { [`event:${active}`]: 't', [`event:${cancelled}`]: 'f', 'news:999999': 'f' });
  await sql(`DELETE FROM newsletter_subscribers WHERE id=${subscriber.id};`);
});
