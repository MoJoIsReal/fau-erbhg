import assert from 'node:assert/strict';
import { sanitizeHtml } from '../api/_shared/middleware.js';
import { rateLimitKey } from '../api/_shared/rate-limit.js';
import { assignPhotoSlots } from '../shared/photo-slots.js';
import { COUNCIL_ROLES, EVENT_TYPES, ROLES } from '../shared/constants.js';

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

function testAssignPhotoSlots() {
  const event = { time: '10:00' };

  // Empty event: first booking gets sequential 5-min slots starting at event time.
  assert.deepEqual(
    assignPhotoSlots(event, [], 3),
    ['10:00', '10:05', '10:10'],
  );

  // Existing booking blocks its grid cells; next booking lands after the gap.
  const existing = [
    { id: 1, attendeeCount: 2, childrenNames: '["A","B"]', photoSlots: '["10:00","10:05"]' },
  ];
  assert.deepEqual(
    assignPhotoSlots(event, existing, 2),
    ['10:10', '10:15'],
  );

  // Legacy registration (no stored slots, has childrenNames) blocks 10 min/child.
  const legacy = [
    { id: 1, attendeeCount: 1, childrenNames: '["A"]', photoSlots: null },
  ];
  assert.deepEqual(
    assignPhotoSlots(event, legacy, 1),
    ['10:10'],
  );
}

function testSharedConstants() {
  assert.equal(ROLES.admin, 'admin');
  assert.equal(ROLES.member, 'member');
  assert.equal(ROLES.staff, 'staff');
  assert.deepEqual(COUNCIL_ROLES, ['admin', 'member']);
  assert.ok(EVENT_TYPES.includes('meeting'));
  assert.ok(EVENT_TYPES.includes('foto'));
  assert.ok(!EVENT_TYPES.includes('not-a-real-type'));
}

testSanitizeHtml();
testRateLimitKeys();
testAssignPhotoSlots();
testSharedConstants();

console.log('Smoke tests passed');

