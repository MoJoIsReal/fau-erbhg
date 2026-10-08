// api/media.js through the handler harness: the real handler and middleware,
// a scripted database, and R2 stubbed on its real client's `send`. Presigned
// URLs are signed for real (signing is local), so their expiry is checked on
// the URL a browser would get.
import assert from 'node:assert/strict';
import test from 'node:test';
import bcryptjs from 'bcryptjs';
import { call, fields, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

process.env.R2_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET = 'fau-media-test';

const handler = await importHandler('api/media.js');
const { getR2, r2Endpoint, resetR2ForTests } = await import('../api/_shared/r2.js');
const { generateShareToken, hashShareToken, sealShareToken, createViewGrant, purgeExpiredShares } =
  await import('../api/_shared/media-share.js');

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const UNAVAILABLE = { error: 'Not found', code: 'SHARE_UNAVAILABLE' };

// A small in-memory stand-in for media_shares / media_files. The statements
// are matched loosely, but the filters that matter — status, expiry — are
// evaluated here rather than assumed, so a share past its expiry really is
// invisible to the lookup.
function mediaDb({ shares = [], files = [], rateCount = 1 } = {}) {
  const respond = (statement, values) => {
    if (statement.startsWith('SELECT id, title, description, pin_hash, expires_at FROM media_shares WHERE token_hash')) {
      const [hash, now] = values;
      assert.match(statement, /status = 'published'/);
      assert.match(statement, /expires_at > \?/);
      return shares.filter((share) => share.token_hash === hash && share.status === 'published' && share.expires_at > now);
    }
    if (statement.startsWith('SELECT id, kind, mime_type, object_key, preview_key, width, height FROM media_files')) {
      return files.filter((file) => file.share_id === values[0] && file.status === 'ready');
    }
    return undefined;
  };
  return scriptedSql({ respond, rateCount });
}

function publishedShare(overrides = {}) {
  const token = generateShareToken();
  const now = Date.now();
  return {
    token,
    row: {
      id: 7,
      token_hash: hashShareToken(token),
      title: 'Sommerfest',
      description: 'Bilder fra festen',
      pin_hash: null,
      status: 'published',
      published_at: iso(now - DAY),
      expires_at: iso(now + 30 * DAY),
      ...overrides,
    },
  };
}

const FILES = [
  { id: 1, share_id: 7, kind: 'image', mime_type: 'image/jpeg', object_key: 'media/7/aaaa', width: 4032, height: 3024, status: 'ready' },
  { id: 2, share_id: 7, kind: 'video', mime_type: 'video/mp4', object_key: 'media/7/bbbb', width: 1920, height: 1080, status: 'ready' },
];

const view = (t, body) => call(t, handler, { method: 'POST', query: { action: 'view' }, body, csrf: false });

// Stub R2 on the real client, recording each command by its class name.
function stubR2(t, answer = () => ({})) {
  const sent = [];
  t.mock.method(getR2().client, 'send', async (command) => {
    const name = command.constructor.name;
    sent.push({ name, input: command.input });
    return answer(name, command.input);
  });
  return sent;
}

// ---------------------------------------------------------------------------
// The share page

test('an invalid token gets the generic "not available" answer', async (t) => {
  for (const token of [undefined, '', 'short', 'x'.repeat(43), generateShareToken()]) {
    useDatabase(mediaDb({ shares: [publishedShare().row] }));
    const res = await view(t, { token });
    assert.equal(res.statusCode, 404, String(token));
    assert.deepEqual(res.body, UNAVAILABLE, String(token));
  }
});

test('an expired, revoked or unpublished share answers exactly like one that never existed', async (t) => {
  const expired = publishedShare({ expires_at: iso(Date.now() - 1000) });
  const draft = publishedShare({ status: 'draft' });
  for (const { token, row } of [expired, draft]) {
    useDatabase(mediaDb({ shares: [row], files: FILES }));
    const res = await view(t, { token });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, UNAVAILABLE);
  }
  // Revoked: the rows are gone, so the lookup simply finds nothing.
  const revoked = publishedShare();
  useDatabase(mediaDb({ shares: [] }));
  const res = await view(t, { token: revoked.token });
  assert.deepEqual([res.statusCode, res.body], [404, UNAVAILABLE]);
});

test('a valid link returns one-hour presigned URLs on the private R2 endpoint', async (t) => {
  const { token, row } = publishedShare();
  useDatabase(mediaDb({ shares: [row], files: FILES }));
  const before = Date.now();
  const res = await view(t, { token });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, 'Sommerfest');
  assert.equal(res.body.expiresAt, row.expires_at);
  assert.equal(res.body.grant, undefined, 'no grant without a PIN');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.body.files.map((file) => file.kind), ['image', 'video']);

  const urlsExpire = Date.parse(res.body.urlsExpireAt);
  assert.ok(urlsExpire >= before + 3600 * 1000 - 1000 && urlsExpire <= Date.now() + 3600 * 1000);

  for (const [index, file] of res.body.files.entries()) {
    const url = new URL(file.url);
    assert.equal(url.origin, 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
    assert.equal(url.pathname, `/fau-media-test/${FILES[index].object_key}`);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '3600', 'playback URLs expire after one hour');
    assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
    const signedAt = url.searchParams.get('X-Amz-Date');
    assert.match(signedAt, /^\d{8}T\d{6}Z$/, 'the expiry counts from this signing time');
  }
});

test('the response never carries the token, a file key or anything to look it up by', async (t) => {
  const { token, row } = publishedShare();
  useDatabase(mediaDb({ shares: [row], files: FILES }));
  const res = await view(t, { token });
  const text = JSON.stringify({ ...res.body, files: res.body.files.map(({ url, ...rest }) => rest) });
  assert.ok(!text.includes(token));
  assert.ok(!text.includes(row.token_hash));
  assert.ok(!text.includes('media/7/'));
});

test('a PIN share asks for the PIN, refuses a wrong one and counts the failure', async (t) => {
  const { token, row } = publishedShare({ pin_hash: await bcryptjs.hash('4321', 4) });

  let sql = useDatabase(mediaDb({ shares: [row], files: FILES }));
  let res = await view(t, { token });
  assert.deepEqual([res.statusCode, res.body.code], [401, 'PIN_REQUIRED']);
  assert.equal(res.body.files, undefined, 'nothing about the files before the PIN');

  sql = useDatabase(mediaDb({ shares: [row], files: FILES }));
  res = await view(t, { token, pin: '1111' });
  assert.deepEqual([res.statusCode, res.body.code], [401, 'PIN_INVALID']);
  const failures = sql.calls.filter(({ statement }) => statement.startsWith('INSERT INTO api_rate_limits'));
  assert.equal(failures.length, 3, 'the view limit plus both PIN failure counters');

  sql = useDatabase(mediaDb({ shares: [row], files: FILES }));
  res = await view(t, { token, pin: '4321' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.files.length, 2);
  assert.match(res.body.grant, /^7\.\d+\.[A-Za-z0-9_-]+$/);
  assert.ok(sql.calls.some(({ statement }) => statement.startsWith('DELETE FROM api_rate_limits')), 'success clears the IP counter');
  assert.ok(sql.calls.some(({ statement }) => statement.startsWith('UPDATE api_rate_limits SET count = GREATEST(count - 1, 0)')),
    'and hands back the share-wide attempt, so parents opening it do not use up its failure budget');

  // The grant stands in for the PIN when the page asks for fresh URLs.
  useDatabase(mediaDb({ shares: [row], files: FILES }));
  res = await view(t, { token, grant: res.body.grant });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.grant, undefined);

  // A grant for another share is worth nothing here.
  useDatabase(mediaDb({ shares: [row], files: FILES }));
  res = await view(t, { token, grant: createViewGrant(8) });
  assert.deepEqual([res.statusCode, res.body.code], [401, 'PIN_REQUIRED']);
});

test('too many wrong PINs lock the share, even with the right PIN', async (t) => {
  const { token, row } = publishedShare({ pin_hash: await bcryptjs.hash('4321', 4) });
  const { identityRateLimitKey } = await import('../api/_shared/rate-limit.js');
  const shareKey = identityRateLimitKey('media-pin-share', 7);
  // 30 failures already counted; this attempt is the 31st.
  const sql = useDatabase(mediaDb({ shares: [row], files: FILES, rateCount: (key) => (key === shareKey ? 31 : 1) }));
  const res = await view(t, { token, pin: '4321' });
  assert.deepEqual([res.statusCode, res.body.code], [429, 'PIN_LOCKED']);
  assert.ok(Number(res.headers['retry-after']) > 0);
  assert.ok(sql.calls.some(({ statement }) => statement.startsWith('UPDATE api_rate_limits')),
    'the IP attempt is handed back, since the PIN was never checked');
});

// A stand-in for the atomic upsert: each call adds one to its key and sees the
// result, the way concurrent requests see PostgreSQL's row lock.
function liveCounter() {
  const counts = new Map();
  return (key) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts.get(key);
  };
}

const fromIp = (ip) => ({ headers: { 'x-real-ip': ip } });
const viewFrom = (t, ip, body) => call(t, handler, { method: 'POST', query: { action: 'view' }, body, csrf: false, ...fromIp(ip) });

// Checking the count, then the PIN, then recording the failure let a burst of
// concurrent guesses all read the same count: 120 per IP got a PIN checked.
test('concurrent wrong PINs from one address stop at its limit', async (t) => {
  const { token, row } = publishedShare({ pin_hash: await bcryptjs.hash('4321', 4) });
  useDatabase(mediaDb({ shares: [row], files: FILES, rateCount: liveCounter() }));
  const results = await Promise.all(Array.from({ length: 20 }, () => viewFrom(t, '203.0.113.20', { token, pin: '1111' })));
  const codes = results.map((res) => res.body.code);
  assert.equal(codes.filter((code) => code === 'PIN_INVALID').length, 5);
  assert.equal(codes.filter((code) => code === 'PIN_LOCKED').length, 15);
});

test('concurrent wrong PINs spread over many addresses stop at the share limit', async (t) => {
  const { token, row } = publishedShare({ pin_hash: await bcryptjs.hash('4321', 4) });
  useDatabase(mediaDb({ shares: [row], files: FILES, rateCount: liveCounter() }));
  const ips = Array.from({ length: 12 }, (_, index) => `198.51.100.${index + 1}`);
  const results = await Promise.all(ips.flatMap((ip) => Array.from({ length: 5 }, () => viewFrom(t, ip, { token, pin: '1111' }))));
  const codes = results.map((res) => res.body.code);
  assert.equal(codes.filter((code) => code === 'PIN_INVALID').length, 30);
  assert.equal(codes.filter((code) => code === 'PIN_LOCKED').length, 30);
});

test('the lookup itself is rate limited per IP', async (t) => {
  const { token, row } = publishedShare();
  const sql = useDatabase(mediaDb({ shares: [row], files: FILES, rateCount: 121 }));
  const res = await view(t, { token });
  assert.deepEqual([res.statusCode, res.body.code], [429, 'RATE_LIMITED']);
  assert.ok(!sql.calls.some(({ statement }) => statement.includes('FROM media_shares')), 'refused before the lookup');
});

test('viewing is POST only, so the token never sits in a query string', async (t) => {
  useDatabase(mediaDb());
  const res = await call(t, handler, { method: 'GET', query: { action: 'view', token: generateShareToken() } });
  assert.equal(res.statusCode, 405);
});

// ---------------------------------------------------------------------------
// Admin

test('admin endpoints refuse anonymous callers, members and staff before touching anything', async (t) => {
  const routes = [
    { method: 'GET', query: { action: 'list' } },
    { method: 'GET', query: { action: 'link', id: '1' } },
    { method: 'POST', query: { action: 'create' }, body: { title: 'x' } },
    { method: 'POST', query: { action: 'upload-init' } },
    { method: 'POST', query: { action: 'publish' } },
    { method: 'POST', query: { action: 'extend' } },
    { method: 'DELETE', query: { id: '1' } },
  ];
  for (const route of routes) {
    for (const as of [null, 'staff', 'member']) {
      const sql = useDatabase(mediaDb());
      const res = await call(t, handler, { ...route, as });
      assert.equal(res.statusCode, as ? 403 : 401, `${as ?? 'anonymous'} ${route.method} ${route.query.action ?? ''}`);
      assert.ok(sql.calls.every(({ statement }) => statement.startsWith('SELECT username')));
    }
  }
});

test('create stores a draft with a hashed token, a sealed copy and a hashed PIN', async (t) => {
  const sql = useDatabase(scriptedSql({
    respond: (statement, values) => statement.startsWith('INSERT INTO media_shares')
      ? [{ id: 3, title: values[2], description: values[3], status: 'draft', has_pin: values[4] !== null, lifetime_days: values[6], created_at: values[8], published_at: null, expires_at: null }]
      : undefined,
  }));
  const res = await call(t, handler, {
    method: 'POST',
    query: { action: 'create' },
    body: { title: '  Juleavslutning <b>2026</b> ', description: 'Video fra avdeling Tusenfryd', pin: '123456' },
    as: 'admin',
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.share.status, 'draft');
  assert.equal(res.body.share.lifetimeDays, 90, 'defaults to 90 days');
  assert.equal(res.body.share.hasPin, true);

  const row = fields(sql.writes()[0]);
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.match(row.token_sealed, /^v1\./);
  assert.equal(row.title, 'Juleavslutning b2026/b');
  assert.ok(await bcryptjs.compare('123456', row.pin_hash));
  assert.equal(row.created_by, 1);
  assert.equal(JSON.stringify(res.body).includes('123456'), false);
});

test('create refuses a bad PIN, a missing title and a lifetime past 180 days', async (t) => {
  for (const body of [
    { title: 'x', pin: '12' },
    { title: 'x', pin: '4321' },
    { title: 'x', pin: '54321' },
    { title: 'x', pin: 'abcdef' },
    { title: '' },
    { title: 'x', expiresInDays: 181 },
  ]) {
    const sql = useDatabase(scriptedSql());
    const res = await call(t, handler, { method: 'POST', query: { action: 'create' }, body, as: 'admin' });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.deepEqual(sql.writes(), []);
  }
});

test('upload-init refuses other types, oversized files and uploads past the quota', async (t) => {
  const draft = (statement) => statement.startsWith('SELECT s.status') ? [{ status: 'draft', file_count: 0 }] : undefined;
  const cases = [
    [{ shareId: 1, mimeType: 'text/html', size: 10 }, 415, 'UNSUPPORTED_TYPE'],
    [{ shareId: 1, mimeType: 'image/svg+xml', size: 10 }, 415, 'UNSUPPORTED_TYPE'],
    [{ shareId: 1, mimeType: 'video/mp4', size: 1024 ** 3 + 1 }, 413, 'FILE_TOO_LARGE'],
  ];
  for (const [body, status, code] of cases) {
    useDatabase(scriptedSql({ respond: draft }));
    const res = await call(t, handler, { method: 'POST', query: { action: 'upload-init' }, body, as: 'admin' });
    assert.deepEqual([res.statusCode, res.body.code], [status, code], JSON.stringify(body));
  }

  // The quota check lives in the INSERT; no row back means it would not fit.
  const sql = useDatabase(scriptedSql({ respond: (statement) => draft(statement) ?? [] }));
  const res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-init' }, body: { shareId: 1, mimeType: 'video/mp4', size: 5000 }, as: 'admin',
  });
  assert.deepEqual([res.statusCode, res.body.code], [507, 'STORAGE_QUOTA']);
  const insert = sql.calls.find(({ statement }) => statement.startsWith('INSERT INTO media_files'));
  assert.match(insert.statement, /WHERE \(SELECT COALESCE\(SUM\(size_bytes \+ COALESCE\(preview_bytes, 0\)\), 0\) FROM media_files\) \+ \? \+ \? <= \?/);
  assert.equal(insert.values.at(-1), 9 * 1024 ** 3);
});

test('upload-init only adds files to a draft', async (t) => {
  useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT s.status') ? [{ status: 'published', file_count: 1 }] : undefined }));
  const res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-init' }, body: { shareId: 1, mimeType: 'image/png', size: 10 }, as: 'admin',
  });
  assert.deepEqual([res.statusCode, res.body.code], [409, 'NOT_DRAFT']);
});

test('a small file gets one PUT URL with its exact type and size signed', async (t) => {
  useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT s.status')) return [{ status: 'draft', file_count: 0 }];
      if (statement.startsWith('INSERT INTO media_files')) return [{ id: 41 }];
      return undefined;
    },
  }));
  const res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-init' }, body: { shareId: 1, mimeType: 'image/jpeg', size: 2_000_000, width: 4032, height: 3024 }, as: 'admin',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, 'single');
  const url = new URL(res.body.url);
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '1800');
  assert.match(url.pathname, /^\/fau-media-test\/media\/1\/[0-9a-f]{32}$/);
});

test('a large video becomes a multipart upload with signed part lengths', async (t) => {
  const size = 700 * 1024 * 1024 + 123;
  const sent = stubR2(t, (name) => name === 'CreateMultipartUploadCommand' ? { UploadId: 'upload-1' } : {});
  const sql = useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT s.status')) return [{ status: 'draft', file_count: 0 }];
      if (statement.startsWith('INSERT INTO media_files')) return [{ id: 42 }];
      if (statement.startsWith('SELECT f.id, f.share_id')) {
        return [{ id: 42, share_id: 1, object_key: 'media/1/cafe', kind: 'video', mime_type: 'video/quicktime', size_bytes: String(size), upload_id: 'upload-1' }];
      }
      return undefined;
    },
  }));
  let res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-init' }, body: { shareId: 1, mimeType: 'video/quicktime', size }, as: 'admin',
  });
  assert.deepEqual(res.body, { fileId: 42, mode: 'multipart', partSize: 8 * 1024 * 1024, partCount: 88 });
  assert.equal(sent[0].name, 'CreateMultipartUploadCommand');
  assert.equal(sent[0].input.ContentType, 'video/quicktime');
  assert.ok(sql.calls.some(({ statement, values }) => statement.startsWith('UPDATE media_files SET upload_id') && values[0] === 'upload-1'));

  res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-parts' }, body: { fileId: 42, partNumbers: [1, 88] }, as: 'admin',
  });
  assert.equal(res.statusCode, 200);
  const [first, last] = res.body.urls.map(({ url }) => new URL(url));
  assert.equal(first.searchParams.get('partNumber'), '1');
  assert.equal(first.searchParams.get('uploadId'), 'upload-1');
  assert.equal(first.searchParams.get('X-Amz-SignedHeaders'), 'content-length;host');
  assert.equal(last.searchParams.get('partNumber'), '88');

  res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-parts' }, body: { fileId: 42, partNumbers: [89] }, as: 'admin',
  });
  assert.equal(res.statusCode, 400, 'no part past the plan');
});

test('upload-complete deletes a file whose stored bytes are not what was approved', async (t) => {
  const file = { id: 43, share_id: 1, object_key: 'media/1/beef', kind: 'image', mime_type: 'image/png', size_bytes: '1000', upload_id: null };
  const sent = stubR2(t, (name) => {
    if (name === 'HeadObjectCommand') return { ContentLength: 1000, ContentType: 'image/png' };
    if (name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('<!doctype html><p>')) } };
    return {};
  });
  const sql = useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT f.id, f.share_id') ? [file] : undefined }));
  const res = await call(t, handler, { method: 'POST', query: { action: 'upload-complete' }, body: { fileId: 43 }, as: 'admin' });
  assert.deepEqual([res.statusCode, res.body.code], [422, 'UPLOAD_MISMATCH']);
  assert.deepEqual(sent.map(({ name }) => name), ['HeadObjectCommand', 'GetObjectCommand', 'DeleteObjectsCommand']);
  assert.deepEqual(sent[2].input.Delete.Objects, [{ Key: 'media/1/beef' }]);
  assert.ok(sql.writes().some(({ statement }) => statement.startsWith('DELETE FROM media_files')));
});

test('upload-complete marks a verified file ready', async (t) => {
  const file = { id: 44, share_id: 1, object_key: 'media/1/f00d', kind: 'image', mime_type: 'image/jpeg', size_bytes: '1000', upload_id: null };
  stubR2(t, (name) => {
    if (name === 'HeadObjectCommand') return { ContentLength: 1000, ContentType: 'image/jpeg' };
    if (name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...new Array(12).fill(0)]) } };
    return {};
  });
  const sql = useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT f.id, f.share_id') ? [file] : undefined }));
  const res = await call(t, handler, { method: 'POST', query: { action: 'upload-complete' }, body: { fileId: 44 }, as: 'admin' });
  assert.equal(res.statusCode, 200);
  const update = fields(sql.writes().at(-1));
  assert.deepEqual(update, { status: 'ready', upload_id: null, preview_key: null, preview_bytes: null, id: 44 });
});

test('a size mismatch is refused before any bytes are read', async (t) => {
  const file = { id: 45, share_id: 1, object_key: 'media/1/abcd', kind: 'video', mime_type: 'video/mp4', size_bytes: '5000', upload_id: null };
  const sent = stubR2(t, (name) => name === 'HeadObjectCommand' ? { ContentLength: 4999, ContentType: 'video/mp4' } : {});
  useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT f.id, f.share_id') ? [file] : undefined }));
  const res = await call(t, handler, { method: 'POST', query: { action: 'upload-complete' }, body: { fileId: 45 }, as: 'admin' });
  assert.equal(res.statusCode, 422);
  assert.ok(!sent.some(({ name }) => name === 'GetObjectCommand'));
});

test('publish starts the clock and returns the link; an empty draft cannot be published', async (t) => {
  const token = generateShareToken();
  const share = { id: 5, status: 'draft', lifetime_days: 90, token_sealed: sealShareToken(token) };
  let sql = useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT id, status, lifetime_days')) return [share];
      if (statement.startsWith('SELECT id, object_key, preview_key, upload_id, status FROM media_files')) return [];
      return undefined;
    },
  }));
  let res = await call(t, handler, { method: 'POST', query: { action: 'publish' }, body: { id: 5 }, as: 'admin' });
  assert.deepEqual([res.statusCode, res.body.code], [409, 'EMPTY_SHARE']);
  assert.deepEqual(sql.writes(), []);

  stubR2(t);
  sql = useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT id, status, lifetime_days')) return [share];
      if (statement.startsWith('SELECT id, object_key, preview_key, upload_id, status FROM media_files')) {
        return [{ id: 1, object_key: 'media/5/a', upload_id: null, status: 'ready' }, { id: 2, object_key: 'media/5/b', upload_id: 'u', status: 'uploading' }];
      }
      if (statement.startsWith('UPDATE media_shares')) return [{ id: 5 }];
      return undefined;
    },
  }));
  const before = Date.now();
  res = await call(t, handler, { method: 'POST', query: { action: 'publish' }, body: { id: 5 }, as: 'admin' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.link, `https://www.erdal-bhg.no/del#${token}`);

  const update = fields(sql.writes().find(({ statement }) => statement.startsWith('UPDATE media_shares')));
  assert.equal(update.status, 'published');
  const expires = Date.parse(update.expires_at) - Date.parse(update.published_at);
  assert.equal(expires, 90 * DAY);
  assert.ok(Date.parse(update.published_at) >= before);
  assert.ok(sql.writes().some(({ statement, values }) => statement.startsWith('DELETE FROM media_files') && values[0] === 2),
    'an unfinished file is discarded, not published');
});

test('extend stops at 365 days after publication', async (t) => {
  const publishedAt = iso(Date.now() - 300 * DAY);
  const share = { id: 6, status: 'published', published_at: publishedAt, expires_at: iso(Date.now() + 10 * DAY) };
  const sql = useDatabase(scriptedSql({
    respond: (statement) => statement.startsWith('SELECT id, status, published_at') ? [share] : undefined,
  }));
  const res = await call(t, handler, { method: 'POST', query: { action: 'extend' }, body: { id: 6, days: 180 }, as: 'admin' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.capped, true);
  const update = fields(sql.writes()[0]);
  assert.equal(update.expires_at, iso(Date.parse(publishedAt) + 365 * DAY));

  for (const days of [0, 181]) {
    useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT id, status, published_at') ? [share] : undefined }));
    const refused = await call(t, handler, { method: 'POST', query: { action: 'extend' }, body: { id: 6, days }, as: 'admin' });
    assert.equal(refused.statusCode, 400, String(days));
  }

  const atCeiling = { ...share, expires_at: iso(Date.parse(publishedAt) + 365 * DAY) };
  useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT id, status, published_at') ? [atCeiling] : undefined }));
  const full = await call(t, handler, { method: 'POST', query: { action: 'extend' }, body: { id: 6, days: 1 }, as: 'admin' });
  assert.deepEqual([full.statusCode, full.body.code], [409, 'MAX_LIFETIME']);
});

test('revoke deletes the files from R2 first, then the rows', async (t) => {
  const order = [];
  const sent = stubR2(t, (name) => { order.push(name); return {}; });
  const sql = useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT id FROM media_shares')) return [{ id: 9 }];
      if (statement.startsWith('SELECT object_key, preview_key, upload_id, status FROM media_files')) {
        return [{ object_key: 'media/9/a', upload_id: null, status: 'ready' }, { object_key: 'media/9/b', upload_id: null, status: 'ready' }];
      }
      if (statement.startsWith('DELETE FROM media_shares')) order.push('DELETE media_shares');
      return undefined;
    },
  }));
  const res = await call(t, handler, { method: 'DELETE', query: { id: '9' }, as: 'admin' });
  assert.deepEqual(res.body, { success: true, filesDeleted: 2 });
  assert.deepEqual(order, ['DeleteObjectsCommand', 'DELETE media_shares']);
  assert.deepEqual(sent[0].input.Delete.Objects, [{ Key: 'media/9/a' }, { Key: 'media/9/b' }]);
  assert.ok(sql.writes().some(({ statement, values }) => statement.startsWith('DELETE FROM media_shares') && values[0] === 9));
});

test('a failed R2 delete keeps the rows, so the next run can try again', async (t) => {
  stubR2(t, () => ({ Errors: [{ Key: 'media/9/a', Code: 'InternalError' }] }));
  const sql = useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT id FROM media_shares')) return [{ id: 9 }];
      if (statement.startsWith('SELECT object_key')) return [{ object_key: 'media/9/a', upload_id: null, status: 'ready' }];
      return undefined;
    },
  }));
  const res = await call(t, handler, { method: 'DELETE', query: { id: '9' }, as: 'admin' });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.ok(!sql.writes().some(({ statement }) => statement.startsWith('DELETE FROM media_shares')));
});

test('writes answer 503 rather than signing anything when R2 is not configured', async (t) => {
  const saved = process.env.R2_BUCKET;
  delete process.env.R2_BUCKET;
  t.after(() => { process.env.R2_BUCKET = saved; });
  const sql = useDatabase(scriptedSql());
  const res = await call(t, handler, { method: 'POST', query: { action: 'create' }, body: { title: 'x' }, as: 'admin' });
  assert.deepEqual([res.statusCode, res.body.code], [503, 'NOT_CONFIGURED']);
  assert.deepEqual(sql.writes(), []);
});

test('the list reports storage use against the quota and marks expired shares', async (t) => {
  const now = Date.now();
  useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT s.id, s.title')) {
        return [
          { id: 1, title: 'A', description: null, status: 'published', has_pin: false, lifetime_days: 90, created_at: iso(now - 100 * DAY), published_at: iso(now - 100 * DAY), expires_at: iso(now - DAY), file_count: 3, total_bytes: '3000' },
          { id: 2, title: 'B', description: null, status: 'published', has_pin: true, lifetime_days: 90, created_at: iso(now - DAY), published_at: iso(now - DAY), expires_at: iso(now + 89 * DAY), file_count: 1, total_bytes: '10' },
        ];
      }
      if (statement.startsWith('SELECT COALESCE(SUM(size_bytes + COALESCE(preview_bytes, 0))')) return [{ used: '3010' }];
      return undefined;
    },
  }));
  const res = await call(t, handler, { method: 'GET', query: { action: 'list' }, as: 'admin' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.storage.usedBytes, 3010);
  assert.deepEqual(res.body.shares.map((share) => share.expired), [true, false]);
  assert.equal(res.body.shares[0].totalBytes, 3000);
  assert.equal(res.body.shares[1].maxExpiresAt, iso(now - DAY + 365 * DAY));
  assert.ok(!JSON.stringify(res.body).includes('token'), 'no token or hash in the list');
});

// ---------------------------------------------------------------------------
// Cleanup (the morning cron)

test('the cron purge removes expired shares and day-old drafts, files first', async (t) => {
  const now = Date.parse('2026-09-28T07:00:00Z');
  const sent = stubR2(t);
  const sql = scriptedSql({
    respond: (statement, values) => {
      if (statement.startsWith('SELECT id FROM media_shares')) {
        assert.equal(values[0], iso(now), 'published shares at or past expiry');
        assert.equal(values[1], iso(now - DAY), 'drafts older than a day');
        return [{ id: 1 }, { id: 2 }];
      }
      if (statement.startsWith('SELECT object_key')) {
        return values[0] === 1
          ? [{ object_key: 'media/1/a', upload_id: null, status: 'ready' }]
          : [{ object_key: 'media/2/a', upload_id: 'u-2', status: 'uploading' }];
      }
      return undefined;
    },
  });
  t.mock.method(console, 'log', () => {});
  const summary = await purgeExpiredShares(sql, now);
  assert.deepEqual(summary, { sharesDeleted: 2, filesDeleted: 2, failed: 0 });
  assert.deepEqual(sent.map(({ name }) => name), ['DeleteObjectsCommand', 'AbortMultipartUploadCommand', 'DeleteObjectsCommand']);
  assert.equal(sql.writes().filter(({ statement }) => statement.startsWith('DELETE FROM media_shares')).length, 2);
});

test('one share failing to purge does not stop the rest', async (t) => {
  let call = 0;
  stubR2(t, () => (++call === 1 ? { Errors: [{ Key: 'k', Code: 'InternalError' }] } : {}));
  const sql = scriptedSql({
    respond: (statement, values) => {
      if (statement.startsWith('SELECT id FROM media_shares')) return [{ id: 1 }, { id: 2 }];
      if (statement.startsWith('SELECT object_key')) return [{ object_key: `media/${values[0]}/a`, upload_id: null, status: 'ready' }];
      return undefined;
    },
  });
  const errors = [];
  t.mock.method(console, 'error', (line) => errors.push(line));
  const summary = await purgeExpiredShares(sql, Date.now());
  assert.deepEqual(summary, { sharesDeleted: 1, filesDeleted: 1, failed: 1 });
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('media/1/a'), 'the failure log carries no object key');
});

test('an EU-jurisdiction bucket is reached on its own endpoint, and nothing else is accepted', async (t) => {
  const base = { R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' };
  assert.equal(r2Endpoint(base), 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com');
  assert.equal(r2Endpoint({ ...base, R2_JURISDICTION: 'EU' }), 'https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com');
  assert.throws(() => r2Endpoint({ ...base, R2_JURISDICTION: 'evil.example' }), /R2_JURISDICTION/);
  assert.throws(() => r2Endpoint({ R2_ACCOUNT_ID: 'attacker.example/x' }), /account id/);

  process.env.R2_JURISDICTION = 'eu';
  resetR2ForTests();
  t.after(() => { delete process.env.R2_JURISDICTION; resetR2ForTests(); });
  const { token, row } = publishedShare();
  useDatabase(mediaDb({ shares: [row], files: FILES }));
  const res = await view(t, { token });
  assert.equal(new URL(res.body.files[0].url).host, '0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com');
});

// ---------------------------------------------------------------------------
// Grid previews (MEDIA_PREVIEW_* in shared/media.js, migration 0022)

const draftShare = (id) => (statement) => {
  if (statement.startsWith('SELECT s.status')) return [{ status: 'draft', file_count: 0 }];
  if (statement.startsWith('INSERT INTO media_files')) return [{ id }];
  return undefined;
};
// The insert is INSERT … SELECT (the quota check rides on it), which fields()
// does not read: pair its column list with the values in order.
const insertOf = (sql) => {
  const { statement, values } = sql.calls.find((call) => call.statement.startsWith('INSERT INTO media_files'));
  const columns = statement.match(/^INSERT INTO media_files \(([^)]*)\) SELECT/)[1].split(',').map((column) => column.trim());
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
};

test('a photo may bring a small preview, signed for its own type and size under its own key', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: draftShare(51) }));
  const res = await call(t, handler, {
    method: 'POST', query: { action: 'upload-init' }, as: 'admin',
    body: { shareId: 1, mimeType: 'image/jpeg', size: 4_000_000, preview: { mimeType: 'image/webp', size: 48_000 } },
  });
  assert.equal(res.statusCode, 200);
  const insert = insertOf(sql);
  assert.match(insert.preview_key, /^media\/1\/[0-9a-f]{32}$/);
  assert.notEqual(insert.preview_key, insert.object_key);
  assert.equal(insert.preview_bytes, 48_000);
  const url = new URL(res.body.previewUrl);
  assert.equal(url.pathname, `/fau-media-test/${insert.preview_key}`);
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');

  // Anything outside the rules is not stored, and the upload goes on without it.
  for (const [mimeType, preview] of [
    ['video/mp4', { mimeType: 'image/webp', size: 48_000 }],
    ['image/jpeg', { mimeType: 'image/png', size: 48_000 }],
    ['image/jpeg', { mimeType: 'image/webp', size: 600 * 1024 }],
    ['image/jpeg', { mimeType: 'image/webp', size: 0 }],
  ]) {
    const plain = useDatabase(scriptedSql({ respond: draftShare(52) }));
    const answer = await call(t, handler, { method: 'POST', query: { action: 'upload-init' }, as: 'admin', body: { shareId: 1, mimeType, size: 5000, preview } });
    assert.equal(answer.statusCode, 200, JSON.stringify(preview));
    assert.equal(answer.body.previewUrl, undefined, JSON.stringify(preview));
    assert.deepEqual([insertOf(plain).preview_key, insertOf(plain).preview_bytes], [null, null]);
  }
});

test('upload-complete keeps a verified preview and drops one that does not match, without failing', async (t) => {
  const file = {
    id: 46, share_id: 1, object_key: 'media/1/f00d', kind: 'image', mime_type: 'image/jpeg', size_bytes: '1000', upload_id: null,
    preview_key: 'media/1/beefcafe', preview_bytes: 300,
  };
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...new Array(12).fill(0)]);
  const webp = Uint8Array.from(Buffer.from('RIFF\0\0\0\0WEBPVP8 '));
  for (const [previewHead, kept] of [
    [{ ContentLength: 300, ContentType: 'image/webp' }, true],
    [{ ContentLength: 299, ContentType: 'image/webp' }, false],
    [{ ContentLength: 300, ContentType: 'image/png' }, false],
  ]) {
    const sent = stubR2(t, (name, input) => {
      const isPreview = input.Key === file.preview_key;
      if (name === 'HeadObjectCommand') return isPreview ? previewHead : { ContentLength: 1000, ContentType: 'image/jpeg' };
      if (name === 'GetObjectCommand') return { Body: { transformToByteArray: async () => (isPreview ? webp : jpeg) } };
      return {};
    });
    const sql = useDatabase(scriptedSql({ respond: (statement) => statement.startsWith('SELECT f.id, f.share_id') ? [file] : undefined }));
    const res = await call(t, handler, { method: 'POST', query: { action: 'upload-complete' }, body: { fileId: 46 }, as: 'admin' });
    assert.equal(res.statusCode, 200, JSON.stringify(previewHead));
    assert.equal(res.body.file.preview, kept);
    const update = fields(sql.writes().at(-1));
    assert.deepEqual([update.status, update.preview_key, update.preview_bytes], kept ? ['ready', 'media/1/beefcafe', 300] : ['ready', null, null]);
    const deleted = sent.filter(({ name }) => name === 'DeleteObjectsCommand').flatMap(({ input }) => input.Delete.Objects);
    assert.deepEqual(deleted, kept ? [] : [{ Key: 'media/1/beefcafe' }], 'a rejected preview is removed from R2');
    t.mock.restoreAll();
  }
});

test('the share page gets a preview URL for photos that have one, and the original for everything', async (t) => {
  const { token, row } = publishedShare();
  const files = [{ ...FILES[0], preview_key: 'media/7/pppp' }, { ...FILES[1], preview_key: null }];
  useDatabase(mediaDb({ shares: [row], files }));
  const res = await view(t, { token });
  assert.equal(res.statusCode, 200);
  assert.equal(new URL(res.body.files[0].previewUrl).pathname, '/fau-media-test/media/7/pppp');
  assert.equal(new URL(res.body.files[0].url).pathname, '/fau-media-test/media/7/aaaa', 'the original stays available');
  assert.equal(res.body.files[1].previewUrl, null);
});

test('revoking a share deletes the previews along with the originals', async (t) => {
  const sent = stubR2(t);
  useDatabase(scriptedSql({
    respond: (statement) => {
      if (statement.startsWith('SELECT id FROM media_shares')) return [{ id: 9 }];
      if (statement.startsWith('SELECT object_key, preview_key, upload_id, status FROM media_files')) {
        return [{ object_key: 'media/9/a', preview_key: 'media/9/a-small', upload_id: null, status: 'ready' }, { object_key: 'media/9/b', preview_key: null, upload_id: null, status: 'ready' }];
      }
      return undefined;
    },
  }));
  const res = await call(t, handler, { method: 'DELETE', query: { id: '9' }, as: 'admin' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sent[0].input.Delete.Objects, [{ Key: 'media/9/a' }, { Key: 'media/9/a-small' }, { Key: 'media/9/b' }]);
});
