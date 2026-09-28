// The rules behind a private media share (api/_shared/media-share.js,
// shared/media.js): link tokens, sealed copies, view grants, lifetimes,
// upload plans and file signatures.
import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers.mjs';
import {
  createViewGrant,
  extendedExpiry,
  extensionDays,
  generateShareToken,
  getMediaLimits,
  hashShareToken,
  isWellFormedShareToken,
  lifetimeDays,
  matchesFileSignature,
  newObjectKey,
  openShareToken,
  partLength,
  publishExpiry,
  sealShareToken,
  shareLink,
  uploadPlan,
  verifyViewGrant,
} from '../api/_shared/media-share.js';
import { MEDIA_ACCEPT, mediaKind, normalizeMediaMime } from '../shared/media.js';

const DAY = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

test('a link token carries 256 bits of randomness and is URL-safe', () => {
  const tokens = new Set(Array.from({ length: 200 }, generateShareToken));
  assert.equal(tokens.size, 200);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(isWellFormedShareToken(token));
    // 43 base64url characters decode to exactly 32 bytes.
    assert.equal(Buffer.from(token, 'base64url').length, 32);
  }
  for (const bad of ['', 'short', `${generateShareToken()}x`, 'a'.repeat(42) + '=', null, 42]) {
    assert.equal(isWellFormedShareToken(bad), false, String(bad));
  }
});

test('the database keeps a hash for lookup and a sealed copy only the server can open', () => {
  const token = generateShareToken();
  const hash = hashShareToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashShareToken(token), hash, 'the lookup hash is deterministic');

  const sealed = sealShareToken(token);
  assert.ok(!sealed.includes(token), 'the sealed copy must not contain the token');
  assert.notEqual(sealShareToken(token), sealed, 'each seal uses a fresh IV');
  assert.equal(openShareToken(sealed), token);

  const [version, iv, tag, body] = sealed.split('.');
  const flipped = `${body[0] === 'A' ? 'B' : 'A'}${body.slice(1)}`;
  assert.equal(openShareToken([version, iv, tag, flipped].join('.')), null, 'tampering is detected');
  assert.equal(openShareToken('garbage'), null);
  assert.equal(openShareToken(null), null);
});

test('the link puts the token in the fragment, which browsers never send to a server', () => {
  const token = generateShareToken();
  const link = new URL(shareLink(token));
  assert.equal(link.pathname, '/del');
  assert.equal(link.hash, `#${token}`);
  assert.equal(link.search, '');
});

test('a view grant opens one share, until it expires, and cannot be forged', () => {
  const now = Date.parse('2026-09-28T10:00:00Z');
  const grant = createViewGrant(7, now);
  assert.ok(verifyViewGrant(grant, 7, now));
  assert.ok(verifyViewGrant(grant, 7, now + 11 * 60 * 60 * 1000));
  assert.equal(verifyViewGrant(grant, 7, now + 13 * 60 * 60 * 1000), false, 'expired');
  assert.equal(verifyViewGrant(grant, 8, now), false, 'bound to its share');

  const [id, expiry, signature] = grant.split('.');
  assert.equal(verifyViewGrant(`${id}.${Number(expiry) + 3600}.${signature}`, 7, now), false, 'expiry is signed');
  assert.equal(verifyViewGrant(`8.${expiry}.${signature}`, 8, now), false, 'share id is signed');
  for (const bad of [undefined, '', '7', '7.x.y', 'x'.repeat(500)]) {
    assert.equal(verifyViewGrant(bad, 7, now), false, String(bad));
  }
});

test('a new share lives 90 days by default and at most 180', () => {
  assert.equal(lifetimeDays(undefined), 90);
  assert.equal(lifetimeDays(''), 90);
  assert.equal(lifetimeDays(30), 30);
  assert.equal(lifetimeDays('180'), 180);
  for (const bad of [0, -1, 181, 1.5, 'abc', 365]) assert.equal(lifetimeDays(bad), null, String(bad));

  const now = Date.parse('2026-09-28T10:00:00Z');
  assert.equal(publishExpiry(90, now), new Date(now + 90 * DAY).toISOString());
});

test('an extension adds at most 180 days and never passes 365 days after publication', () => {
  assert.equal(extensionDays(180), 180);
  for (const bad of [0, 181, 2.5, 'x', undefined]) assert.equal(extensionDays(bad), null, String(bad));

  const publishedAt = '2026-01-01T00:00:00.000Z';
  const published = Date.parse(publishedAt);
  const ceiling = new Date(published + 365 * DAY).toISOString();

  // Extends from the current expiry while it is still in the future.
  const now = published + 10 * DAY;
  const first = extendedExpiry({ publishedAt, expiresAt: new Date(published + 90 * DAY).toISOString() }, 180, now);
  assert.deepEqual(first, { expiresAt: new Date(published + 270 * DAY).toISOString(), capped: false });

  // Past that, it stops at the ceiling and says so.
  const second = extendedExpiry({ publishedAt, expiresAt: first.expiresAt }, 180, now);
  assert.deepEqual(second, { expiresAt: ceiling, capped: true });

  // At the ceiling, there is nothing left to extend.
  assert.equal(extendedExpiry({ publishedAt, expiresAt: ceiling }, 1, now), null);

  // An expired share (not yet removed by the cron) extends from today.
  const later = published + 200 * DAY;
  const revived = extendedExpiry({ publishedAt, expiresAt: new Date(published + 90 * DAY).toISOString() }, 30, later);
  assert.deepEqual(revived, { expiresAt: new Date(later + 30 * DAY).toISOString(), capped: false });
});

test('small files upload in one request, large ones in equal parts R2 accepts', () => {
  assert.deepEqual(uploadPlan(1), { mode: 'single' });
  assert.deepEqual(uploadPlan(8 * MIB), { mode: 'single' });

  const gib = 1024 * MIB;
  const plan = uploadPlan(gib + 1);
  assert.equal(plan.mode, 'multipart');
  assert.equal(plan.partSize, 8 * MIB);
  assert.equal(plan.partCount, 129);
  assert.equal(partLength(gib + 1, plan.partSize, 1), 8 * MIB);
  assert.equal(partLength(gib + 1, plan.partSize, 129), 1, 'the last part carries the remainder');

  // R2: at most 10 000 parts, every part but the last at least 5 MiB.
  const huge = uploadPlan(100 * gib);
  assert.ok(huge.partCount <= 10000);
  assert.ok(huge.partSize >= 5 * MIB);
  assert.equal(huge.partSize % MIB, 0);
});

test('limits default to 1 GiB per file and a 9 GiB quota under the R2 free tier', () => {
  const gib = 1024 * MIB;
  assert.deepEqual(getMediaLimits({}), { maxFileBytes: gib, quotaBytes: 9 * gib });
  assert.deepEqual(
    getMediaLimits({ MEDIA_MAX_FILE_BYTES: String(2 * gib), MEDIA_STORAGE_QUOTA_BYTES: String(20 * gib) }),
    { maxFileBytes: 2 * gib, quotaBytes: 20 * gib },
  );
  assert.equal(getMediaLimits({ MEDIA_MAX_FILE_BYTES: String(50 * gib) }).maxFileBytes, 5 * gib, 'hard ceiling');
  assert.equal(getMediaLimits({ MEDIA_MAX_FILE_BYTES: 'lots' }).maxFileBytes, gib);
});

test('object keys are random and never carry a file name', () => {
  const key = newObjectKey(12);
  assert.match(key, /^media\/12\/[0-9a-f]{32}$/);
  assert.notEqual(newObjectKey(12), key);
});

test('only the allowed types pass, under whatever name the browser reports them', () => {
  assert.equal(normalizeMediaMime('image/jpeg'), 'image/jpeg');
  assert.equal(normalizeMediaMime('IMAGE/JPG'), 'image/jpeg');
  assert.equal(normalizeMediaMime('audio/x-m4a'), 'audio/mp4');
  assert.equal(normalizeMediaMime('audio/x-wav'), 'audio/wav');
  assert.equal(normalizeMediaMime('', 'IMG_0001.MOV'), 'video/quicktime');
  assert.equal(normalizeMediaMime('application/octet-stream', 'lyd.m4a'), 'audio/mp4');
  for (const [type, name] of [['text/html', 'x.mp4'], ['image/heic', 'x.heic'], ['image/svg+xml', ''], ['', 'x.exe'], ['', '']]) {
    assert.equal(normalizeMediaMime(type, name), null, `${type} ${name}`);
  }
  assert.equal(mediaKind('video/quicktime'), 'video');
  assert.equal(mediaKind('audio/wav'), 'audio');
  assert.equal(mediaKind('toString'), null);
  assert.match(MEDIA_ACCEPT, /\.mov/);
});

test('an upload must start with the bytes of the type it claims', () => {
  const bytes = (...values) => {
    const out = new Uint8Array(16);
    let offset = 0;
    for (const value of values) {
      const chunk = typeof value === 'string' ? Buffer.from(value, 'latin1') : Uint8Array.from(value);
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  };
  const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0]);
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = bytes('RIFF', [0, 0, 0, 0], 'WEBP');
  const wav = bytes('RIFF', [0, 0, 0, 0], 'WAVE');
  const mp4 = bytes([0, 0, 0, 0x20], 'ftypisom');
  const mov = bytes([0, 0, 0, 0x14], 'ftypqt  ');
  const mp3 = bytes('ID3', [4, 0]);
  const mp3Frame = bytes([0xff, 0xfb, 0x90, 0x64]);
  const html = bytes('<!doctype html>');

  assert.ok(matchesFileSignature('image/jpeg', jpeg));
  assert.ok(matchesFileSignature('image/png', png));
  assert.ok(matchesFileSignature('image/webp', webp));
  assert.ok(matchesFileSignature('audio/wav', wav));
  assert.ok(matchesFileSignature('video/mp4', mp4));
  assert.ok(matchesFileSignature('video/quicktime', mov));
  assert.ok(matchesFileSignature('audio/mp4', mp4));
  assert.ok(matchesFileSignature('audio/mpeg', mp3));
  assert.ok(matchesFileSignature('audio/mpeg', mp3Frame));

  assert.equal(matchesFileSignature('image/jpeg', png), false);
  assert.equal(matchesFileSignature('image/webp', wav), false);
  assert.equal(matchesFileSignature('video/mp4', html), false);
  assert.equal(matchesFileSignature('audio/mpeg', html), false);
  assert.equal(matchesFileSignature('image/png', new Uint8Array(4)), false, 'too short');
  assert.equal(matchesFileSignature('text/html', html), false);
});
