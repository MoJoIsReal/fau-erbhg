import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['client/src/lib/queryClient.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, define: { 'import.meta.env.DEV': 'false' } });
const { queryClient, apiRequest, getQueryFn } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('401 clears the shared identity without depending on any mounted auth consumer', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  queryClient.setQueryData(['/api/auth'], { userId: 1 });
  await assert.rejects(apiRequest('GET', '/api/documents'));
  assert.equal(queryClient.getQueryData(['/api/auth']), null);
  queryClient.setQueryData(['/api/auth'], { userId: 2 });
  assert.equal(await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/auth'] }), null);
  assert.equal(queryClient.getQueryData(['/api/auth']), null);
  queryClient.clear();
});

test('wrong-password login does not clear an existing identity', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  globalThis.document = { cookie: '' };
  queryClient.setQueryData(['/api/auth'], { userId: 1 });
  await assert.rejects(apiRequest('POST', '/api/auth?action=login', { password: 'wrong' }));
  assert.equal(queryClient.getQueryData(['/api/auth']).userId, 1);
  delete globalThis.document;
  queryClient.clear();
});

test('HTTP failure and invalid JSON become query errors, never empty successful data', async (t) => {
  for (const response of [new Response('{}', { status: 500 }), new Response('<html>not JSON</html>', { status: 200 })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(queryClient.fetchQuery({ queryKey: ['/fixture'], retry: false }));
    assert.equal(queryClient.getQueryState(['/fixture']).status, 'error');
    assert.equal(queryClient.getQueryData(['/fixture']), undefined);
    queryClient.clear();
  }
});
