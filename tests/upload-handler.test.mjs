// The browser uploads straight to Cloudinary with a signature from this
// handler, then registers the result. The file checks themselves are unit
// tested in upload-validation; this covers what the handler adds: what it
// signs, whose asset it accepts, and that it stores what the provider saw.
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { v2 as cloudinary } from 'cloudinary';
import { call, fields, importHandler, scriptedSql, useDatabase } from './helpers.mjs';

Object.assign(process.env, {
  CLOUDINARY_CLOUD_NAME: 'test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
});
const handler = await importHandler('api/upload.js');

// The provider boundary: the real client, with only the lookup replaced.
let resource;
mock.method(cloudinary.api, 'resource', (...args) => resource(...args));

const post = (body, query = {}) => ({ method: 'POST', body, query, as: 'member' });

test('signing refuses a disallowed or oversized file, whichever size field it sends', async (t) => {
  for (const body of [
    { filename: 'virus.exe', mimeType: 'application/octet-stream', fileSize: 10 },
    { filename: 'referat.pdf', mimeType: 'application/pdf', fileSize: 11 * 1024 * 1024 },
    { filename: 'referat.pdf', mimeType: 'application/pdf', size: 11 * 1024 * 1024 },
  ]) {
    useDatabase(scriptedSql());
    const res = await call(t, handler, post(body, { action: 'sign' }));
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.body.signature, undefined);
  }
});

test('signing covers exactly the parameters Cloudinary re-signs, and never returns the secret', async (t) => {
  useDatabase(scriptedSql());
  const res = await call(t, handler, post({ filename: 'Møte referat.pdf', mimeType: 'application/pdf', fileSize: 1000 }, { action: 'sign' }));
  assert.equal(res.statusCode, 200);
  const { signature, timestamp, folder, publicId, allowedFormats } = res.body;
  assert.equal(folder, 'fau-documents');
  assert.match(publicId, /^\d+-M_te_referat\.pdf$/);
  // max_file_size is deliberately not signed: Cloudinary drops it before
  // verifying, so signing it produced "Invalid Signature".
  assert.equal(signature, cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId, allowed_formats: allowedFormats }, 'test-secret'));
  assert.doesNotMatch(JSON.stringify(res.body), /test-secret/);
});

const PDF = {
  filename: 'referat.pdf', title: 'Referat', mimeType: 'application/pdf', fileSize: 1000,
  fileUrl: 'https://res.cloudinary.com/test/raw/upload/v1/fau-documents/1-referat.pdf',
  publicId: 'fau-documents/1-referat.pdf',
};

test('an asset outside our account, folder or URL is refused before the provider is asked', async (t) => {
  for (const change of [
    { title: '' },
    { fileUrl: 'not a url' },
    { fileUrl: 'http://res.cloudinary.com/test/raw/upload/v1/fau-documents/1-referat.pdf' },
    { fileUrl: 'https://evil.example/test/raw/upload/v1/fau-documents/1-referat.pdf' },
    { fileUrl: 'https://res.cloudinary.com/someone-else/raw/upload/v1/fau-documents/1-referat.pdf' },
    { fileUrl: 'https://res.cloudinary.com/test/raw/private/v1/fau-documents/1-referat.pdf' },
    { fileUrl: 'https://res.cloudinary.com/test/raw/upload/v1/elsewhere/1-referat.pdf', publicId: 'elsewhere/1-referat.pdf' },
    { publicId: 'fau-documents/2-other.pdf' },
  ]) {
    const sql = useDatabase(scriptedSql());
    let asked = false;
    resource = async () => { asked = true; return {}; };
    const res = await call(t, handler, post({ ...PDF, ...change }));
    assert.equal(res.statusCode, 400, JSON.stringify(change));
    assert.equal(asked, false, JSON.stringify(change));
    assert.deepEqual(sql.writes(), []);
  }
});

test('an asset the provider cannot confirm is refused and nothing is stored', async (t) => {
  for (const lookup of [
    async () => { throw new Error('not found'); },
    async () => ({ public_id: 'fau-documents/other.pdf', resource_type: 'raw', bytes: 1000 }),
    async () => ({ public_id: PDF.publicId, resource_type: 'raw', format: 'exe', bytes: 1000 }),
    async () => ({ public_id: PDF.publicId, resource_type: 'raw', bytes: 11 * 1024 * 1024 }),
  ]) {
    const sql = useDatabase(scriptedSql());
    resource = lookup;
    const res = await call(t, handler, post(PDF));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(sql.writes(), []);
  }
});

test('a registered document stores the provider size and type, and who uploaded it', async (t) => {
  const sql = useDatabase(scriptedSql({ respond: () => [{ id: 3 }] }));
  resource = async (publicId, options) => {
    assert.deepEqual([publicId, options], ['fau-documents/1-bilde', { resource_type: 'image' }]);
    return { public_id: publicId, resource_type: 'image', format: 'png', bytes: 2048 };
  };
  const res = await call(t, handler, post({
    filename: 'bilde.jpg', title: 'Bilde<script>', mimeType: 'image/jpeg', fileSize: 5,
    fileUrl: 'https://res.cloudinary.com/test/image/upload/v1/fau-documents/1-bilde.jpg',
    publicId: 'fau-documents/1-bilde',
  }));
  assert.equal(res.statusCode, 200);
  const row = fields(sql.writes()[0]);
  assert.equal(row.mime_type, 'image/png', 'what Cloudinary parsed, not what the name claimed');
  assert.equal(row.filename, 'bilde.png');
  assert.equal(row.file_size, 2048, 'the provider size, not the client-reported one');
  assert.equal(row.category, 'annet');
  assert.equal(row.uploaded_by, 'member@example.test');
  assert.doesNotMatch(row.title, /[<>]/);
});
