import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 through its S3-compatible API, for the private media shares
// (docs/mediedeling.md). The bucket is private: nothing in it has a public or
// permanent URL. Browsers only ever hold presigned URLs this module signs —
// uploads for 30 minutes, playback for one hour.

const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];

// Browser playback URLs live one hour; a player that outlives one asks the
// share API for a fresh set and resumes where it was.
export const PLAYBACK_URL_SECONDS = 60 * 60;
// Long enough for one part (or one small file) on a slow phone connection.
// Part URLs are handed out in batches as an upload progresses, so a long
// upload never holds a URL that has to last for all of it.
export const UPLOAD_URL_SECONDS = 30 * 60;

// S3's DeleteObjects takes at most 1 000 keys per request.
const DELETE_BATCH = 1000;

// A bucket created in a Cloudflare jurisdiction ("eu" keeps the data stored
// and processed in the EU) is only reachable on that jurisdiction's endpoint.
const JURISDICTIONS = new Set(['eu', 'us']);

/** The S3 endpoint for this account and, if set, its R2_JURISDICTION. */
export function r2Endpoint(env = process.env) {
  const accountId = String(env.R2_ACCOUNT_ID ?? '').trim();
  // The account id becomes part of the endpoint host. Anything but the
  // 32-hex id Cloudflare issues would send signed requests somewhere else.
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    throw r2Error('R2_ACCOUNT_ID is not a Cloudflare account id', 'R2_NOT_CONFIGURED');
  }
  const jurisdiction = String(env.R2_JURISDICTION ?? '').trim().toLowerCase();
  if (jurisdiction && !JURISDICTIONS.has(jurisdiction)) {
    throw r2Error('R2_JURISDICTION must be "eu", "us" or unset', 'R2_NOT_CONFIGURED');
  }
  return `https://${accountId}${jurisdiction ? `.${jurisdiction}` : ''}.r2.cloudflarestorage.com`;
}

export function isR2Configured(env = process.env) {
  return REQUIRED_ENV.every((name) => typeof env[name] === 'string' && env[name].trim().length > 0);
}

let cached = null;

function r2Error(message, code) {
  return Object.assign(new Error(message), { code });
}

/**
 * The shared client and bucket name. Throws a `R2_NOT_CONFIGURED` error when
 * the environment is incomplete, so a deployment without the variables fails
 * closed instead of signing URLs for an unintended endpoint.
 * @returns {{ client: S3Client, bucket: string }}
 */
export function getR2() {
  if (cached) return cached;
  if (!isR2Configured()) {
    throw r2Error('R2 storage is not configured', 'R2_NOT_CONFIGURED');
  }
  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: r2Endpoint(),
      // Path-style keeps every URL on the one account host the CSP allows,
      // rather than a per-bucket subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
      },
      // Newer SDKs add a CRC32 checksum to every upload by default. A
      // presigned URL would then demand a checksum header the browser cannot
      // compute in advance for a part, so only send one where S3 requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
    bucket: process.env.R2_BUCKET.trim(),
  };
  return cached;
}

// For tests: forget the cached client so a changed environment takes effect.
export function resetR2ForTests() {
  cached = null;
}

/**
 * A presigned single-request upload. Content-Type and Content-Length are both
 * signed, so R2 refuses a body of any other type or size than the one the API
 * validated.
 */
export async function presignPut(key, contentType, contentLength) {
  const { client, bucket } = getR2();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

export async function createMultipartUpload(key, contentType) {
  const { client, bucket } = getR2();
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }));
  if (!result.UploadId) throw new Error('R2 did not return a multipart upload id');
  return result.UploadId;
}

/** A presigned URL for one part, with its exact length signed. */
export async function presignUploadPart(key, uploadId, partNumber, contentLength) {
  const { client, bucket } = getR2();
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-length']) },
  );
}

export async function completeMultipartUpload(key, uploadId, parts) {
  const { client, bucket } = getR2();
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })),
    },
  }));
}

function isMissing(error) {
  const status = error?.$metadata?.httpStatusCode;
  return status === 404 || error?.name === 'NoSuchUpload' || error?.name === 'NotFound' || error?.name === 'NoSuchKey';
}

/** Abort a multipart upload. An upload that is already gone counts as done. */
export async function abortMultipartUpload(key, uploadId) {
  const { client, bucket } = getR2();
  try {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

/** Size and type of a stored object, or null when there is none. */
export async function headObject(key) {
  const { client, bucket } = getR2();
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(result.ContentLength ?? -1), contentType: result.ContentType ?? '' };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** The first `length` bytes of an object, for checking its file signature. */
export async function readObjectPrefix(key, length = 16) {
  const { client, bucket } = getR2();
  const result = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    Range: `bytes=0-${length - 1}`,
  }));
  if (!result.Body) return new Uint8Array();
  return result.Body.transformToByteArray();
}

/**
 * Delete objects, 1 000 keys per request. Keys that are already gone are
 * not an error; any other per-key failure throws, so a caller never deletes
 * the database row that is the only remaining record of an object it failed
 * to remove.
 * @param {string[]} keys
 * @returns {Promise<number>} how many keys were sent for deletion
 */
export async function deleteObjects(keys) {
  if (keys.length === 0) return 0;
  const { client, bucket } = getR2();
  for (let start = 0; start < keys.length; start += DELETE_BATCH) {
    const batch = keys.slice(start, start + DELETE_BATCH);
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
    const failures = (result.Errors ?? []).filter((failure) => failure.Code !== 'NoSuchKey');
    if (failures.length > 0) {
      throw r2Error(`R2 refused to delete ${failures.length} object(s)`, 'R2_DELETE_FAILED');
    }
  }
  return keys.length;
}

/** A playback URL, valid for PLAYBACK_URL_SECONDS. */
export async function presignGet(key) {
  const { client, bucket } = getR2();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PLAYBACK_URL_SECONDS,
  });
}
