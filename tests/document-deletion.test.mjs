import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { v2 as cloudinary } from 'cloudinary';
import { call, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

Object.assign(process.env, {
  CLOUDINARY_CLOUD_NAME: 'test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
});
const handler = await importHandler('api/documents.js');

// The provider boundary: the real client, with only the network call replaced.
let destroy;
mock.method(cloudinary.uploader, 'destroy', (...args) => destroy(...args));

function fixture(t, { type = 'image', extension = 'pdf', result = 'ok', failure, url, publicId,
  databaseFailure = false } = {}) {
  const id = publicId ?? `fau-documents/example${type === 'raw' ? `.${extension}` : ''}`;
  let row = { id: 7, filename: `example.${extension}`, mime_type: extension === 'pdf' ? 'application/pdf' : 'image/png',
    cloudinary_public_id: id,
    cloudinary_url: url ?? `https://res.cloudinary.com/test/${type}/upload/v1/fau-documents/example.${extension}` };
  const effects = [];
  useDatabase(scriptedSql({
    respond(statement, values) {
      assert.deepEqual(values, [7]);
      if (statement.startsWith('SELECT')) return row ? [row] : [];
      if (statement.startsWith('DELETE FROM documents')) {
        effects.push('database-delete');
        if (databaseFailure) throw new Error('database unavailable');
        const previous = row; row = null; return previous ? [previous] : [];
      }
      throw new Error(`Unexpected query: ${statement}`);
    },
  }));
  destroy = async (target, options) => {
    effects.push({ target, ...options });
    if (failure) throw new Error('provider unavailable');
    return { result };
  };
  return {
    run: (options = {}) => call(t, handler, { method: 'DELETE', query: { id: '7' }, as: 'member', ...options }),
    effects,
    row: () => row,
  };
}

test('deletes image PDFs, raw PDFs and images using their stored delivery identity before metadata', async (t) => {
  for (const [type, extension] of [['image', 'pdf'], ['raw', 'pdf'], ['image', 'png']]) {
    const f = fixture(t, { type, extension });
    const res = await f.run();
    assert.equal(res.statusCode, 200);
    assert.equal(f.effects[0].resource_type, type);
    assert.equal(f.effects[0].target, `fau-documents/example${type === 'raw' ? '.pdf' : ''}`);
    assert.equal(f.effects[0].invalidate, true);
    assert.equal(f.effects[1], 'database-delete');
    assert.equal(f.row(), null);
  }
});

test('provider failure or unexpected result retains metadata for a retry', async (t) => {
  for (const options of [{ failure: true }, { result: 'error' }, { result: undefined, failure: true }]) {
    const f = fixture(t, options);
    assert.equal((await f.run()).statusCode, 500);
    assert.ok(f.row());
    assert.equal(f.effects.includes('database-delete'), false);
  }
});

test('an absent asset is idempotent, including retry after a database failure', async (t) => {
  const first = fixture(t, { databaseFailure: true });
  assert.equal((await first.run()).statusCode, 500);
  assert.ok(first.row());
  const retry = fixture(t, { result: 'not found' });
  assert.equal((await retry.run()).statusCode, 200);
  assert.equal(retry.row(), null);
  assert.equal((await retry.run()).statusCode, 404);
  assert.equal(retry.effects.length, 2);
});

test('invalid or unrelated delivery identities cannot delete provider assets or metadata', async (t) => {
  for (const options of [
    { url: 'https://res.cloudinary.com/other/image/upload/v1/fau-documents/example.pdf' },
    { url: 'https://evil.test/test/image/upload/v1/fau-documents/example.pdf' },
    { url: 'not a URL' }, { publicId: 'fau-documents/different' },
    { publicId: 'other/example', url: 'https://res.cloudinary.com/test/image/upload/v1/other/example.pdf' },
  ]) {
    const f = fixture(t, options);
    assert.equal((await f.run()).statusCode, 500, JSON.stringify(options));
    assert.ok(f.row());
    assert.equal(f.effects.length, 0);
  }
});

test('legacy rows without a public ID recover it only from the owned delivery URL', async (t) => {
  const f = fixture(t, { publicId: '' });
  await f.run();
  assert.equal(f.effects[0].target, 'fau-documents/example');
  assert.equal(f.row(), null);
});

// The list is public. `uploaded_by` holds the uploader's login e-mail, so it
// must never be part of what an anonymous visitor can read.
test('the public list does not publish who uploaded a document', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [] }));
  const res = await call(t, handler, { method: 'GET' });
  assert.equal(res.statusCode, 200);
  assert.equal(sql.calls.length, 1);
  assert.doesNotMatch(sql.calls[0].statement, /uploaded_by/);
  // TRACE-005: editor images are filtered before the LIMIT, not after it.
  assert.match(sql.calls[0].statement, /WHERE category <> 'editor-image' ORDER BY uploaded_at DESC LIMIT 500$/);
});
