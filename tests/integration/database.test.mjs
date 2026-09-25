import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('the homepage query returns only posts flagged for it, newest first, up to its limit', async () => {
  const settingsFile = 'api/secure-settings.js';
  for (const [title, flag, date] of [['Shown old', true, '2098-01-01'], ['Hidden', false, '2098-01-05'], ['Unset', null, '2098-01-06'],
    ['Shown new', true, '2098-01-04'], ['Shown newer', true, '2098-01-03'], ['Shown newest', true, '2098-01-07']]) {
    await sql(`INSERT INTO blog_posts (title, content, status, show_on_homepage, published_date, created_at, updated_at)
      VALUES (${literal(title)}, 'Test', 'published', ${literal(flag)}, ${literal(date)}, NOW()::text, NOW()::text);`);
  }
  await sql("INSERT INTO blog_posts (title, content, status, show_on_homepage, published_date, created_at, updated_at) VALUES ('Archived', 'Test', 'archived', true, '2098-01-09', NOW()::text, NOW()::text);");
  const homepage = await productionStatement(settingsFile, 'show_on_homepage IS TRUE', {
    postId: null, sanitizedCategory: null, homepageOnly: true, searchPattern: null, limit: 3, offset: 0,
  });
  assert.deepEqual((await sql(homepage)).map(row => row.title), ['Shown newest', 'Shown new', 'Shown newer']);
  const everything = await productionStatement(settingsFile, 'show_on_homepage IS TRUE', {
    postId: null, sanitizedCategory: null, homepageOnly: false, searchPattern: null, limit: 500, offset: 0,
  });
  assert.equal((await sql(everything)).length, 6, 'the news page still sees every published post');
  await sql("DELETE FROM blog_posts WHERE published_date LIKE '2098-%';");
});

test('the year-calendar import writes every row in one statement, or none of them', async () => {
  const calendarFile = 'api/yearly-calendar.js';
  const [saved] = await sql(`INSERT INTO yearly_calendar_entries (school_year, year, month, entry_type, date, title, created_at, updated_at)
    VALUES (2090, 2090, 9, 'closed', '2090-09-01', 'Saved', NOW()::text, NOW()::text) RETURNING id;`);
  const id = Number(saved.id);
  const entry = (rowNumber, action, title, extra = {}) => ({
    row_number: rowNumber, action, id: null, school_year: 2090, year: 2090, month: 9, entry_type: 'closed',
    week_number: null, week_number_end: null, date: '2090-09-02', title, description: null, color: null,
    show_on_homepage: false, show_for_parents: false, ...extra,
  });
  const commit = async (writes) => sql(await productionStatement(calendarFile, 'jsonb_to_recordset', {
    writes, now: '2090-01-01T00:00:00.000Z', schoolYear: 2090, createdBy: 'Test',
  }));
  const saved2090 = () => sql('SELECT title, notify_newsletter, created_by FROM yearly_calendar_entries WHERE school_year = 2090 ORDER BY id;');

  const results = await commit([
    entry(2, 'update', 'Earlier edit', { id }),
    entry(3, 'update', 'Later edit', { id }),
    entry(4, 'create', 'New one'),
    entry(5, 'update', 'Deleted since the preview', { id: 999999 }),
  ]);
  assert.deepEqual(results.map(row => row.outcome).sort(), ['created', 'updated']);
  assert.equal(JSON.parse(results.find(row => row.outcome === 'updated').entry).title, 'Later edit', 'the later sheet row wins');
  assert.deepEqual(await saved2090(), [
    { title: 'Later edit', notify_newsletter: 'f', created_by: '' },
    { title: 'New one', notify_newsletter: 'f', created_by: 'Test' },
  ]);

  // A row the database refuses takes the whole batch with it, update included.
  await assert.rejects(commit([entry(6, 'update', 'Must not stick', { id }), entry(7, 'create', null)]), /23502/);
  assert.deepEqual((await saved2090()).map(row => row.title), ['Later edit', 'New one']);
  await sql('DELETE FROM yearly_calendar_entries WHERE school_year = 2090;');
});

// Hold a row that both contenders want uncommitted until each of them waits on
// it, then roll it back: they proceed together, and neither saw the other.
async function raceOnUniqueRow(blockingInsert, statements) {
  const blocker = sql(`BEGIN; ${blockingInsert}; SELECT pg_sleep(1.5); ROLLBACK;`);
  let held = false;
  for (let attempt = 0; attempt < 100 && !held; attempt++) {
    const [row] = await sql("SELECT count(*) AS count FROM pg_stat_activity WHERE usename='fau_test' AND wait_event='PgSleep';");
    held = Number(row.count) > 0;
  }
  assert.ok(held, 'blocker holds the row');
  const pending = Promise.allSettled(statements.map(statement => sql(statement)));
  let waiting = 0;
  for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
    const [row] = await sql("SELECT count(*) AS count FROM pg_stat_activity WHERE usename='fau_test' AND wait_event_type='Lock';");
    waiting = Number(row.count);
  }
  assert.ok(waiting >= 2, 'both contenders wait on the same row');
  const outcomes = await pending;
  await blocker;
  return outcomes;
}

test('two sign-ups for the same new address at once both succeed, and an active one is left alone', async () => {
  const subscribe = (token) => productionStatement('api/contact.js', 'ON CONFLICT (email) DO UPDATE', {
    sanitizedEmail: 'race@example.test', sanitizedName: null, lang: 'no', confirmToken: token.repeat(64),
    newsletterToken: () => token.repeat(32) + 'ff'.repeat(16), now: new Date().toISOString(),
  });
  const outcomes = await raceOnUniqueRow(
    "INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at) VALUES ('race@example.test', 'blocker-token', NOW()::text)",
    [await subscribe('a'), await subscribe('b')],
  );
  assert.ok(outcomes.every(outcome => outcome.status === 'fulfilled'), JSON.stringify(outcomes));
  assert.equal(outcomes.flatMap(outcome => outcome.value).length, 2, 'one inserted, the other re-armed it');
  assert.deepEqual(await sql("SELECT status FROM newsletter_subscribers WHERE email = 'race@example.test';"), [{ status: 'pending' }]);

  await sql("UPDATE newsletter_subscribers SET status = 'active' WHERE email = 'race@example.test';");
  const read = () => sql("SELECT status, confirm_token FROM newsletter_subscribers WHERE email = 'race@example.test';");
  const [before] = await read();
  assert.equal((await sql(await subscribe('c'))).length, 0, 'an active address gets no row back, so no mail');
  assert.deepEqual(await read(), [before], 'and its row is not touched');
  assert.notEqual(before.confirm_token, 'c'.repeat(64));
  await sql("DELETE FROM newsletter_subscribers WHERE email = 'race@example.test';");
});

test('two admins creating the same user at once get one user and no error', async () => {
  const create = (hashed) => productionStatement('api/secure-settings.js', 'ON CONFLICT (username) DO NOTHING', {
    username: 'twice@example.test', hashed, name: 'Twice', role: 'member', now: new Date().toISOString(),
  });
  const outcomes = await raceOnUniqueRow(
    "INSERT INTO users (username, password, name, role, created_at) VALUES ('twice@example.test', 'blocker', 'Blocker', 'member', NOW()::text)",
    [await create('hash-a'), await create('hash-b')],
  );
  assert.ok(outcomes.every(outcome => outcome.status === 'fulfilled'), JSON.stringify(outcomes));
  assert.deepEqual(outcomes.map(outcome => outcome.value.length).sort(), [0, 1], 'the loser gets no row, which the handler answers with a 400');
  assert.equal((await sql("SELECT count(*) AS count FROM users WHERE username = 'twice@example.test';"))[0].count, '1');
  await sql("DELETE FROM users WHERE username = 'twice@example.test';");
});

test('the subscriber list counts each address\'s waiting and failed deliveries', async () => {
  const [subscriber] = await sql("INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at, status) VALUES ('counts@example.test', 'counts-token', NOW()::text, 'active') RETURNING id;");
  await sql(`INSERT INTO newsletter_deliveries (item_type,item_id,subscriber_id,title,event_date,status) VALUES
    ('news', 1, ${subscriber.id}, 'Test', '2099-10-01', 'pending'),
    ('news', 2, ${subscriber.id}, 'Test', '2099-10-01', 'processing'),
    ('news', 3, ${subscriber.id}, 'Test', '2099-10-01', 'failed'),
    ('news', 4, ${subscriber.id}, 'Test', '2099-10-01', 'sent');`);
  const rows = await sql(await productionStatement('api/secure-settings.js', 'COUNT(d.id) FILTER'));
  const row = rows.find(candidate => candidate.email === 'counts@example.test');
  assert.deepEqual([row.pending_deliveries, row.failed_deliveries], ['2', '1']);
  assert.equal('unsubscribe_token' in row, false, 'the list never selects a token');
  await sql(`DELETE FROM newsletter_subscribers WHERE id = ${subscriber.id};`);
});

test('0018 rewrites NOW() text timestamps as ISO and leaves every other value alone', async () => {
  const migration = await readFile(new URL('../../migrations/0018_iso_text_timestamps.sql', import.meta.url), 'utf8');
  await sql(`INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES
    ('Now', 'iso-now@example.test', 'Test', 'Test', '2026-09-24 11:56:00.123456+00'),
    ('Iso', 'iso-iso@example.test', 'Test', 'Test', '2026-09-24T11:56:00.123Z'),
    ('Odd', 'iso-odd@example.test', 'Test', 'Test', 'yesterday');`);
  const id = await event('event', 10, '2099-11-01');
  await sql(`UPDATE events SET newsletter_sent_at = '2026-09-24 21:00:00.5+02' WHERE id = ${id};
    INSERT INTO event_registrations (event_id, name, email, reminder_sent_at) VALUES (${id}, 'Test', 'iso@example.test', '2026-09-24 07:00:01+00');`);

  await sql(migration);
  await sql(migration); // safe to rerun

  assert.deepEqual(await sql("SELECT name, created_at FROM contact_messages WHERE email LIKE 'iso-%' ORDER BY name;"), [
    { name: 'Iso', created_at: '2026-09-24T11:56:00.123Z' },
    { name: 'Now', created_at: '2026-09-24T11:56:00.123Z' },
    { name: 'Odd', created_at: 'yesterday' },
  ]);
  assert.deepEqual(await sql(`SELECT newsletter_sent_at FROM events WHERE id = ${id};`), [{ newsletter_sent_at: '2026-09-24T19:00:00.500Z' }]);
  assert.deepEqual(await sql(`SELECT reminder_sent_at FROM event_registrations WHERE event_id = ${id};`), [{ reminder_sent_at: '2026-09-24T07:00:01.000Z' }]);
  await sql(`DELETE FROM contact_messages WHERE email LIKE 'iso-%'; DELETE FROM event_registrations WHERE event_id = ${id}; DELETE FROM events WHERE id = ${id};`);
});

test('editor images never push a real document off the public list', async () => {
  await sql(`INSERT INTO documents (title, filename, category, uploaded_by, uploaded_at)
    VALUES ('Vedtekter', 'vedtekter.pdf', 'vedtekter', 'member@example.test', '2020-01-01T00:00:00.000Z');
    INSERT INTO documents (title, filename, category, uploaded_by, uploaded_at)
    SELECT 'Bilde ' || n, 'bilde-' || n || '.png', 'editor-image', 'member@example.test', '2026-01-01T00:00:00.000Z'
    FROM generate_series(1, 501) n;`);
  const list = await sql(await productionStatement('api/documents.js', "WHERE category <> 'editor-image'"));
  assert.deepEqual(list.map(row => row.title), ['Vedtekter'], 'older than 501 editor images, and still listed');
  await sql("DELETE FROM documents WHERE uploaded_by = 'member@example.test';");
});

test('a reminder that has failed three times is not claimed again', async () => {
  const id = await event('event', 10, '2099-12-01');
  await sql(`INSERT INTO event_registrations (event_id, name, email, reminder_attempts) VALUES
    (${id}, 'Tried twice', 'twice@example.test', 2),
    (${id}, 'Tried three times', 'thrice@example.test', 3);`);
  const claim = await productionStatement(cronFile, 'WITH due AS', {
    targetDate: '2099-12-01', MAX_REMINDER_ATTEMPTS: 3, MAX_REMINDERS_PER_RUN: 100,
  });
  const claimed = await sql(claim);
  assert.deepEqual(claimed.map(row => [row.email, row.reminderAttempts]), [['twice@example.test', '3']]);
  await sql(`DELETE FROM event_registrations WHERE event_id = ${id}; DELETE FROM events WHERE id = ${id};`);
});

test('a flagged news post with nobody to send to is stamped, not kept for later subscribers', async () => {
  // Deliberately the last test: it needs a subscriber list with nobody active.
  await sql("UPDATE newsletter_subscribers SET status = 'unsubscribed';");
  const post = async (title) => (await sql(`INSERT INTO blog_posts (title, content, status, notify_newsletter, published_date, created_at, updated_at)
    VALUES (${literal(title)}, 'Test', 'published', true, '2099-10-02', NOW()::text, NOW()::text) RETURNING id;`))[0].id;
  const fanOut = await productionStatement(cronFile, 'WITH due_items AS', { targetDate: '2099-10-02' });
  const stamp = await productionStatement(cronFile, 'UPDATE blog_posts p', { stampedAt: new Date().toISOString() });
  const sentAt = async (id) => (await sql(`SELECT newsletter_sent_at FROM blog_posts WHERE id=${id};`))[0].newsletter_sent_at;

  const unheard = await post('Nobody subscribed yet');
  assert.equal((await sql(fanOut)).length, 0);
  await sql(stamp);
  assert.notEqual(await sentAt(unheard), '', 'stamped although no delivery row exists');

  // A parent who subscribes later is not sent it.
  await sql("INSERT INTO newsletter_subscribers (email, unsubscribe_token, created_at, status) VALUES ('later@example.test', 'later-token', NOW()::text, 'active');");
  assert.equal((await sql(fanOut)).length, 0);

  // With someone subscribed, a post flagged after tonight's fan-out waits for
  // the next run rather than being stamped unsent.
  const flaggedLate = await post('Flagged after the fan-out');
  await sql(stamp);
  assert.equal(await sentAt(flaggedLate), '');
  assert.equal((await sql(fanOut)).length, 1);
});
