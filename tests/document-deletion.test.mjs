import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { parseCloudinaryDeliveryUrl } from '../api/_shared/cloudinary-url.js';

const source = readFileSync(new URL('../api/documents.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace('export default ', 'globalThis.handler = ');

function fixture({ type = 'image', extension = 'pdf', result = 'ok', failure, url, publicId,
  authorized = true, csrf = true, databaseFailure = false } = {}) {
  const id = publicId ?? `fau-documents/example${type === 'raw' ? `.${extension}` : ''}`;
  let row = { id: 7, filename: `example.${extension}`, mime_type: extension === 'pdf' ? 'application/pdf' : 'image/png',
    cloudinary_public_id: id,
    cloudinary_url: url ?? `https://res.cloudinary.com/test/${type}/upload/v1/fau-documents/example.${extension}` };
  const effects = [];
  const sql = async (strings, ...values) => {
    assert.deepEqual(values, [7]);
    const statement = strings.join('?').trim();
    if (statement.startsWith('SELECT')) return row ? [row] : [];
    if (statement.startsWith('DELETE')) {
      effects.push('database-delete');
      if (databaseFailure) throw new Error('database unavailable');
      const previous = row; row = null; return previous ? [previous] : [];
    }
    throw new Error('Unexpected query');
  };
  const context = {
    URL, parseCloudinaryDeliveryUrl,
    process: { env: { CLOUDINARY_CLOUD_NAME: 'test' } },
    getDb: () => sql, COUNCIL_ROLES: ['admin', 'member'],
    requireRole: async () => authorized ? { id: 1 } : null,
    requireCsrf: () => csrf, requireIntId: () => 7, withApiHandler: (handler) => handler,
    configureCloudinary: () => ({ uploader: { async destroy(target, options) {
      effects.push({ target, ...options });
      if (failure) throw new Error('provider unavailable');
      return { result };
    } } }),
    console: { error() {} },
  };
  vm.runInNewContext(source, context);
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { run: () => context.handler({ method: 'DELETE', query: { id: '7' } }, res), res, effects, row: () => row };
}

test('deletes image PDFs, raw PDFs and images using their stored delivery identity before metadata', async () => {
  for (const [type, extension] of [['image', 'pdf'], ['raw', 'pdf'], ['image', 'png']]) {
    const f = fixture({ type, extension });
    await f.run();
    assert.equal(f.res.statusCode, 200);
    assert.equal(f.effects[0].resource_type, type);
    assert.equal(f.effects[0].target, `fau-documents/example${type === 'raw' ? '.pdf' : ''}`);
    assert.equal(f.effects[0].invalidate, true);
    assert.equal(f.effects[1], 'database-delete');
    assert.equal(f.row(), null);
  }
});

test('provider failure or unexpected result retains metadata for a retry', async () => {
  for (const options of [{ failure: true }, { result: 'error' }, { result: undefined, failure: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.ok(f.row());
    assert.equal(f.effects.includes('database-delete'), false);
  }
});

test('an absent asset is idempotent, including retry after a database failure', async () => {
  const first = fixture({ databaseFailure: true });
  await assert.rejects(first.run());
  assert.ok(first.row());
  const retry = fixture({ result: 'not found' });
  await retry.run();
  assert.equal(retry.row(), null);
  await retry.run();
  assert.equal(retry.res.statusCode, 404);
  assert.equal(retry.effects.length, 2);
});

test('invalid or unrelated delivery identities cannot delete provider assets or metadata', async () => {
  for (const options of [
    { url: 'https://res.cloudinary.com/other/image/upload/v1/fau-documents/example.pdf' },
    { url: 'https://evil.test/test/image/upload/v1/fau-documents/example.pdf' },
    { url: 'not a URL' }, { publicId: 'fau-documents/different' },
    { publicId: 'other/example', url: 'https://res.cloudinary.com/test/image/upload/v1/other/example.pdf' },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.run());
    assert.ok(f.row());
    assert.equal(f.effects.length, 0);
  }
});

test('unauthorized or CSRF-rejected deletion has no effects', async () => {
  for (const options of [{ authorized: false }, { csrf: false }]) {
    const f = fixture(options); await f.run();
    assert.ok(f.row()); assert.equal(f.effects.length, 0);
  }
});

test('legacy rows without a public ID recover it only from the owned delivery URL', async () => {
  const f = fixture({ publicId: '' });
  await f.run();
  assert.equal(f.effects[0].target, 'fau-documents/example');
  assert.equal(f.row(), null);
});
