import assert from 'node:assert/strict';
import { sanitizeHtml } from '../api/_shared/middleware.js';
import { rateLimitKey } from '../api/_shared/rate-limit.js';

function mockReq(ip = '203.0.113.10') {
  return {
    headers: {
      'x-forwarded-for': `${ip}, 10.0.0.1`,
    },
  };
}

function testSanitizeHtml() {
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '<a href="javascript:alert(1)">bad</a>',
    '<a href="java&#x73;cript:alert(1)">encoded</a>',
    '<iframe src="https://example.com"></iframe>',
  ];

  for (const payload of payloads) {
    const sanitized = sanitizeHtml(payload);
    assert.equal(/onerror|onload|javascript:|<svg|<iframe/i.test(sanitized), false, payload);
  }

  assert.equal(
    sanitizeHtml('<a href="https://example.com">ok</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
  );
}

function testRateLimitKeys() {
  const keyA = rateLimitKey(mockReq('203.0.113.10'), 'login', 'Admin@Example.com');
  const keyB = rateLimitKey(mockReq('203.0.113.10'), 'login', 'admin@example.com');
  const keyC = rateLimitKey(mockReq('203.0.113.11'), 'login', 'admin@example.com');

  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
  assert.match(keyA, /^[a-f0-9]{64}$/);
}

testSanitizeHtml();
testRateLimitKeys();

console.log('Smoke tests passed');

