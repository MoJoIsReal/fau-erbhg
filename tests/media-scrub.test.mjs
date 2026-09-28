// client/src/lib/media-scrub.ts: location and camera metadata is removed in
// the browser before a file is uploaded to a private media share, without
// re-encoding. Built from synthetic files that carry a GPS position the way
// phones write one, so a regression shows up as the coordinates surviving.
import assert from 'node:assert/strict';
import test from 'node:test';
import { importBundle } from './helpers.mjs';

const { scrubMedia, scrubJpegBytes, scrubPngBytes, scrubWebpBytes, scrubMoovBox, videoDimensions, ScrubError } = await importBundle({
  entryPoints: ['client/src/lib/media-scrub.ts'],
  platform: 'browser',
});

const GPS = '+59.9139+010.7522/';
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) =>
  typeof part === 'string' ? [...Buffer.from(part, 'latin1')] : [...part]));
const be16 = (n) => [n >> 8, n & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const contains = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));
const segment = (marker, payload) => concat([0xff, marker, ...be16(payload.length + 2)], payload);

// An EXIF block with an orientation and a GPS IFD pointer, like a phone's.
function exifSegment(orientation, { little = false } = {}) {
  const w16 = little ? (n) => [n & 0xff, n >> 8] : be16;
  const w32 = little ? le32 : be32;
  const tiff = concat(
    little ? 'II' : 'MM', w16(42), w32(8),
    w16(2),
    w16(0x0112), w16(3), w32(1), w16(orientation), [0, 0],
    w16(0x8825), w16(4), w32(1), w32(38),
    w32(0),
    `GPS:${GPS}`,
  );
  return segment(0xe1, concat('Exif\0\0', tiff));
}

// A tiny but structurally real JPEG: tables, one scan with a stuffed 0xFF
// and a restart marker in the coded data, EOI, then an appended "video".
function jpeg({ orientation = 6, little = false, trailer = 'MOTION-PHOTO-VIDEO' } = {}) {
  return concat(
    [0xff, 0xd8],
    segment(0xe0, concat('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    exifSegment(orientation, { little }),
    segment(0xe1, concat('http://ns.adobe.com/xap/1.0/\0', `<x:xmpmeta>${GPS}</x:xmpmeta>`)),
    segment(0xe2, concat('ICC_PROFILE\0', [1, 1], 'profile')),
    segment(0xe2, concat('MPF\0', 'second-image')),
    segment(0xfe, 'Shot on a phone'),
    segment(0xdb, new Array(65).fill(1)),
    segment(0xc0, [8, 0, 16, 0, 32, 1, 1, 0x11, 0]), // 32 wide, 16 high
    segment(0xc4, [0, ...new Array(16).fill(0), 0xd9]),
    segment(0xda, [1, 1, 0, 0, 63, 0]),
    [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
    [0xff, 0xd9],
    trailer,
  );
}

test('JPEG: EXIF, XMP, MPF and comments go; pixels, tables and the ICC profile stay', () => {
  const input = jpeg();
  const { bytes, removedMetadata } = scrubJpegBytes(input);
  assert.equal(removedMetadata, true);
  assert.ok(!contains(bytes, GPS), 'no GPS left anywhere');
  assert.ok(!contains(bytes, 'xmpmeta'));
  assert.ok(!contains(bytes, 'MPF'));
  assert.ok(!contains(bytes, 'Shot on a phone'));
  assert.ok(!contains(bytes, 'MOTION-PHOTO-VIDEO'), 'nothing after EOI');
  assert.ok(contains(bytes, 'ICC_PROFILE'), 'colour profile kept');
  assert.ok(contains(bytes, 'JFIF'));
  // The coded image data is byte-for-byte the original.
  const scan = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd9]);
  assert.ok(Buffer.from(bytes).subarray(-scan.length).equals(scan));
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8]);
});

test('JPEG: the orientation survives in a minimal EXIF block of its own', () => {
  for (const little of [false, true]) {
    const { bytes } = scrubJpegBytes(jpeg({ orientation: 6, little }));
    const at = Buffer.from(bytes).indexOf(Buffer.from('Exif\0\0', 'latin1'));
    assert.ok(at > 0, 'an EXIF block is present');
    const app1 = Buffer.from(bytes).subarray(at - 4, at - 4 + 2 + ((bytes[at - 2] << 8) | bytes[at - 1]));
    assert.equal(app1.length, 36, 'orientation only: 34-byte segment plus marker');
    // marker(4) "Exif\0\0"(6) TIFF header(8) entry count(2), then the entry:
    // tag 0x0112, type SHORT, count 1, value 6.
    assert.deepEqual([...app1.subarray(20, 24)], [0x01, 0x12, 0x00, 0x03]);
    assert.deepEqual([...app1.subarray(28, 30)], [0x00, 6]);
  }
  // Orientation 6 is a quarter turn, so the display size is the frame's, swapped.
  const turned = scrubJpegBytes(jpeg({ orientation: 6 }));
  assert.deepEqual([turned.width, turned.height], [16, 32]);
  // An upright photo gets no EXIF at all.
  const upright = scrubJpegBytes(jpeg({ orientation: 1 }));
  assert.ok(!contains(upright.bytes, 'Exif'));
  assert.deepEqual([upright.width, upright.height], [32, 16]);
});

test('PNG: text, eXIf and tIME chunks go; image chunks stay', () => {
  const chunk = (type, data) => concat(be32(data.length), type, data, [0, 0, 0, 0]);
  const input = concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', [...be32(300), ...be32(200), 8, 6, 0, 0, 0]),
    chunk('eXIf', concat('MM', GPS)),
    chunk('tEXt', `Location\0${GPS}`),
    chunk('iTXt', `XML:com.adobe.xmp\0${GPS}`),
    chunk('tIME', [7, 234, 9, 28, 10, 0, 0]),
    chunk('IDAT', [1, 2, 3]),
    chunk('IEND', []),
    'trailing',
  );
  const { bytes, removedMetadata } = scrubPngBytes(input);
  assert.equal(removedMetadata, true);
  assert.ok(!contains(bytes, GPS));
  assert.ok(!contains(bytes, 'tIME'));
  assert.ok(!contains(bytes, 'trailing'));
  assert.ok(contains(bytes, 'IHDR') && contains(bytes, 'IDAT') && contains(bytes, 'IEND'));
  const { width, height } = scrubPngBytes(input);
  assert.deepEqual([width, height], [300, 200]);
});

test('WebP: EXIF and XMP chunks go and the header flags and size follow', () => {
  const chunk = (type, data) => {
    const body = concat(data);
    return concat(type, le32(body.length), body, body.length % 2 ? [0] : []);
  };
  const vp8x = chunk('VP8X', [0x0c, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
  const body = concat('WEBP', vp8x, chunk('VP8 ', [1, 2, 3, 4]), chunk('EXIF', concat('MM', GPS)), chunk('XMP ', GPS));
  const input = concat('RIFF', le32(body.length), body);
  const { bytes, removedMetadata } = scrubWebpBytes(input);
  assert.equal(removedMetadata, true);
  assert.ok(!contains(bytes, GPS));
  assert.equal(bytes[20] & 0x0c, 0, 'EXIF/XMP flags cleared');
  const size = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  assert.equal(size, bytes.length - 8, 'RIFF size matches');
  assert.ok(contains(bytes, 'VP8 '));
  const { width, height } = scrubWebpBytes(input);
  assert.deepEqual([width, height], [2, 2], 'canvas size from VP8X');
});

test("a video's display size comes from its track header, turned for an upright phone", () => {
  const tkhd = (a, b, c, d) => box('tkhd', [0, 0, 0, 3], new Array(20).fill(0), new Array(16).fill(0),
    be32(a), be32(b), be32(0), be32(c), be32(d), be32(0), be32(0), be32(0), be32(0x40000000),
    be32(1920 * 65536), be32(1080 * 65536));
  const landscape = box('moov', box('trak', tkhd(0x10000, 0, 0, 0x10000)));
  const upright = box('moov', box('trak', tkhd(0, 0x10000, 0xffff0000, 0)));
  assert.deepEqual(videoDimensions(landscape), [1920, 1080]);
  assert.deepEqual(videoDimensions(upright), [1080, 1920]);
  assert.equal(videoDimensions(box('moov', box('mvhd', new Array(100).fill(0)))), null, 'audio only');
});

// A moov box the way an iPhone writes one: QuickTime ©xyz in udta, and mdta
// metadata where a `keys` entry names the location item held in `ilst`.
function box(type, ...children) {
  const body = concat(...children);
  return concat(be32(body.length + 8), type, body);
}
function iphoneMoov() {
  const key = (name) => concat(be32(name.length + 8), 'mdta', name);
  const item = (index, value) => concat(be32(8 + 16 + value.length + 8 - 8), be32(index), box('data', [0, 0, 0, 1, 0, 0, 0, 0], value));
  const items = [item(1, GPS), item(2, 'Apple'), item(3, '+60.3913+005.3221/')];
  // Fix up the item sizes, which the helper above leaves to the data box.
  const ilstBody = concat(...items.map((raw) => {
    const inner = raw.subarray(8);
    return concat(be32(inner.length + 8), raw.subarray(4, 8), inner);
  }));
  return box('moov',
    box('mvhd', new Array(100).fill(0)),
    box('trak', box('tkhd', new Array(84).fill(0)), box('udta', box('loci', [0, 0, 0, 0], GPS))),
    box('udta', box('©xyz', be16(GPS.length), [0x15, 0xc7], GPS)),
    box('meta',
      box('hdlr', new Array(25).fill(0)),
      // A bare "location" key is what ffmpeg and some editors write.
      box('keys', [0, 0, 0, 0], be32(3), key('com.apple.quicktime.location.ISO6709'), key('com.apple.quicktime.make'), key('location')),
      concat(be32(ilstBody.length + 8), 'ilst', ilstBody),
    ),
  );
}

test('MP4/MOV: every location atom a phone writes is blanked in place', () => {
  const moov = iphoneMoov();
  const before = moov.length;
  assert.ok(contains(moov, GPS));
  assert.equal(scrubMoovBox(moov), true);
  assert.equal(moov.length, before, 'same size, so no offset in the file moves');
  assert.ok(!contains(moov, GPS), 'no coordinates left');
  assert.ok(!contains(moov, '+60.3913'), 'a bare location key is blanked too');
  assert.ok(contains(moov, 'Apple'), 'other metadata is left alone');
  assert.ok(!contains(moov, '©xyz') && !contains(moov, 'loci'), 'the atoms are renamed to free');
});

test('a whole video is rewritten around its moov, wherever it sits', async () => {
  const ftyp = box('ftyp', 'qt  ', [0, 0, 2, 0], 'qt  ');
  const mdat = box('mdat', new Array(4096).fill(7));
  for (const layout of [[ftyp, mdat, iphoneMoov()], [ftyp, iphoneMoov(), mdat]]) {
    const file = new Blob([concat(...layout)], { type: 'video/quicktime' });
    const { blob, removedMetadata } = await scrubMedia(file, 'video/quicktime');
    const out = new Uint8Array(await blob.arrayBuffer());
    assert.equal(removedMetadata, true);
    assert.equal(blob.type, 'video/quicktime');
    assert.equal(out.length, file.size);
    assert.ok(!contains(out, GPS));
    assert.ok(Buffer.from(out).includes(Buffer.from(mdat)), 'media data untouched');
  }
});

test('a video with no location comes back as it was', async () => {
  const file = new Blob([concat(box('ftyp', 'isom', [0, 0, 2, 0]), box('moov', box('mvhd', new Array(100).fill(0))), box('mdat', [1, 2, 3]))]);
  const { blob, removedMetadata } = await scrubMedia(file, 'video/mp4');
  assert.equal(removedMetadata, false);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
});

test('a file whose structure cannot be followed is refused, not uploaded as-is', async () => {
  const cases = [
    [new Blob(['not a jpeg at all']), 'image/jpeg'],
    [new Blob([concat([0xff, 0xd8], segment(0xe1, concat('Exif\0\0', GPS)))]), 'image/jpeg'],
    [new Blob(['\x89PNG\r\n\x1a\n']), 'image/png'],
    [new Blob([concat(box('ftyp', 'isom'), box('mdat', [1, 2]))]), 'video/mp4'],
    [new Blob([concat(be32(9999), 'moov', [1, 2, 3])]), 'video/mp4'],
    [new Blob(['<html>']), 'text/html'],
  ];
  for (const [file, type] of cases) {
    await assert.rejects(scrubMedia(file, type), (error) => error instanceof ScrubError, type);
  }
});

test('MP3 and WAV pass through unchanged', async () => {
  for (const type of ['audio/mpeg', 'audio/wav']) {
    const file = new Blob(['ID3 audio bytes']);
    const { blob, removedMetadata } = await scrubMedia(file, type);
    assert.equal(removedMetadata, false);
    assert.equal(blob.type, type);
    assert.equal(await blob.text(), 'ID3 audio bytes');
  }
});
