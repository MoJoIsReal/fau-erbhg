import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('yearly calendar reads the saved category as well as mapping and writing it', () => {
  const source = readFileSync(new URL('../api/yearly-calendar.js', import.meta.url), 'utf8');
  const select = source.match(/async function getEntriesForSchoolYear[\s\S]*?SELECT ([\s\S]*?)FROM yearly_calendar_entries/);
  assert.ok(select, 'Locate the query used to reopen saved entries');
  assert.match(select[1], /\bcategory\b/, 'Omitting category makes a saved selection revert to the type default');
});
