/**
 * Upload engine for private media shares (docs/mediedeling.md).
 *
 * Files go straight from the browser to the private R2 bucket over presigned
 * URLs — never through a Vercel function, whose request body is capped at
 * 4.5 MB. A small file is one PUT; a large one is a multipart upload whose
 * parts go three at a time, each retried a few times, with part URLs fetched
 * in batches as the upload moves along so none has to outlive its 30 minutes.
 */
import { apiRequest, getApiErrorBody } from "@/lib/queryClient";
import { scrubMedia, ScrubError } from "@/lib/media-scrub";
import {
  MEDIA_PREVIEW_EDGE,
  MEDIA_PREVIEW_MAX_BYTES,
  mediaKind,
  normalizeMediaMime,
  type MediaKind,
  type MediaMimeType,
} from "@shared/media";

export type MediaUploadErrorCode = "UNSUPPORTED_TYPE" | "UNREADABLE" | "NETWORK" | "ABORTED" | "SERVER";

export class MediaUploadError extends Error {
  code: MediaUploadErrorCode | string;
  constructor(code: MediaUploadErrorCode | string, message = code) {
    super(message);
    this.name = "MediaUploadError";
    this.code = code;
  }
}

export interface PreparedMedia {
  /** The original, for its name and size in the admin list only. */
  file: File;
  /** What is uploaded: the file with its metadata stripped. */
  blob: Blob;
  mimeType: MediaMimeType;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  removedMetadata: boolean;
  /** A photo's small copy for the share page's grid, or null (see makePreview). */
  preview: Blob | null;
}

const PART_CONCURRENCY = 3;
const PART_RETRIES = 3;
const URL_BATCH = 50;

/** Check the type, strip metadata and read the display size. Throws MediaUploadError. */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  const mimeType = normalizeMediaMime(file.type, file.name);
  const kind = mimeType ? mediaKind(mimeType) : null;
  if (!mimeType || !kind) throw new MediaUploadError("UNSUPPORTED_TYPE");
  let scrubbed;
  try {
    scrubbed = await scrubMedia(file, mimeType);
  } catch (error) {
    // A file whose structure the scrubber cannot follow is refused rather
    // than uploaded with its metadata intact.
    throw new MediaUploadError("UNREADABLE", error instanceof ScrubError ? error.message : String(error));
  }
  return {
    file,
    blob: scrubbed.blob,
    mimeType,
    kind,
    width: scrubbed.width,
    height: scrubbed.height,
    removedMetadata: scrubbed.removedMetadata,
    preview: kind === "image" ? await makePreview(scrubbed.blob) : null,
  };
}

/**
 * The share page's grid copy of a photo: drawn on a canvas at most
 * MEDIA_PREVIEW_EDGE pixels on its long edge, as WebP (JPEG where the browser
 * cannot encode WebP). Only this copy is re-encoded; the original is uploaded
 * as it is. A canvas carries no EXIF or GPS, and the camera's rotation is
 * applied while drawing. Null when the photo is small enough to be its own
 * preview, or when the browser cannot make one: the grid then shows the
 * original, so a preview is never a reason to fail an upload.
 */
async function makePreview(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (longEdge <= MEDIA_PREVIEW_EDGE && blob.size <= MEDIA_PREVIEW_MAX_BYTES) {
      bitmap.close();
      return null;
    }
    const scale = Math.min(1, MEDIA_PREVIEW_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const [type, quality] of [["image/webp", 0.8], ["image/jpeg", 0.82]] as const) {
      const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      // A browser that cannot encode a type hands back PNG instead.
      if (encoded && encoded.type === type && encoded.size <= MEDIA_PREVIEW_MAX_BYTES) return encoded;
    }
    return null;
  } catch {
    return null;
  }
}

async function post<T>(action: string, body: unknown): Promise<T> {
  try {
    const res = await apiRequest("POST", `/api/media?action=${action}`, body);
    return (await res.json()) as T;
  } catch (error) {
    const code = getApiErrorBody(error)?.code;
    throw new MediaUploadError(typeof code === "string" ? code : "SERVER", String(error));
  }
}

/** PUT a body to a presigned URL, reporting bytes sent. Resolves to the ETag. */
function put(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new MediaUploadError("ABORTED"));
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      signal.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(body.size);
        resolve(xhr.getResponseHeader("ETag") ?? "");
      } else {
        reject(new MediaUploadError("NETWORK", `R2 answered ${xhr.status}`));
      }
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new MediaUploadError("NETWORK"));
    };
    xhr.onabort = () => reject(new MediaUploadError("ABORTED"));
    xhr.send(body);
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface InitResponse {
  fileId: number;
  mode: "single" | "multipart";
  url?: string;
  /** Where the photo's preview goes, when one was offered and accepted. */
  previewUrl?: string;
  partSize?: number;
  partCount?: number;
}

export interface UploadOptions {
  shareId: number;
  media: PreparedMedia;
  position: number;
  /** Fraction 0–1 of this file's bytes that have reached R2. */
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

/** Upload one prepared file into a draft share. Throws MediaUploadError. */
export async function uploadMedia({ shareId, media, position, onProgress, signal }: UploadOptions): Promise<void> {
  const total = media.blob.size;
  const init = await post<InitResponse>("upload-init", {
    shareId,
    mimeType: media.mimeType,
    size: total,
    width: media.width,
    height: media.height,
    position,
    ...(media.preview ? { preview: { mimeType: media.preview.type, size: media.preview.size } } : {}),
  });

  try {
    // The preview first: it is small, and upload-complete checks it along with
    // the original. One that does not arrive is dropped there, not fatal.
    if (init.previewUrl && media.preview) {
      await put(init.previewUrl, media.preview, media.preview.type, () => undefined, signal).catch((error) => {
        if (error instanceof MediaUploadError && error.code === "ABORTED") throw error;
      });
    }
    if (init.mode === "single" && init.url) {
      await put(init.url, media.blob, media.mimeType, (sent) => onProgress(sent / total), signal);
      await post("upload-complete", { fileId: init.fileId });
    } else {
      await uploadParts(init.fileId, init.partSize!, init.partCount!, media.blob, onProgress, signal);
    }
  } catch (error) {
    // Tell the server to drop the file, so it neither lingers in R2 nor
    // counts against the quota. Best effort: the nightly cron is the backstop.
    await post("upload-abort", { fileId: init.fileId }).catch(() => undefined);
    throw error;
  }
}

async function uploadParts(
  fileId: number,
  partSize: number,
  partCount: number,
  blob: Blob,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
) {
  const sentByPart = new Map<number, number>();
  const report = () => {
    let sent = 0;
    sentByPart.forEach((bytes) => { sent += bytes; });
    onProgress(Math.min(sent / blob.size, 1));
  };

  const urls = new Map<number, string>();
  const fetchUrls = async (from: number) => {
    const partNumbers: number[] = [];
    for (let part = from; part <= partCount && partNumbers.length < URL_BATCH; part += 1) partNumbers.push(part);
    const { urls: batch } = await post<{ urls: { partNumber: number; url: string }[] }>("upload-parts", { fileId, partNumbers });
    batch.forEach(({ partNumber, url }) => urls.set(partNumber, url));
  };

  // One failed part stops the other workers too, so nothing is still being
  // sent to R2 when the caller asks the server to abort the upload.
  const stop = new AbortController();
  const stopAll = () => stop.abort();
  signal.addEventListener("abort", stopAll, { once: true });
  const partSignal = stop.signal;

  const etags: { partNumber: number; etag: string }[] = [];
  let next = 1;
  const worker = async () => {
    while (next <= partCount) {
      const partNumber = next;
      next += 1;
      const start = (partNumber - 1) * partSize;
      const body = blob.slice(start, Math.min(start + partSize, blob.size));
      for (let attempt = 1; ; attempt += 1) {
        if (partSignal.aborted) throw new MediaUploadError("ABORTED");
        try {
          // A fresh URL per attempt after the first: the old one may be the
          // reason it failed.
          if (!urls.has(partNumber) || attempt > 1) await fetchUrls(partNumber);
          const etag = await put(urls.get(partNumber)!, body, null, (sent) => {
            sentByPart.set(partNumber, sent);
            report();
          }, partSignal);
          if (!etag) throw new MediaUploadError("NETWORK", "R2 returned no ETag (check the bucket's CORS ExposeHeaders)");
          etags.push({ partNumber, etag });
          urls.delete(partNumber);
          break;
        } catch (error) {
          sentByPart.set(partNumber, 0);
          report();
          if (error instanceof MediaUploadError && error.code === "ABORTED") throw error;
          if (attempt >= PART_RETRIES) throw error;
          await wait(1000 * 2 ** attempt);
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, () =>
      worker().catch((error) => {
        stopAll();
        throw error;
      })));
  } finally {
    signal.removeEventListener("abort", stopAll);
  }
  await post("upload-complete", { fileId, parts: etags.sort((a, b) => a.partNumber - b.partNumber) });
}
