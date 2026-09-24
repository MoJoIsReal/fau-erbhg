// Source-level guards for client wiring the offline suites cannot render:
// query keys, route guards, accessible names and the illustration contract.
// Each encodes a regression that shipped once. Don't pin copy, class names or
// anything `npm run check` already enforces here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('event editing invalidates the query the calendar reads and explains refused deletes', () => {
  const editorTools = read('client/src/components/calendar-editor-tools.tsx');
  const cancelBlock = editorTools.slice(
    editorTools.indexOf('const cancelMutation'),
    editorTools.indexOf('const deleteMutation'),
  );
  assert.match(cancelBlock, /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/events"\]\s*\}\)/s);
  assert.equal(cancelBlock.includes('queryKey: ["/api/secure/events"]'), false);
  assert.match(editorTools, /getApiErrorBody\(error\)/);
  assert.match(editorTools, /hasRegistrations/, 'Deleting an event with registrations must say why it was refused');
  assert.match(editorTools, /<AttendeeTooltip\s+eventId=\{entry\.event\.id\}/);
});

// The default queryFn fetches the key's first segment, so a key like
// ['/api/events', id, 'registrations'] silently fetched the events list.
test('the attendee tooltip fetches the registrations endpoint', () => {
  const tooltip = read('client/src/components/attendee-tooltip.tsx');
  assert.match(tooltip, /queryKey:\s*\[`\/api\/registrations\?eventId=\$\{eventId\}`\]/);
  assert.equal(tooltip.includes('queryKey: ["/api/events", eventId, "registrations"]'), false);
});

test('the messages route admits the same roles the API does', () => {
  const app = read('client/src/App.tsx');
  const route = app.slice(app.indexOf('<Route path="/messages">'), app.indexOf('<Route path="/arskalender">'));
  assert.match(route, /<RequireAuth roles=\{\["admin", "member"\]\}>/);
  assert.equal(route.includes('"staff"'), false);
});

test('upcoming items come from one shared hook with the calendar dedupe rules', () => {
  const hook = read('client/src/hooks/useUpcomingItems.ts');
  assert.match(hook, /\/api\/yearly-calendar\?schoolYear=/);
  assert.match(hook, /entry\.entryType === "closed"/);
  assert.match(hook, /daysWithEvent\.has\(dayKey\(entry\.date\)\)/);
  assert.match(read('client/src/pages/home.tsx'), /useUpcomingItems\(\)/);
});

// entry_type says what shape a row has; category says what it is. Deriving the
// chip from the type made every dated row read "I barnehagen".
test('a yearly entry takes its kind from its category, and dedupe keys on the row shape', () => {
  const shared = read('shared/calendar-entries.js');
  assert.match(shared, /const kind = calendarKindForEntry\(entry\);/);
  assert.match(shared, /item\.entry\?\.entryType === 'day_event'/);
});

test('the yearly calendar editor offers the newsletter for every supported entry type', () => {
  const modal = read('client/src/components/yearly-calendar-entry-modal.tsx');
  assert.match(modal, /supportsYearlyCalendarNewsletter\(entryType\)/);
  assert.match(modal, /notifyNewsletter:\s*supportsNewsletter\s*\?\s*notifyNewsletter\s*:\s*false/);
});

test('the Excel export escapes quotes and drops list values a formula cannot express', () => {
  const excel = read('client/src/lib/yearly-calendar-excel.ts');
  assert.doesNotMatch(excel, /escapeXmlText/);
  assert.match(excel, /function escapeXml\(value: string\)[\s\S]*?\.replace\(\/"\/g, "&quot;"\)/);
  assert.match(excel, /values\.filter\(\(value\) => LIST_FORMULA_SAFE\.test\(value\)\)/);
});

test('the month grid draws spans as bands under a sticky, unclipped nav', () => {
  const view = read('client/src/components/calendar-view.tsx');
  assert.match(view, /const bands: WeekBand\[\]/);
  assert.equal(view.includes('push(toCalendarIsoDate(monday.date), entry)'), false);
  assert.match(view, /sticky top-\[var\(--header-height-mobile\)\][^"]*lg:top-\[var\(--header-height\)\]/);
  // overflow-hidden would become the sticky nav's scroll container and trap it.
  assert.match(view, /<Surface className="overflow-clip">/);
  assert.equal(view.includes('truncate'), false, 'Entry titles wrap and clamp rather than truncate');
  assert.match(read('client/src/components/layout.tsx'), /SheetContent[^>]+overflow-y-auto/,
    'The mobile menu must scroll so signed-in actions stay reachable');
});

test('icon-only controls have accessible names and toggles expose their state', () => {
  const view = read('client/src/components/calendar-view.tsx');
  assert.match(view, /aria-label=\{t\.\w+\.previousMonth\}/);
  assert.match(view, /aria-label=\{t\.\w+\.nextMonth\}/);

  const files = read('client/src/pages/files.tsx');
  assert.match(files, /aria-label=\{`\$\{t\.documents\.download\} \$\{doc\.title\}`\}/);
  assert.match(files, /aria-label=\{language === ['"]no['"] \? `Slett \$\{doc\.title\}` : `Delete \$\{doc\.title\}`\}/);

  assert.match(
    read('client/src/components/file-upload-modal.tsx'),
    /aria-label=\{`\$\{t\.documents\.removeFile\}: \$\{selectedFile\.name\}`\}/,
  );

  const editor = read('client/src/components/RichTextEditor.tsx');
  assert.match(editor, /aria-label=\{toolbarLabels\.bold\}/);
  assert.match(editor, /aria-pressed=\{editor\.isActive\('bold'\)\}/);
});

// Four crops per scene: wide and narrow, day and night. A missing one silently
// falls back to centre-cropping the other.
test('every illustration ships all four crops and dark mode swaps rather than dims', () => {
  const illustrations = read('client/src/components/site/illustrations.ts');
  const sets = (illustrations.match(/^export const ILLUSTRATION_/gm) ?? []).length;
  assert.ok(sets > 0);
  assert.equal((illustrations.match(/^ {4}wide: source\(/gm) ?? []).length, sets * 2);
  assert.equal((illustrations.match(/^ {4}narrow: source\(/gm) ?? []).length, sets * 2);
  assert.equal((illustrations.match(/^ {4}focus: \{ narrow: /gm) ?? []).length, sets * 2);

  const artwork = read('client/src/components/site/artwork.tsx');
  assert.match(artwork, /const art = isDark \? illustration\.dark : illustration\.light;/);
  assert.match(artwork, /<source media=\{NARROW\}/);
  assert.equal(/grayscale|brightness\(|saturate\(|\bfilter:|mix-blend|opacity-\d/.test(artwork), false);
});
