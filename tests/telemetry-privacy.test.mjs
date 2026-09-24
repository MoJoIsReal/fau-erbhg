import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import { BrowserClient, createTransport } from '@sentry/browser';

const helperPath = 'client/src/lib/telemetry-privacy.ts';
let privacy = {};
if (existsSync(helperPath)) {
  const bundled = await build({ entryPoints: [helperPath], bundle: true, format: 'esm', write: false });
  privacy = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
}

function setup(enabled = true) {
  const bodies = [];
  const transport = (options) => createTransport(options, async ({ body }) => {
    bodies.push(typeof body === 'string' ? body : new TextDecoder().decode(body));
    return { statusCode: 200, headers: {} };
  });
  let config;
  const bootstrap = readFileSync('client/src/main.tsx', 'utf8').split('// Vite fires')[0]
    .replace(/^import .*;\r?\n/gm, '')
    .replaceAll('import.meta.env.VITE_SENTRY_DSN', enabled ? "'https://public@example.test/1'" : 'undefined')
    .replaceAll('import.meta.env.MODE', "'production'");
  vm.runInNewContext(bootstrap, { ...privacy, Sentry: {
    init(options) { config = options; }, makeFetchTransport: transport,
    browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
    replayIntegration: () => ({ name: 'Replay' }),
  } });
  return { config, bodies, transport };
}

test('real SDK envelopes contain no capability from initial URL, navigation, errors or request data', async () => {
  const { config, bodies, transport } = setup();
  const client = new BrowserClient({ ...config, integrations: [], transport: config.transport ?? transport });
  client.init();
  const token = 'ab'.repeat(32);
  for (const [path, key] of [['avmelding', 'token'], ['nyhetsbrev', 'bekreft'], ['nyhetsbrev', 'avmeld']]) {
    const url = `https://example.test/${path}?${key}=${token}`;
    client.captureEvent({ message: `Failed at ${url}`, request: { url, data: { token } },
      breadcrumbs: [{ category: 'navigation', data: { from: url, to: '/kontakt' } }],
      extra: { encoded: encodeURIComponent(url), tokenWithoutUrl: token },
    });
    client.captureEvent({ type: 'transaction', transaction: url, start_timestamp: 1, timestamp: 2,
      spans: [{ op: 'http.client', description: url, start_timestamp: 1, timestamp: 2, trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) }],
    });
  }
  await client.flush(1000);
  assert.ok(bodies.length >= 3, 'the privacy policy must not disable all error reporting');
  assert.ok(bodies.some(body => body.includes('"type":"transaction"')), 'trace envelopes are exercised too');
  assert.equal(bodies.join('\n').includes(token), false);
  assert.ok(bodies.join('\n').includes('navigation'));
  assert.ok(bodies.join('\n').includes('/kontakt'));
  await client.close();
});

test('replay/binary payloads cannot bypass privacy and replay collection is disabled', async () => {
  const { config, bodies, transport } = setup();
  const sender = (config.transport ?? transport)({ url: 'https://example.test', recordDroppedEvent() {} });
  await sender.send([{}, [[{ type: 'replay_recording' }, new TextEncoder().encode('secret replay bytes')]]]);
  assert.equal(bodies.length, 0);
  assert.equal(config.integrations.some(integration => integration.name === 'Replay'), false);
});

test('missing DSN leaves optional telemetry uninitialized', () => {
  assert.equal(setup(false).config, undefined);
});

test('URL privacy also covers analytics, encoded links and invalid short tokens without mutating inputs', () => {
  const original = { url: 'https://example.test/nyhetsbrev?bekreft=short-secret&lang=no',
    nested: { token: 'short-secret', link: 'https%3A%2F%2Fexample.test%2Favmelding%3Ftoken%3Dshort-secret' } };
  const clean = privacy.scrubTelemetry(original);
  assert.equal(JSON.stringify(clean).includes('short-secret'), false);
  assert.ok(clean.url.endsWith('&lang=no'));
  assert.equal(original.nested.token, 'short-secret');
});
