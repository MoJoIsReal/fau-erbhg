#!/usr/bin/env node
// Live check of the R2 bucket behind the private media shares
// (docs/mediedeling.md). Not part of `npm test`: it needs the real R2
// credentials and talks to Cloudflare. Run it after setting the bucket up and
// after changing its CORS or lifecycle rules:
//
//   node --env-file=.env.local scripts/media-smoke.mjs [https://www.erdal-bhg.no]
//
// It writes one small object under media/smoke-test/, checks it, and deletes
// it again. It never touches a real share.
import crypto from 'node:crypto';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { deleteObjects, getR2, isR2Configured, presignGet, presignPut, r2Endpoint } from '../api/_shared/r2.js';

const siteOrigin = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? 'https://www.erdal-bhg.no').replace(/\/+$/, '');
let failures = 0;
function report(ok, message) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FEIL'}  ${message}`);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!isR2Configured()) {
  console.error('Mangler R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY eller R2_BUCKET.');
  process.exit(2);
}

const { client, bucket } = getR2();
const key = `media/smoke-test/${crypto.randomBytes(8).toString('hex')}`;
const body = Buffer.from('fau-media-smoke-test');
const endpoint = r2Endpoint();

try {
  // 1. Upload through a presigned PUT, exactly as the admin page does.
  const putUrl = await presignPut(key, 'text/plain', body.length);
  const put = await fetch(putUrl, { method: 'PUT', body, headers: { 'Content-Type': 'text/plain' } });
  report(put.ok, `presignert opplasting (PUT) svarte ${put.status}`);

  // 2. A wrong Content-Type is refused, because the type is part of the signature.
  const wrongType = await fetch(putUrl, { method: 'PUT', body, headers: { 'Content-Type': 'text/html' } });
  report(wrongType.status === 403, `feil Content-Type på samme URL avvises (${wrongType.status})`);

  // 3. A playback URL works while it is valid.
  const get = await fetch(await presignGet(key));
  report(get.ok && (await get.text()) === body.toString(), `presignert avspilling (GET) svarte ${get.status}`);

  // 4. …and stops working once it has expired. The site signs for an hour;
  //    this signs for five seconds to see the same rule take effect.
  const shortUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 5 });
  const early = await fetch(shortUrl);
  report(early.ok, `kortlevd URL virker før utløp (${early.status})`);
  await wait(8000);
  const late = await fetch(shortUrl);
  report(late.status === 403, `samme URL avvises etter utløp (${late.status})`);

  // 5. Nothing is readable without a signature: no public access, no listing.
  const unsigned = await fetch(`${endpoint}/${bucket}/${key}`);
  report(unsigned.status === 400 || unsigned.status === 403, `usignert lesing avvises (${unsigned.status})`);
  const listing = await fetch(`${endpoint}/${bucket}?list-type=2`);
  report(listing.status === 400 || listing.status === 403, `usignert listing av bøtta avvises (${listing.status})`);

  // 6. CORS: the site may upload from the browser, another origin may not.
  const preflight = (origin) => fetch(putUrl, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
  });
  const ours = await preflight(siteOrigin);
  report(ours.headers.get('access-control-allow-origin') === siteOrigin,
    `CORS tillater ${siteOrigin} (${ours.headers.get('access-control-allow-origin') ?? 'ingen header'})`);
  report(/etag/i.test(ours.headers.get('access-control-expose-headers') ?? ''),
    'CORS eksponerer ETag (nødvendig for store videoer)');
  // Only meaningful once our own origin is let through: an unreachable bucket
  // sends no CORS headers to anyone.
  const theirs = await preflight('https://example.com');
  report(ours.headers.has('access-control-allow-origin') && !theirs.headers.get('access-control-allow-origin'),
    'CORS avviser et fremmed domene');
} catch (error) {
  report(false, `uventet feil: ${error?.name ?? 'Error'} ${error?.message ?? ''}`);
} finally {
  await deleteObjects([key]).catch(() => report(false, 'kunne ikke slette testobjektet'));
}

console.log(failures ? `\n${failures} sjekk(er) feilet.` : '\nAlt ser riktig ut.');
process.exit(failures ? 1 : 0);
