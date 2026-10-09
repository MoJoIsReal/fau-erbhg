import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import { getJwtConfig } from './jwt-config.js';
import { publicBaseUrl } from './newsletter.js';
import { logEvent } from './log.js';
import {
  abortMultipartUpload,
  deleteObjects,
} from './r2.js';
import {
  MEDIA_DEFAULT_LIFETIME_DAYS,
  MEDIA_MAX_EXTENSION_DAYS,
  MEDIA_MAX_INITIAL_DAYS,
  MEDIA_MAX_LIFETIME_DAYS,
} from '../../shared/media.js';

// The rules behind a private media share (docs/mediedeling.md): the link
// token, the PIN, the post-PIN view grant, lifetimes, upload plans and the
// cleanup the nightly cron and "revoke" both run.

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Link token. 256 bits from the CSPRNG, base64url: 43 characters. It travels
// in the URL fragment (/del#<token>), which browsers never send to a server,
// so it appears in no access log and no Referer. The API receives it in a
// POST body. Only its SHA-256 is used for lookup; the database also keeps an
// AES-GCM copy so the council can copy the link again later, sealed with a
// key derived from SESSION_SECRET — a database dump alone opens nothing.

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateShareToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function isWellFormedShareToken(token) {
  return typeof token === 'string' && SHARE_TOKEN_PATTERN.test(token);
}

export function hashShareToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function deriveKey(purpose) {
  const { secret } = getJwtConfig();
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'fau-media-share', purpose, 32));
}

export function sealShareToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('link-token-v1'), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ciphertext].map((part) =>
    typeof part === 'string' ? part : part.toString('base64url')).join('.');
}

/** The token, or null when the sealed value cannot be opened (e.g. the secret rotated). */
export function openShareToken(sealed) {
  const [version, iv, tag, ciphertext] = String(sealed ?? '').split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('link-token-v1'), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function shareLink(token) {
  return `${publicBaseUrl()}/del#${token}`;
}

// ---------------------------------------------------------------------------
// PIN. Hashed with bcrypt like account passwords. A 4–8 digit PIN is small
// enough to brute-force offline from its hash, so the protection that matters
// is the API's failure limit per share; the hash only keeps it out of plain
// sight in the database.

const PIN_BCRYPT_ROUNDS = 10;

export function hashPin(pin) {
  return bcryptjs.hash(pin, PIN_BCRYPT_ROUNDS);
}

export function verifyPin(pin, pinHash) {
  if (typeof pin !== 'string' || !pinHash) return Promise.resolve(false);
  return bcryptjs.compare(pin, pinHash);
}

// ---------------------------------------------------------------------------
// View grant. After a correct PIN the share page holds this instead of the
// PIN, so fetching fresh playback URLs an hour later does not ask a parent to
// type the PIN again or count against the failure limit. It is bound to one
// share and expires; it is useless without the link token beside it.

export const VIEW_GRANT_SECONDS = 12 * 60 * 60;

function grantSignature(shareId, expiresAt) {
  return crypto
    .createHmac('sha256', deriveKey('view-grant-v1'))
    .update(`${shareId}.${expiresAt}`)
    .digest('base64url');
}

export function createViewGrant(shareId, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + VIEW_GRANT_SECONDS;
  return `${shareId}.${expiresAt}.${grantSignature(shareId, expiresAt)}`;
}

export function verifyViewGrant(grant, shareId, now = Date.now()) {
  if (typeof grant !== 'string' || grant.length > 200) return false;
  const [id, expiresAt, signature] = grant.split('.');
  if (id !== String(shareId) || !/^\d{1,12}$/.test(expiresAt ?? '') || !signature) return false;
  if (Number(expiresAt) * 1000 <= now) return false;
  const expected = Buffer.from(grantSignature(shareId, Number(expiresAt)));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------------------
// Lifetime. A share's clock starts when it is published, not while it is a
// draft being uploaded to.

export function lifetimeDays(value) {
  if (value === undefined || value === null || value === '') return MEDIA_DEFAULT_LIFETIME_DAYS;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= MEDIA_MAX_INITIAL_DAYS ? days : null;
}

export function publishExpiry(days, now = Date.now()) {
  return new Date(now + days * DAY_MS).toISOString();
}

/**
 * The new expiry after extending by `days`, counted from the later of today
 * and the current expiry and never past MEDIA_MAX_LIFETIME_DAYS after
 * publication. Null when the share is already at that ceiling.
 * @returns {{ expiresAt: string, capped: boolean } | null}
 */
export function extendedExpiry({ publishedAt, expiresAt }, days, now = Date.now()) {
  const ceiling = Date.parse(publishedAt) + MEDIA_MAX_LIFETIME_DAYS * DAY_MS;
  const base = Math.max(Date.parse(expiresAt), now);
  if (!Number.isFinite(ceiling) || !Number.isFinite(base) || base >= ceiling) return null;
  const target = base + days * DAY_MS;
  return { expiresAt: new Date(Math.min(target, ceiling)).toISOString(), capped: target > ceiling };
}

export function extensionDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= MEDIA_MAX_EXTENSION_DAYS ? days : null;
}

// ---------------------------------------------------------------------------
// Upload limits and plans.

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = GIB;
// R2's free tier stores 10 GB a month. Refusing uploads a little below that
// keeps the bucket free; raise MEDIA_STORAGE_QUOTA_BYTES only on purpose.
const DEFAULT_QUOTA_BYTES = 9 * GIB;
const HARD_MAX_FILE_BYTES = 5 * GIB;

function positiveBytes(value, fallback, ceiling = Number.MAX_SAFE_INTEGER) {
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes > 0 ? Math.min(bytes, ceiling) : fallback;
}

export function getMediaLimits(env = process.env) {
  return {
    maxFileBytes: positiveBytes(env.MEDIA_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES, HARD_MAX_FILE_BYTES),
    quotaBytes: positiveBytes(env.MEDIA_STORAGE_QUOTA_BYTES, DEFAULT_QUOTA_BYTES),
  };
}

// Multipart needs parts of at least 5 MiB (the last excepted) and at most
// 10 000 of them. 8 MiB parts keep a retried part cheap on a phone, and grow
// only for files large enough to need more than 10 000.
const MIN_PART_BYTES = 8 * MIB;
const MAX_PARTS = 10000;

/** @returns {{ mode: 'single' } | { mode: 'multipart', partSize: number, partCount: number }} */
export function uploadPlan(size) {
  if (size <= MIN_PART_BYTES) return { mode: 'single' };
  const partSize = Math.max(MIN_PART_BYTES, Math.ceil(size / MAX_PARTS / MIB) * MIB);
  return { mode: 'multipart', partSize, partCount: Math.ceil(size / partSize) };
}

export function partLength(size, partSize, partNumber) {
  const partCount = Math.ceil(size / partSize);
  return partNumber < partCount ? partSize : size - partSize * (partCount - 1);
}

export function newObjectKey(shareId) {
  return `media/${shareId}/${crypto.randomBytes(16).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// File signatures. The browser declares a type and R2 stores whatever bytes
// arrive, so after an upload the API reads the first bytes back and refuses a
// file whose contents are not the type it claimed.

const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));
const ISO_BMFF_BOXES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

export function matchesFileSignature(mimeType, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
    case 'audio/wav':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE';
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
      return ISO_BMFF_BOXES.has(ascii(bytes, 4, 8));
    case 'audio/mpeg':
      return ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Deletion. Objects go first and the rows only once R2 has confirmed: if the
// row went first, a failed object delete would leave a file nothing points to
// and nothing would ever clean up. The reverse failure (objects gone, row
// left) is retried harmlessly on the next run.

/** Delete one share's objects, abort its unfinished uploads, then its rows. */
export async function purgeShare(sql, shareId) {
  const files = await sql`
    SELECT object_key, preview_key, upload_id, status FROM media_files WHERE share_id = ${shareId}
  `;
  for (const file of files) {
    if (file.status === 'uploading' && file.upload_id) {
      await abortMultipartUpload(file.object_key, file.upload_id);
    }
  }
  await deleteObjects(files.flatMap((file) => [file.object_key, file.preview_key].filter(Boolean)));
  await sql`DELETE FROM media_shares WHERE id = ${shareId}`;
  return files.length;
}

// A draft is a share whose upload never finished. It is never viewable, and
// is removed after a day along with whatever was uploaded to it.
export const DRAFT_TTL_MS = DAY_MS;
const PURGE_BATCH = 200;

/**
 * Remove every expired share and every abandoned draft. Run by the morning
 * cron. One failing share is logged and skipped, not fatal to the rest.
 */
export async function purgeExpiredShares(sql, now = Date.now()) {
  const nowIso = new Date(now).toISOString();
  const draftCutoff = new Date(now - DRAFT_TTL_MS).toISOString();
  const due = await sql`
    SELECT id FROM media_shares
    WHERE (status = 'published' AND expires_at <= ${nowIso})
       OR (status = 'draft' AND created_at <= ${draftCutoff})
    ORDER BY id
    LIMIT ${PURGE_BATCH}
  `;
  let sharesDeleted = 0;
  let filesDeleted = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      filesDeleted += await purgeShare(sql, id);
      sharesDeleted += 1;
    } catch (error) {
      failed += 1;
      // Only the share id and the error class: never a key or a token.
      logEvent('error', 'media.purge_failed', { shareId: id, errorName: error?.name, errorCode: error?.code });
    }
  }
  return { sharesDeleted, filesDeleted, failed };
}
