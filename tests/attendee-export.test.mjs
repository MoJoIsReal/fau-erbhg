import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import readXlsxFile from 'read-excel-file/node';
import { unzipSync, strFromU8 } from 'fflate';

// Bundle the real browser exporter and its dependencies; only the download DOM
// boundary is substituted. Inspect both the XLSX XML and a parsed round trip.
const bundled = await build({ entryPoints: ['client/src/lib/excel-export.ts'], bundle: true, platform: 'browser', format: 'esm', write: false });
const { exportAttendeesToExcel } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

async function download(type, values) {
  let blob, filename;
  const original = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  globalThis.document = {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ download: '', style: {}, setAttribute(key, value) { if (key === 'download') filename = value; }, click() {} }),
  };
  URL.createObjectURL = (value) => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  try {
    await exportAttendeesToExcel({ id: 1, type, title: '=1+1', date: '2026-09-24', time: '09:00', location: '@SUM(1)' }, values.map((value, i) => ({
      id: i + 1, name: value, email: 'fixture@example.test', phone: '+4712345678', attendeeCount: 1,
      comments: value, childrenNames: JSON.stringify([value]), photoSlots: ['09:00'],
    })), 'no');
  } finally {
    globalThis.document = original.document; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke;
  }
  return { blob, filename };
}

for (const type of ['other', 'foto']) {
  test(`${type} export stores formulas and control-prefixed input as literal XLSX strings`, async () => {
    const values = ['=1+1', '+1+1', '-1+1', '@SUM(1)', '\t=1+1', '\r=1+1', '\n=1+1', '";=1+1', 'Ægir Østgård', 'line 1\nline 2'];
    const { blob, filename } = await download(type, values);
    assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(filename, /\.xlsx$/);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const xml = Object.entries(unzipSync(bytes)).filter(([name]) => name.endsWith('.xml')).map(([, content]) => strFromU8(content)).join('\n');
    assert.doesNotMatch(xml, /<f(?:\s|>)/);
    const sheets = await readXlsxFile(bytes, { trim: false });
    const rows = sheets[0].data;
    const flattened = rows.flat();
    for (const value of values) assert.ok(flattened.includes(value), JSON.stringify(value));
    assert.ok(flattened.includes('+4712345678'));
    assert.equal(rows[0][1], '=1+1');
    assert.ok(flattened.includes(String(values.length)));
  });
}
