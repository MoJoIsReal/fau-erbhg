import assert from 'node:assert/strict';
import test from 'node:test';
import { testConnection } from './integration/postgres-fixture.mjs';

test('integration tests reject remote, production and libpq-override targets before connecting', () => {
  for (const url of [undefined, '', 'postgres://fau_test@production.neon.tech/fau_integration_test',
    'postgres://fau_test@localhost/production', 'postgres://postgres@localhost/fau_integration_test',
    'postgres://fau_test@localhost/fau_integration_test?host=production.neon.tech']) {
    assert.throws(() => testConnection(url));
  }
  assert.equal(testConnection('postgres://fau_test:test@127.0.0.1:55432/fau_integration_test').port, '55432');
});
