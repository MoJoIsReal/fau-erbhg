import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isRegistrationForeignKeyConflict } from '../api/events.js';
import { isPhotoSlotConflict } from '../api/registrations.js';

test('only the photo-slot unique index triggers allocation retry', () => {
  assert.equal(isPhotoSlotConflict({
    code: '23505',
    constraint: 'photo_event_slots_event_slot_unique_idx',
  }), true);
  assert.equal(isPhotoSlotConflict({
    code: '23505',
    constraint: 'event_registrations_event_email_unique_idx',
  }), false);
  assert.equal(isPhotoSlotConflict({ code: '23503' }), false);
});

test('only the registration foreign key maps an event-delete race to registrations-present', () => {
  assert.equal(isRegistrationForeignKeyConflict({
    code: '23503',
    constraint: 'event_registrations_event_id_fkey',
  }), true);
  assert.equal(isRegistrationForeignKeyConflict({
    code: '23503',
    constraint: 'photo_event_slots_event_id_fkey',
  }), false);
});

test('registration creation reserves normalized slots in the atomic CTE', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const registrationCte = source.slice(
    source.indexOf('WITH target_event AS'),
    source.indexOf('const registrationState'),
  );
  assert.match(registrationCte, /INSERT INTO photo_event_slots/);
  assert.match(registrationCte, /jsonb_array_elements_text/);
  assert.match(registrationCte, /reservedSlotCount/);
  assert.match(source, /PHOTO_SLOT_ALLOCATION_ATTEMPTS = 3/);
});

test('registration deletion and attendee adjustment share one statement', () => {
  const source = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const deletion = source.slice(
    source.indexOf('WITH deleted AS'),
    source.indexOf("return res.status(200).json({ success: true });", source.indexOf('WITH deleted AS')),
  );
  assert.match(deletion, /DELETE FROM event_registrations/);
  assert.match(deletion, /updated_event AS/);
  assert.match(deletion, /UPDATE events e/);
});

test('migration stops on orphans and creates both integrity backstops', () => {
  const migration = readFileSync(
    new URL('../migrations/0009_registration_integrity.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /RAISE EXCEPTION[\s\S]*orphan registrations exist/);
  assert.match(migration, /FOREIGN KEY \(event_id\) REFERENCES events\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS photo_event_slots_event_slot_unique_idx/);
});
