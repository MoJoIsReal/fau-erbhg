import assert from 'node:assert/strict';
import test from 'node:test';
import { endsAfterStart, isTimeOfDay, normalizeTimeOfDay } from '../shared/time-of-day.js';

test('a clock time is normalized to two-digit hours, and nothing else passes', () => {
  assert.equal(normalizeTimeOfDay('9:30'), '09:30');
  assert.equal(normalizeTimeOfDay(' 17:00 '), '17:00');
  assert.equal(normalizeTimeOfDay('23:59'), '23:59');
  for (const value of ['24:00', '17.00', '9:3', '12:60', '', null, undefined, 930]) {
    assert.equal(normalizeTimeOfDay(value), null, String(value));
    assert.equal(isTimeOfDay(value), false, String(value));
  }
});

test('an end time counts only when it is a clock time later the same day', () => {
  assert.equal(endsAfterStart('9:30', '10:00'), true);
  assert.equal(endsAfterStart('09:30', '9:30'), false, '9:30 and 09:30 are the same time');
  assert.equal(endsAfterStart('18:00', '9:00'), false, 'compared as times, not as text');
  assert.equal(endsAfterStart('18:00', '25:00'), false);
  assert.equal(endsAfterStart('17.00', '18:00'), false);
});
