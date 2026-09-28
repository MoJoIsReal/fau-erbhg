import { getDb } from './_shared/database.js';
import {
  withApiHandler,
  requireCsrf,
  requireIntId,
  requireRole,
  sanitizeText,
  sanitizeInteger,
  findOversizedField,
  MAX_INT_ID,
} from './_shared/middleware.js';
import {
  checkRateLimit,
  clearRateLimit,
  identityRateLimitKey,
  peekRateLimit,
  rateLimitKey,
} from './_shared/rate-limit.js';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObjects,
  headObject,
  isR2Configured,
  PLAYBACK_URL_SECONDS,
  presignGet,
  presignPut,
  presignUploadPart,
  readObjectPrefix,
} from './_shared/r2.js';
import {
  createViewGrant,
  extendedExpiry,
  extensionDays,
  generateShareToken,
  getMediaLimits,
  hashPin,
  hashShareToken,
  isWellFormedShareToken,
  lifetimeDays,
  matchesFileSignature,
  newObjectKey,
  openShareToken,
  partLength,
  publishExpiry,
  purgeShare,
  sealShareToken,
  shareLink,
  uploadPlan,
  verifyPin,
  verifyViewGrant,
} from './_shared/media-share.js';
import { MEDIA_SHARE_ROLES } from '../shared/constants.js';
import {
  MEDIA_DESCRIPTION_MAX,
  MEDIA_MAX_FILES_PER_SHARE,
  MEDIA_MAX_LIFETIME_DAYS,
  MEDIA_PIN_PATTERN,
  MEDIA_TITLE_MAX,
  mediaKind,
  normalizeMediaMime,
} from '../shared/media.js';

// Private media shares (docs/mediedeling.md).
//
//   POST   /api/media?action=view             public: link token (+ PIN) → playback URLs
//   GET    /api/media?action=list             admin: every share + storage use
//   GET    /api/media?action=link&id=         admin: the share's link, to copy again
//   POST   /api/media?action=create           admin: a draft share
//   POST   /api/media?action=upload-init      admin: register a file, get its upload plan
//   POST   /api/media?action=upload-parts     admin: presigned URLs for multipart parts
//   POST   /api/media?action=upload-complete  admin: finish and verify an upload
//   POST   /api/media?action=upload-abort     admin: drop an unfinished file
//   POST   /api/media?action=publish          admin: draft → live link
//   POST   /api/media?action=extend           admin: push the expiry out
//   DELETE /api/media?id=                     admin: revoke — files and rows, now
//
// One function for all of it: the Hobby plan allows 12 and this is the 10th.
// Nothing here logs a token, a PIN, an object key or a file name; the request
// log line carries only the path and the action.

const DAY_MS = 24 * 60 * 60 * 1000;

// Every refusal a viewer can get for a link that does not open is this one
// body, whether the share never existed, expired, was revoked or is still a
// draft — the page cannot tell which, so neither can someone probing links.
const UNAVAILABLE = { error: 'Not found', code: 'SHARE_UNAVAILABLE' };

// Viewing: a generous per-IP ceiling (a parent's page asks again for fresh
// URLs each hour) that still caps how fast anyone can hammer the lookup.
const VIEW_LIMIT = 120;
const VIEW_WINDOW_SECONDS = 10 * 60;
// PIN guesses. Per (IP, share) to slow one guesser; per share, IP-agnostic,
// so rotating addresses cannot spread guesses past it. Thirty failures a day
// against a 4-digit PIN is about a year to exhaust it.
const PIN_IP_MAX_FAILURES = 5;
const PIN_IP_WINDOW_SECONDS = 15 * 60;
const PIN_SHARE_MAX_FAILURES = 30;
const PIN_SHARE_WINDOW_SECONDS = 24 * 60 * 60;

// Presigned part URLs per request; a file larger than this asks again.
const MAX_PART_URLS_PER_REQUEST = 100;

function refuse(res, status, code, error) {
  return res.status(status).json({ error, code });
}

function iso(ms) {
  return new Date(ms).toISOString();
}

// The admin wire shape (MediaShareSummary in shared/schema.ts).
function mapShare(row, now = Date.now()) {
  const publishedAt = row.published_at ?? null;
  const expiresAt = row.expires_at ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    hasPin: Boolean(row.has_pin),
    lifetimeDays: row.lifetime_days,
    createdAt: row.created_at,
    publishedAt,
    expiresAt,
    maxExpiresAt: publishedAt ? iso(Date.parse(publishedAt) + MEDIA_MAX_LIFETIME_DAYS * DAY_MS) : null,
    expired: row.status === 'published' && expiresAt !== null && Date.parse(expiresAt) <= now,
    fileCount: Number(row.file_count ?? 0),
    totalBytes: Number(row.total_bytes ?? 0),
  };
}

// One file on the share page (SharedMediaFile in shared/schema.ts).
async function mapSharedFile(row) {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    url: await presignGet(row.object_key),
    width: row.width ?? null,
    height: row.height ?? null,
  };
}

async function loadShareSummary(sql, id) {
  const rows = await sql`
    SELECT s.id, s.title, s.description, s.status, s.pin_hash IS NOT NULL AS has_pin,
           s.lifetime_days, s.created_at, s.published_at, s.expires_at,
           COUNT(f.id)::int AS file_count, COALESCE(SUM(f.size_bytes), 0)::bigint AS total_bytes
    FROM media_shares s
    LEFT JOIN media_files f ON f.share_id = s.id AND f.status = 'ready'
    WHERE s.id = ${id}
    GROUP BY s.id
  `;
  return rows[0] ? mapShare(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Public

async function handleView(req, res, sql) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (findOversizedField(body, 1000)) return res.status(404).json(UNAVAILABLE);

  const limit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'media-view'),
    limit: VIEW_LIMIT,
    windowSeconds: VIEW_WINDOW_SECONDS,
  });
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return refuse(res, 429, 'RATE_LIMITED', 'Too many requests');
  }

  const { token, pin, grant } = body;
  if (!isWellFormedShareToken(token)) return res.status(404).json(UNAVAILABLE);

  const nowMs = Date.now();
  const shares = await sql`
    SELECT id, title, description, pin_hash, expires_at
    FROM media_shares
    WHERE token_hash = ${hashShareToken(token)}
      AND status = 'published'
      AND expires_at > ${iso(nowMs)}
  `;
  const share = shares[0];
  if (!share) return res.status(404).json(UNAVAILABLE);
  if (!isR2Configured()) return refuse(res, 503, 'NOT_CONFIGURED', 'Media storage is not configured');

  let newGrant;
  if (share.pin_hash && !verifyViewGrant(grant, share.id, nowMs)) {
    if (typeof pin !== 'string' || pin.length === 0) {
      return refuse(res, 401, 'PIN_REQUIRED', 'PIN required');
    }
    const ipKey = rateLimitKey(req, 'media-pin', share.id);
    const shareKey = identityRateLimitKey('media-pin-share', share.id);
    const locks = await Promise.all([
      peekRateLimit(sql, { key: ipKey, limit: PIN_IP_MAX_FAILURES }),
      peekRateLimit(sql, { key: shareKey, limit: PIN_SHARE_MAX_FAILURES }),
    ]);
    if (locks.some((lock) => !lock.allowed)) {
      res.setHeader('Retry-After', String(Math.max(...locks.map((lock) => lock.retryAfter))));
      return refuse(res, 429, 'PIN_LOCKED', 'Too many attempts');
    }
    const correct = MEDIA_PIN_PATTERN.test(pin) && await verifyPin(pin, share.pin_hash);
    if (!correct) {
      await Promise.all([
        checkRateLimit(sql, { key: ipKey, limit: PIN_IP_MAX_FAILURES, windowSeconds: PIN_IP_WINDOW_SECONDS }),
        checkRateLimit(sql, { key: shareKey, limit: PIN_SHARE_MAX_FAILURES, windowSeconds: PIN_SHARE_WINDOW_SECONDS }),
      ]);
      return refuse(res, 401, 'PIN_INVALID', 'Wrong PIN');
    }
    await clearRateLimit(sql, ipKey);
    newGrant = createViewGrant(share.id, nowMs);
  }

  const files = await sql`
    SELECT id, kind, mime_type, object_key, width, height
    FROM media_files
    WHERE share_id = ${share.id} AND status = 'ready'
    ORDER BY position, id
  `;

  return res.status(200).json({
    title: share.title,
    description: share.description ?? null,
    expiresAt: share.expires_at,
    urlsExpireAt: iso(nowMs + PLAYBACK_URL_SECONDS * 1000),
    ...(newGrant ? { grant: newGrant } : {}),
    files: await Promise.all(files.map(mapSharedFile)),
  });
}

// ---------------------------------------------------------------------------
// Admin reads

async function handleList(req, res, sql) {
  const [rows, usage] = await Promise.all([
    sql`
      SELECT s.id, s.title, s.description, s.status, s.pin_hash IS NOT NULL AS has_pin,
             s.lifetime_days, s.created_at, s.published_at, s.expires_at,
             COUNT(f.id)::int AS file_count, COALESCE(SUM(f.size_bytes), 0)::bigint AS total_bytes
      FROM media_shares s
      LEFT JOIN media_files f ON f.share_id = s.id AND f.status = 'ready'
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 500
    `,
    sql`SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM media_files`,
  ]);
  const now = Date.now();
  const { maxFileBytes, quotaBytes } = getMediaLimits();
  return res.status(200).json({
    configured: isR2Configured(),
    storage: { usedBytes: Number(usage[0]?.used ?? 0), quotaBytes, maxFileBytes },
    shares: rows.map((row) => mapShare(row, now)),
  });
}

async function handleLink(req, res, sql) {
  const id = requireIntId(req, res);
  if (!id) return;
  const rows = await sql`SELECT token_sealed, status FROM media_shares WHERE id = ${id}`;
  if (!rows[0]) return res.status(404).json({ error: 'Share not found' });
  if (rows[0].status !== 'published') return refuse(res, 409, 'NOT_DRAFT', 'Share is not published');
  const token = openShareToken(rows[0].token_sealed);
  // Only when SESSION_SECRET has been rotated since the share was made. The
  // link itself still works; it just cannot be shown again.
  if (!token) return res.status(410).json({ error: 'Link can no longer be shown' });
  return res.status(200).json({ link: shareLink(token) });
}

// ---------------------------------------------------------------------------
// Admin writes

async function handleCreate(req, res, sql, user) {
  const body = req.body ?? {};
  if (findOversizedField(body)) return res.status(413).json({ error: 'Field too large' });

  const title = sanitizeText(body.title, MEDIA_TITLE_MAX).trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const description = sanitizeText(body.description, MEDIA_DESCRIPTION_MAX).trim() || null;
  const days = lifetimeDays(body.expiresInDays);
  if (days === null) return res.status(400).json({ error: 'Invalid lifetime' });

  let pinHash = null;
  if (body.pin !== undefined && body.pin !== null && body.pin !== '') {
    if (typeof body.pin !== 'string' || !MEDIA_PIN_PATTERN.test(body.pin)) {
      return res.status(400).json({ error: 'PIN must be 4–8 digits' });
    }
    pinHash = await hashPin(body.pin);
  }

  const token = generateShareToken();
  const rows = await sql`
    INSERT INTO media_shares (token_hash, token_sealed, title, description, pin_hash, status, lifetime_days, created_by, created_at)
    VALUES (${hashShareToken(token)}, ${sealShareToken(token)}, ${title}, ${description}, ${pinHash}, ${'draft'}, ${days}, ${user.userId ?? null}, ${new Date().toISOString()})
    RETURNING id, title, description, status, pin_hash IS NOT NULL AS has_pin, lifetime_days, created_at, published_at, expires_at
  `;
  return res.status(201).json({ share: mapShare(rows[0]) });
}

// A file of a draft share, still being uploaded. Anything else — a file of a
// published share, one already finished, one that does not exist — is 404:
// uploads only ever go into a draft.
async function loadUploadingFile(sql, fileId) {
  const rows = await sql`
    SELECT f.id, f.share_id, f.object_key, f.kind, f.mime_type, f.size_bytes, f.upload_id
    FROM media_files f
    JOIN media_shares s ON s.id = f.share_id
    WHERE f.id = ${fileId} AND f.status = 'uploading' AND s.status = 'draft'
  `;
  if (!rows[0]) return null;
  return { ...rows[0], size_bytes: Number(rows[0].size_bytes) };
}

async function discardFile(sql, file) {
  if (file.upload_id) await abortMultipartUpload(file.object_key, file.upload_id);
  await deleteObjects([file.object_key]);
  await sql`DELETE FROM media_files WHERE id = ${file.id}`;
}

async function handleUploadInit(req, res, sql) {
  const body = req.body ?? {};
  const shareId = sanitizeInteger(body.shareId, 1, MAX_INT_ID);
  if (!shareId) return res.status(400).json({ error: 'Valid shareId required' });

  const mimeType = normalizeMediaMime(body.mimeType);
  const kind = mimeType && mediaKind(mimeType);
  if (!kind) return refuse(res, 415, 'UNSUPPORTED_TYPE', 'Unsupported file type');

  const { maxFileBytes, quotaBytes } = getMediaLimits();
  const size = sanitizeInteger(body.size, 1, Number.MAX_SAFE_INTEGER);
  if (!size) return res.status(400).json({ error: 'Valid size required' });
  if (size > maxFileBytes) return refuse(res, 413, 'FILE_TOO_LARGE', 'File too large');

  const width = sanitizeInteger(body.width, 1, 100000);
  const height = sanitizeInteger(body.height, 1, 100000);
  const position = sanitizeInteger(body.position, 0, 100000) ?? 0;

  const shares = await sql`
    SELECT s.status, (SELECT COUNT(*)::int FROM media_files f WHERE f.share_id = s.id) AS file_count
    FROM media_shares s
    WHERE s.id = ${shareId}
  `;
  if (!shares[0]) return res.status(404).json({ error: 'Share not found' });
  if (shares[0].status !== 'draft') return refuse(res, 409, 'NOT_DRAFT', 'Files can only be added to a draft');
  if (shares[0].file_count >= MEDIA_MAX_FILES_PER_SHARE) return refuse(res, 409, 'TOO_MANY_FILES', 'Too many files');

  // The quota check and the insert are one statement, so two uploads started
  // together cannot both squeeze under the limit.
  const objectKey = newObjectKey(shareId);
  const inserted = await sql`
    INSERT INTO media_files (share_id, object_key, kind, mime_type, size_bytes, width, height, position, status, created_at)
    SELECT ${shareId}, ${objectKey}, ${kind}, ${mimeType}, ${size}, ${width}, ${height}, ${position}, ${'uploading'}, ${new Date().toISOString()}
    WHERE (SELECT COALESCE(SUM(size_bytes), 0) FROM media_files) + ${size} <= ${quotaBytes}
    RETURNING id
  `;
  if (!inserted[0]) return refuse(res, 507, 'STORAGE_QUOTA', 'Storage quota reached');
  const fileId = inserted[0].id;

  const plan = uploadPlan(size);
  try {
    if (plan.mode === 'single') {
      return res.status(200).json({ fileId, mode: 'single', url: await presignPut(objectKey, mimeType, size) });
    }
    const uploadId = await createMultipartUpload(objectKey, mimeType);
    await sql`UPDATE media_files SET upload_id = ${uploadId} WHERE id = ${fileId}`;
    return res.status(200).json({ fileId, mode: 'multipart', partSize: plan.partSize, partCount: plan.partCount });
  } catch (error) {
    // Give the reserved quota back before reporting the failure.
    await sql`DELETE FROM media_files WHERE id = ${fileId}`;
    throw error;
  }
}

async function handleUploadParts(req, res, sql) {
  const body = req.body ?? {};
  const fileId = sanitizeInteger(body.fileId, 1, MAX_INT_ID);
  if (!fileId) return res.status(400).json({ error: 'Valid fileId required' });
  const file = await loadUploadingFile(sql, fileId);
  if (!file || !file.upload_id) return res.status(404).json({ error: 'Upload not found' });

  const plan = uploadPlan(file.size_bytes);
  if (plan.mode !== 'multipart') return res.status(400).json({ error: 'Not a multipart upload' });
  const numbers = Array.isArray(body.partNumbers) ? body.partNumbers : [];
  if (numbers.length === 0 || numbers.length > MAX_PART_URLS_PER_REQUEST) {
    return res.status(400).json({ error: 'partNumbers required' });
  }
  const parts = numbers.map((value) => sanitizeInteger(value, 1, plan.partCount));
  if (parts.some((part) => part === null) || new Set(parts).size !== parts.length) {
    return res.status(400).json({ error: 'Invalid partNumbers' });
  }

  const urls = await Promise.all(parts.map(async (partNumber) => ({
    partNumber,
    url: await presignUploadPart(
      file.object_key,
      file.upload_id,
      partNumber,
      partLength(file.size_bytes, plan.partSize, partNumber),
    ),
  })));
  return res.status(200).json({ urls });
}

const ETAG_PATTERN = /^"?[0-9A-Za-z-]{1,100}"?$/;

async function handleUploadComplete(req, res, sql) {
  const body = req.body ?? {};
  const fileId = sanitizeInteger(body.fileId, 1, MAX_INT_ID);
  if (!fileId) return res.status(400).json({ error: 'Valid fileId required' });
  const file = await loadUploadingFile(sql, fileId);
  if (!file) return res.status(404).json({ error: 'Upload not found' });

  if (file.upload_id) {
    const { partCount } = /** @type {{ partCount: number }} */ (uploadPlan(file.size_bytes));
    const given = Array.isArray(body.parts) ? body.parts : [];
    const parts = given.map((part) => ({
      partNumber: sanitizeInteger(part?.partNumber, 1, partCount),
      etag: typeof part?.etag === 'string' && ETAG_PATTERN.test(part.etag) ? part.etag : null,
    })).sort((a, b) => (a.partNumber ?? 0) - (b.partNumber ?? 0));
    const complete = parts.length === partCount
      && parts.every((part, index) => part.partNumber === index + 1 && part.etag);
    if (!complete) return res.status(400).json({ error: 'Every part is required' });
    try {
      await completeMultipartUpload(file.object_key, file.upload_id, parts);
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode;
      if (status && status >= 400 && status < 500) {
        await discardFile(sql, file);
        return refuse(res, 422, 'UPLOAD_MISMATCH', 'Upload could not be completed');
      }
      throw error;
    }
  }

  // Trust what R2 stored, not what the browser said: the size and type must
  // be exactly what was approved, and the first bytes must look like that
  // type. Anything else is deleted on the spot.
  const stored = await headObject(file.object_key);
  const prefix = stored && stored.size === file.size_bytes && stored.contentType === file.mime_type
    ? await readObjectPrefix(file.object_key, 16)
    : null;
  if (!prefix || !matchesFileSignature(file.mime_type, prefix)) {
    await discardFile(sql, { ...file, upload_id: null });
    return refuse(res, 422, 'UPLOAD_MISMATCH', 'Uploaded file does not match');
  }

  await sql`UPDATE media_files SET status = ${'ready'}, upload_id = ${null} WHERE id = ${file.id}`;
  return res.status(200).json({ file: { id: file.id, kind: file.kind } });
}

async function handleUploadAbort(req, res, sql) {
  const body = req.body ?? {};
  const fileId = sanitizeInteger(body.fileId, 1, MAX_INT_ID);
  if (!fileId) return res.status(400).json({ error: 'Valid fileId required' });
  const file = await loadUploadingFile(sql, fileId);
  if (!file) return res.status(404).json({ error: 'Upload not found' });
  await discardFile(sql, file);
  return res.status(200).json({ success: true });
}

async function handlePublish(req, res, sql) {
  const id = sanitizeInteger(req.body?.id, 1, MAX_INT_ID);
  if (!id) return res.status(400).json({ error: 'Valid id required' });

  const shares = await sql`SELECT id, status, lifetime_days, token_sealed FROM media_shares WHERE id = ${id}`;
  const share = shares[0];
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (share.status !== 'draft') return refuse(res, 409, 'NOT_DRAFT', 'Share is already published');

  const files = await sql`
    SELECT id, object_key, upload_id, status FROM media_files WHERE share_id = ${id}
  `;
  if (!files.some((file) => file.status === 'ready')) {
    return refuse(res, 409, 'EMPTY_SHARE', 'A share needs at least one file');
  }
  // A file that never finished (a failed upload the page gave up on) must not
  // linger in R2 behind a published share.
  for (const file of files.filter((candidate) => candidate.status !== 'ready')) {
    await discardFile(sql, file);
  }

  const nowMs = Date.now();
  const updated = await sql`
    UPDATE media_shares
    SET status = ${'published'}, published_at = ${iso(nowMs)}, expires_at = ${publishExpiry(share.lifetime_days, nowMs)}
    WHERE id = ${id} AND status = 'draft'
    RETURNING id
  `;
  if (!updated[0]) return refuse(res, 409, 'NOT_DRAFT', 'Share is already published');

  const token = openShareToken(share.token_sealed);
  return res.status(200).json({
    share: await loadShareSummary(sql, id),
    link: token ? shareLink(token) : null,
  });
}

async function handleExtend(req, res, sql) {
  const id = sanitizeInteger(req.body?.id, 1, MAX_INT_ID);
  if (!id) return res.status(400).json({ error: 'Valid id required' });
  const days = extensionDays(req.body?.days);
  if (!days) return res.status(400).json({ error: 'Invalid number of days' });

  const shares = await sql`SELECT id, status, published_at, expires_at FROM media_shares WHERE id = ${id}`;
  const share = shares[0];
  if (!share) return res.status(404).json({ error: 'Share not found' });
  if (share.status !== 'published') return refuse(res, 409, 'NOT_DRAFT', 'Only a published share can be extended');

  const next = extendedExpiry({ publishedAt: share.published_at, expiresAt: share.expires_at }, days);
  if (!next) return refuse(res, 409, 'MAX_LIFETIME', 'Share is at its maximum lifetime');

  await sql`UPDATE media_shares SET expires_at = ${next.expiresAt} WHERE id = ${id}`;
  return res.status(200).json({ share: await loadShareSummary(sql, id), capped: next.capped });
}

async function handleRevoke(req, res, sql) {
  const id = requireIntId(req, res);
  if (!id) return;
  const shares = await sql`SELECT id FROM media_shares WHERE id = ${id}`;
  if (!shares[0]) return res.status(404).json({ error: 'Share not found' });
  const filesDeleted = await purgeShare(sql, id);
  return res.status(200).json({ success: true, filesDeleted });
}

const WRITE_ACTIONS = {
  create: handleCreate,
  'upload-init': handleUploadInit,
  'upload-parts': handleUploadParts,
  'upload-complete': handleUploadComplete,
  'upload-abort': handleUploadAbort,
  publish: handlePublish,
  extend: handleExtend,
};

export default withApiHandler(async function handler(req, res) {
  // Nothing this endpoint returns may be indexed, archived or cached.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');

  const sql = getDb();
  const action = req.query?.action;

  if (action === 'view') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    return handleView(req, res, sql);
  }

  const user = await requireRole(req, res, MEDIA_SHARE_ROLES, sql);
  if (!user) return;

  if (req.method === 'GET') {
    if (action === 'list') return handleList(req, res, sql);
    if (action === 'link') return handleLink(req, res, sql);
    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCsrf(req, res)) return;
  if (!isR2Configured()) return refuse(res, 503, 'NOT_CONFIGURED', 'Media storage is not configured');

  if (req.method === 'DELETE') return handleRevoke(req, res, sql);

  const write = Object.hasOwn(WRITE_ACTIONS, action) ? WRITE_ACTIONS[action] : null;
  if (!write) return res.status(400).json({ error: 'Unknown action' });
  return write(req, res, sql, user);
});
