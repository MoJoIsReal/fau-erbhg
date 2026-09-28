/**
 * Strip location and camera metadata from a file before it leaves the
 * browser (docs/mediedeling.md). Nothing is re-encoded: photos keep their
 * original pixels and resolution, videos their original streams.
 *
 *   JPEG  every APPn/COM segment goes except JFIF, the ICC colour profile and
 *         Adobe's colour-transform marker. The EXIF orientation is carried
 *         over in a new, minimal EXIF block that holds nothing else, so an
 *         upright phone photo stays upright. Anything after the end-of-image
 *         marker (motion-photo videos, depth maps) goes too.
 *   PNG   text chunks, eXIf and tIME go; so does anything after IEND.
 *   WebP  EXIF and XMP chunks go, and the VP8X flags are updated to match.
 *   MP4 / MOV / M4A
 *         the location atoms phones write — QuickTime ©xyz, 3GPP loci, and
 *         any metadata item whose key names a location (Apple's
 *         com.apple.quicktime.location.*, a bare "location") — are blanked
 *         in place (same size), so only the small `moov` box is read and
 *         rewritten; the media data is passed through as a slice of the
 *         original file, never copied into memory.
 *   MP3 / WAV  passed through; recorders do not put a location in them.
 *
 * A file whose structure cannot be followed is refused rather than uploaded
 * with its metadata intact.
 */

export class ScrubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrubError";
  }
}

export interface ScrubResult {
  blob: Blob;
  /** True when location or camera metadata was found and removed. */
  removedMetadata: boolean;
  /**
   * Display size read from the file's own header (rotation applied), so the
   * share page can reserve the right space. Null for audio, or when the
   * header does not say. Read here rather than by loading the file into an
   * <img> or <video>, which would need blob: URLs the site's CSP refuses.
   */
  width: number | null;
  height: number | null;
}

interface Scrubbed {
  bytes: Bytes;
  removedMetadata: boolean;
  width: number | null;
  height: number | null;
}

// Byte arrays this module creates itself, which Blob accepts as parts.
type Bytes = Uint8Array<ArrayBuffer>;

async function bytesOf(blob: Blob): Promise<Bytes> {
  return new Uint8Array(await blob.arrayBuffer());
}

const u16 = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const le16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

// ---------------------------------------------------------------------------
// JPEG

/** The EXIF orientation (1–8) in an APP1 payload, or 1 when there is none. */
function exifOrientation(payload: Uint8Array): number {
  if (ascii(payload, 0, 6) !== "Exif\0\0") return 1;
  const tiff = 6;
  const little = ascii(payload, tiff, 2) === "II";
  const read16 = (offset: number) =>
    little ? payload[offset] | (payload[offset + 1] << 8) : u16(payload, offset);
  const read32 = (offset: number) =>
    little
      ? (payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24)) >>> 0
      : u32(payload, offset);
  const ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > payload.length) return 1;
  const entries = read16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > payload.length) break;
    if (read16(entry) === 0x0112) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** An APP1 segment whose EXIF holds the orientation tag and nothing else. */
function orientationSegment(orientation: number): Uint8Array {
  // "Exif\0\0", big-endian TIFF header, IFD0 at offset 8 with one SHORT entry.
  const payload = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
  const length = payload.length + 2;
  return Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
}

function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === 0xe0) return ascii(payload, 0, 5) === "JFIF\0" || ascii(payload, 0, 5) === "JFXX\0";
  if (marker === 0xe2) return ascii(payload, 0, 12) === "ICC_PROFILE\0";
  if (marker === 0xee) return ascii(payload, 0, 5) === "Adobe";
  // APP1 (EXIF, XMP), the other APPn and COM carry metadata, never pixels.
  return !(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe;
}

export function scrubJpegBytes(bytes: Uint8Array): Scrubbed {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ScrubError("Not a JPEG");
  const head: Uint8Array[] = [];
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let removed = false;
  let offset = 2;
  let sawJfif = false;
  let frame: [number, number] | null = null;

  const segment = (at: number): { marker: number; end: number; payload: Uint8Array } => {
    if (bytes[at] !== 0xff) throw new ScrubError("Malformed JPEG segment");
    let markerAt = at;
    while (bytes[markerAt + 1] === 0xff) markerAt += 1; // fill bytes
    const marker = bytes[markerAt + 1];
    const length = u16(bytes, markerAt + 2);
    const end = markerAt + 2 + length;
    if (length < 2 || end > bytes.length) throw new ScrubError("Truncated JPEG segment");
    return { marker, end, payload: bytes.subarray(markerAt + 4, end) };
  };

  // Header segments up to the first scan.
  for (;;) {
    if (offset + 4 > bytes.length) throw new ScrubError("JPEG has no image data");
    const { marker, end, payload } = segment(offset);
    if (marker === 0xda) break;
    const raw = bytes.subarray(offset, end);
    if (marker === 0xe1) orientation = Math.max(orientation, exifOrientation(payload));
    // Start-of-frame (SOF0–SOF15, less DHT/JPG/DAC): height, then width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && payload.length >= 5) {
      frame = [u16(payload, 3), u16(payload, 1)];
    }
    if (keepJpegSegment(marker, payload)) {
      if (marker === 0xe0 && !sawJfif) {
        head.push(raw);
        sawJfif = true;
      } else {
        kept.push(raw);
      }
    } else {
      removed = true;
    }
    offset = end;
  }

  // Scans: entropy-coded data, with any tables between progressive scans,
  // up to and including EOI. A 0xFF in coded data is always followed by
  // 0x00 or a restart marker, so the first other marker ends the scan.
  const scanStart = offset;
  let cursor = segment(offset).end;
  let imageEnd = -1;
  while (cursor < bytes.length - 1) {
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    const next = bytes[cursor + 1];
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
      cursor += next === 0xff ? 1 : 2;
      continue;
    }
    if (next === 0xd9) {
      imageEnd = cursor + 2;
      break;
    }
    const inner = segment(cursor);
    if (inner.marker >= 0xe0 && inner.marker <= 0xef) throw new ScrubError("Metadata inside JPEG scan data");
    cursor = inner.end;
  }
  if (imageEnd < 0) throw new ScrubError("JPEG has no end marker");
  if (imageEnd < bytes.length) removed = true;

  // Orientations 5–8 turn the picture a quarter: width and height swap.
  const [width, height] = frame ? (orientation >= 5 ? [frame[1], frame[0]] : frame) : [null, null];
  const parts = [
    Uint8Array.from([0xff, 0xd8]),
    ...head,
    ...(orientation !== 1 ? [orientationSegment(orientation)] : []),
    ...kept,
    bytes.subarray(scanStart, imageEnd),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { bytes: out, removedMetadata: removed, width, height };
}

// ---------------------------------------------------------------------------
// PNG

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function scrubPngBytes(bytes: Uint8Array): Scrubbed {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new ScrubError("Not a PNG");
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let removed = false;
  let offset = 8;
  let ended = false;
  let width: number | null = null;
  let height: number | null = null;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ScrubError("Truncated PNG chunk");
    if (type === "IHDR" && length >= 8) {
      width = u32(bytes, offset + 8);
      height = u32(bytes, offset + 12);
    }
    if (PNG_DROP.has(type)) removed = true;
    else parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) throw new ScrubError("PNG has no IEND chunk");
  if (offset < bytes.length) removed = true;
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { bytes: out, removedMetadata: removed, width, height };
}

// ---------------------------------------------------------------------------
// WebP

export function scrubWebpBytes(bytes: Uint8Array): Scrubbed {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") throw new ScrubError("Not a WebP");
  const le32 = (offset: number) =>
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  const riffEnd = Math.min(bytes.length, 8 + le32(4));
  const chunks: Uint8Array[] = [];
  let removed = riffEnd < bytes.length;
  let offset = 12;
  let width: number | null = null;
  let height: number | null = null;
  while (offset + 8 <= riffEnd) {
    const type = ascii(bytes, offset, 4);
    const size = le32(offset + 4);
    const data = offset + 8;
    // Canvas size: VP8X states it outright; otherwise the one bitstream does.
    if (type === "VP8X" && size >= 10) {
      width = 1 + (bytes[data + 4] | (bytes[data + 5] << 8) | (bytes[data + 6] << 16));
      height = 1 + (bytes[data + 7] | (bytes[data + 8] << 8) | (bytes[data + 9] << 16));
    } else if (type === "VP8 " && width === null && size >= 10) {
      width = le16(bytes, data + 6) & 0x3fff;
      height = le16(bytes, data + 8) & 0x3fff;
    } else if (type === "VP8L" && width === null && size >= 5) {
      const bits = le32(data + 1);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    }
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > riffEnd) throw new ScrubError("Truncated WebP chunk");
    if (type === "EXIF" || type === "XMP ") {
      removed = true;
    } else if (type === "VP8X") {
      const chunk = bytes.slice(offset, Math.min(end, riffEnd));
      chunk[8] &= ~(0x08 | 0x04); // EXIF and XMP present flags
      chunks.push(chunk);
    } else {
      chunks.push(bytes.subarray(offset, Math.min(end, riffEnd)));
    }
    offset = end;
  }
  const body = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(12 + body);
  out.set(bytes.subarray(0, 12));
  const size = 4 + body;
  out[4] = size & 0xff;
  out[5] = (size >> 8) & 0xff;
  out[6] = (size >> 16) & 0xff;
  out[7] = (size >>> 24) & 0xff;
  let at = 12;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return { bytes: out, removedMetadata: removed, width, height };
}

// ---------------------------------------------------------------------------
// MP4 / QuickTime

interface Box {
  type: string;
  start: number;
  headerSize: number;
  end: number;
}

function readBoxHeader(bytes: Uint8Array, offset: number, limit: number): Box | null {
  if (offset + 8 > limit) return null;
  let size = u32(bytes, offset);
  const type = ascii(bytes, offset + 4, 4);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    const high = u32(bytes, offset + 8);
    size = high * 2 ** 32 + u32(bytes, offset + 12);
    headerSize = 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (size < headerSize || offset + size > limit) return null;
  return { type, start: offset, headerSize, end: offset + size };
}

const CONTAINERS = new Set(["moov", "trak", "udta", "mdia", "minf", "edts", "tref"]);
// Apple writes com.apple.quicktime.location.ISO6709 (and .accuracy, .body…);
// other tools write a bare "location" or an ©xyz-named key. Any key naming a
// location is blanked.
const LOCATION_KEY = /location|xyz|gps/i;

/** Rename a box to `free` and zero its payload. Same size, so offsets hold. */
function blankBox(moov: Uint8Array, box: Box) {
  moov.set([0x66, 0x72, 0x65, 0x65], box.start + 4);
  moov.fill(0, box.start + box.headerSize, box.end);
}

/**
 * Blank the location metadata inside a `moov` box, in place.
 * @returns whether anything was removed
 */
export function scrubMoovBox(moov: Uint8Array): boolean {
  let removed = false;

  const walk = (start: number, end: number) => {
    let offset = start;
    while (offset < end) {
      const box = readBoxHeader(moov, offset, end);
      if (!box) throw new ScrubError("Malformed MP4 box");
      if (box.type === "©xyz" || box.type === "loci") {
        blankBox(moov, box);
        removed = true;
      } else if (box.type === "meta") {
        scrubMeta(box);
      } else if (CONTAINERS.has(box.type)) {
        walk(box.start + box.headerSize, box.end);
      }
      offset = box.end;
    }
  };

  // Apple's `mdta` metadata: `keys` names each item, `ilst` holds the values
  // by 1-based key index. ISO `meta` boxes start with 4 bytes of version and
  // flags; QuickTime's do not, so look for the first child either way.
  const scrubMeta = (meta: Box) => {
    let childStart = meta.start + meta.headerSize;
    const looksLikeBox = (at: number) => /^[\x20-\x7e©]{4}$/.test(ascii(moov, at + 4, 4));
    if (!looksLikeBox(childStart) && looksLikeBox(childStart + 4)) childStart += 4;

    const children: Box[] = [];
    for (let offset = childStart; offset < meta.end;) {
      const child = readBoxHeader(moov, offset, meta.end);
      if (!child) throw new ScrubError("Malformed MP4 metadata");
      children.push(child);
      offset = child.end;
    }

    const locationKeys = new Set<number>();
    const keys = children.find((child) => child.type === "keys");
    if (keys) {
      const count = u32(moov, keys.start + keys.headerSize + 4);
      let offset = keys.start + keys.headerSize + 8;
      for (let index = 1; index <= count && offset + 8 <= keys.end; index += 1) {
        const size = u32(moov, offset);
        if (size < 8 || offset + size > keys.end) throw new ScrubError("Malformed MP4 metadata keys");
        if (LOCATION_KEY.test(ascii(moov, offset + 8, size - 8))) locationKeys.add(index);
        offset += size;
      }
    }

    const ilst = children.find((child) => child.type === "ilst");
    if (ilst) {
      for (let offset = ilst.start + ilst.headerSize; offset < ilst.end;) {
        const item = readBoxHeader(moov, offset, ilst.end);
        if (!item) throw new ScrubError("Malformed MP4 metadata items");
        const index = u32(moov, item.start + 4);
        if (item.type === "©xyz" || locationKeys.has(index)) {
          // Keep the item's box structure; blank the value it carries.
          moov.fill(0x20, item.start + item.headerSize + 16, item.end);
          removed = true;
        }
        offset = item.end;
      }
    }

    for (const child of children) {
      if (child.type === "©xyz" || child.type === "loci") {
        blankBox(moov, child);
        removed = true;
      } else if (CONTAINERS.has(child.type)) {
        walk(child.start + child.headerSize, child.end);
      }
    }
  };

  const top = readBoxHeader(moov, 0, moov.length);
  if (!top || top.type !== "moov") throw new ScrubError("Not a moov box");
  walk(top.headerSize, top.end);
  return removed;
}

/**
 * Display size of the first video track: its `tkhd` width and height, swapped
 * when the track matrix turns the picture a quarter (a phone held upright).
 */
export function videoDimensions(moov: Uint8Array): [number, number] | null {
  const find = (start: number, end: number): [number, number] | null => {
    for (let offset = start; offset < end;) {
      const box = readBoxHeader(moov, offset, end);
      if (!box) return null;
      if (box.type === "trak") {
        const found = find(box.start + box.headerSize, box.end);
        if (found) return found;
      } else if (box.type === "tkhd") {
        const body = box.start + box.headerSize;
        const version = moov[body];
        // version/flags, times, track id, reserved, duration, reserved(8),
        // layer, alternate group, volume, reserved: then the 3x3 matrix.
        const matrix = body + 4 + (version === 1 ? 32 : 20) + 8 + 8;
        const dims = matrix + 36;
        if (dims + 8 > box.end) return null;
        const width = Math.round(u32(moov, dims) / 65536);
        const height = Math.round(u32(moov, dims + 4) / 65536);
        if (width > 0 && height > 0) {
          const quarterTurn = u32(moov, matrix) === 0 && u32(moov, matrix + 16) === 0;
          return quarterTurn ? [height, width] : [width, height];
        }
      }
      offset = box.end;
    }
    return null;
  };
  const top = readBoxHeader(moov, 0, moov.length);
  return top && top.type === "moov" ? find(top.headerSize, top.end) : null;
}

// A moov this large is not a phone recording; refuse rather than read it all.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;

export async function scrubMp4(file: Blob): Promise<ScrubResult> {
  let offset = 0;
  while (offset < file.size) {
    const head = await bytesOf(file.slice(offset, offset + 16));
    const box = readBoxHeader(head, 0, Math.min(16, file.size - offset));
    // readBoxHeader checks the box against the 16 bytes it was given; the
    // real bound is the file, so re-derive the size from the header alone.
    let size = u32(head, 0);
    let headerSize = 8;
    if (size === 1) {
      size = u32(head, 8) * 2 ** 32 + u32(head, 12);
      headerSize = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    const type = box?.type ?? ascii(head, 4, 4);
    if (size < headerSize || offset + size > file.size || !/^[\x20-\x7e©]{4}$/.test(type)) {
      throw new ScrubError("Malformed MP4 file");
    }
    if (type === "moov") {
      if (size > MAX_MOOV_BYTES) throw new ScrubError("MP4 metadata too large");
      const moov = await bytesOf(file.slice(offset, offset + size));
      const [width, height] = videoDimensions(moov) ?? [null, null];
      const removed = scrubMoovBox(moov);
      if (!removed) return { blob: file, removedMetadata: false, width, height };
      return {
        blob: new Blob([file.slice(0, offset), moov, file.slice(offset + size)], { type: file.type }),
        removedMetadata: true,
        width,
        height,
      };
    }
    offset += size;
  }
  throw new ScrubError("MP4 file has no moov box");
}

// ---------------------------------------------------------------------------

async function scrubWith(file: Blob, type: string, scrub: (bytes: Uint8Array) => Scrubbed): Promise<ScrubResult> {
  const { bytes, removedMetadata, width, height } = scrub(await bytesOf(file));
  return { blob: new Blob([bytes], { type }), removedMetadata, width, height };
}

/** The file with its metadata removed, typed as `mimeType`. */
export async function scrubMedia(file: Blob, mimeType: string): Promise<ScrubResult> {
  switch (mimeType) {
    case "image/jpeg":
      return scrubWith(file, mimeType, scrubJpegBytes);
    case "image/png":
      return scrubWith(file, mimeType, scrubPngBytes);
    case "image/webp":
      return scrubWith(file, mimeType, scrubWebpBytes);
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4": {
      const result = await scrubMp4(file);
      return { ...result, blob: new Blob([result.blob], { type: mimeType }) };
    }
    case "audio/mpeg":
    case "audio/wav":
      return { blob: new Blob([file], { type: mimeType }), removedMetadata: false, width: null, height: null };
    default:
      throw new ScrubError("Unsupported type");
  }
}
