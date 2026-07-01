import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeHtml } from '../api/_shared/middleware.js';
import { rateLimitKey } from '../api/_shared/rate-limit.js';
import {
  PASSWORD_EXPIRY_DAYS,
  generateTemporaryPassword,
  isPasswordChangeRequired,
  isUndefinedColumnError,
} from '../api/_shared/password-policy.js';
import { assignPhotoSlots } from '../shared/photo-slots.js';
import { COUNCIL_ROLES, EVENT_TYPES, ROLES } from '../shared/constants.js';
import {
  VALID_YEARLY_CALENDAR_COLORS,
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  buildImportPreview,
  diffYearlyCalendarEntry,
  getKindergartenSchoolYear,
  isMonthInSchoolYear,
  normalizeYearlyCalendarTitle,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';
import { getYearlyCalendarMonthGroups } from '../shared/yearly-calendar-display.js';

const YEAR_COLUMN = '\u00e5r';
const MONTH_COLUMN = 'm\u00e5ned';
const HOMEPAGE_COLUMN = 'vis_p\u00e5_forside';

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

function testPasswordPolicy() {
  const password = generateTemporaryPassword();
  assert.equal(password.length, 16);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);

  const now = new Date('2026-07-01T12:00:00Z');
  assert.equal(PASSWORD_EXPIRY_DAYS, 365);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: true, passwordChangedAt: now.toISOString() }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: null }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-06-30T11:59:59Z' }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-07-02T12:00:00Z' }, now), false);
  assert.equal(isUndefinedColumnError({ code: '42703' }), true);
  assert.equal(isUndefinedColumnError({ message: 'column "must_change_password" does not exist' }), true);
  assert.equal(isUndefinedColumnError({ code: '23505' }), false);
}

function testClientRegressionGuards() {
  const queryClient = readFileSync(new URL('../client/src/lib/queryClient.ts', import.meta.url), 'utf8');
  assert.match(
    queryClient,
    /export class ApiError extends Error/,
    'API requests should throw a structured ApiError with status and body',
  );
  assert.match(
    queryClient,
    /export function getApiErrorBody/,
    'UI code should have a typed helper for reading structured API error bodies',
  );
  assert.match(
    queryClient,
    /JSON\.parse/,
    'API error handling should parse JSON response bodies instead of throwing raw text only',
  );

  const eventsPage = readFileSync(new URL('../client/src/pages/events.tsx', import.meta.url), 'utf8');
  const cancelMutationBlock = eventsPage.slice(
    eventsPage.indexOf('const cancelMutation'),
    eventsPage.indexOf('const handleRegisterClick'),
  );
  assert.match(
    cancelMutationBlock,
    /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/events"\]\s*\}\)/s,
    'Cancelling an event must invalidate the public events query used by the page',
  );
  assert.equal(
    cancelMutationBlock.includes('queryKey: ["/api/secure/events"]'),
    false,
    'Cancelling an event must not invalidate the unused /api/secure/events key',
  );
  assert.match(
    eventsPage,
    /getApiErrorBody\(error\)/,
    'Event delete errors should read structured API error bodies',
  );

  const contentPage = readFileSync(new URL('../client/src/pages/content.tsx', import.meta.url), 'utf8');
  assert.match(
    contentPage,
    /const \[postDraft, setPostDraft\]/,
    'Content editor should keep edits in a draft so Cancel can discard them',
  );
  assert.match(
    contentPage,
    /const startEditingPost = \(index: number\)/,
    'Content editor should start editing from a copied draft',
  );
  assert.match(
    contentPage,
    /const cancelEditingPost = \(\)/,
    'Content editor should have an explicit cancel path that discards drafts',
  );

  const calendarView = readFileSync(new URL('../client/src/components/calendar-view.tsx', import.meta.url), 'utf8');
  assert.match(
    calendarView,
    /aria-label=\{language === 'no' \? 'Forrige måned' : 'Previous month'\}/,
    'Calendar previous-month icon button must have an accessible name',
  );
  assert.match(
    calendarView,
    /aria-label=\{language === 'no' \? 'Neste måned' : 'Next month'\}/,
    'Calendar next-month icon button must have an accessible name',
  );

  const filesPage = readFileSync(new URL('../client/src/pages/files.tsx', import.meta.url), 'utf8');
  assert.match(
    filesPage,
    /aria-label=\{language === 'no' \? `Last ned \$\{doc\.title\}` : `Download \$\{doc\.title\}`\}/,
    'Document download icon buttons must have accessible names',
  );

  const richTextEditor = readFileSync(new URL('../client/src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
  assert.match(
    richTextEditor,
    /const toolbarLabels/,
    'Rich text editor toolbar should centralize translated accessible labels',
  );
  assert.match(
    richTextEditor,
    /aria-label=\{toolbarLabels\.bold\}/,
    'Rich text editor bold button must have an accessible name',
  );
  assert.match(
    richTextEditor,
    /aria-pressed=\{editor\.isActive\('bold'\)\}/,
    'Rich text editor active formatting buttons should expose pressed state',
  );
}

function validDayRow(overrides = {}) {
  return {
    entry_type: 'day_event',
    tittel: 'Sommerfest',
    dato: '2028-06-04',
    [YEAR_COLUMN]: 2028,
    [MONTH_COLUMN]: 6,
    beskrivelse: 'Sommerfest for alle',
    farge: 'green',
    [HOMEPAGE_COLUMN]: true,
    for_foreldre: false,
    ...overrides,
  };
}

function validWeekRow(overrides = {}) {
  return {
    entry_type: 'week_event',
    tittel: 'Brannvernuke',
    [YEAR_COLUMN]: 2027,
    [MONTH_COLUMN]: 9,
    uke_fra: 38,
    farge: 'orange',
    ...overrides,
  };
}

function assertInvalidContains(result, expected) {
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((message) => message.includes(expected)),
    `Expected one error to include "${expected}", got ${JSON.stringify(result.errors)}`,
  );
  assert.ok(
    result.errors.every((message) => message.includes('Rad 12:')),
    `Expected all errors to include row number, got ${JSON.stringify(result.errors)}`,
  );
}

function testYearlyCalendarDateHelpers() {
  assert.equal(getKindergartenSchoolYear(new Date('2026-01-15T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-07-31T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-08-01T12:00:00Z')), 2026);
  assert.equal(getKindergartenSchoolYear(new Date('2026-12-31T12:00:00Z')), 2026);
  assert.equal(isMonthInSchoolYear(2027, 8, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 7, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 8, 2027), false);
  assert.equal(isMonthInSchoolYear(2027, 7, 2027), false);
}

function testYearlyCalendarMonthGroups() {
  const groups = getYearlyCalendarMonthGroups(2025, new Date('2026-07-01T12:00:00Z'));

  assert.deepEqual(groups.currentAndUpcoming, [{ year: 2026, month: 7 }]);
  assert.deepEqual(groups.past.slice(0, 3), [
    { year: 2026, month: 6 },
    { year: 2026, month: 5 },
    { year: 2026, month: 4 },
  ]);
  assert.deepEqual(groups.past.at(-1), { year: 2025, month: 8 });
}

function testYearlyCalendarTitleNormalization() {
  assert.equal(normalizeYearlyCalendarTitle('  Sommerfest   Juni '), 'sommerfest juni');
  assert.equal(normalizeYearlyCalendarTitle(' BL\u00c5B\u00c6R  og   GR\u00d8T '), 'bl\u00e5b\u00e6r og gr\u00f8t');
  assert.equal(normalizeYearlyCalendarTitle(null), '');
}

function testYearlyCalendarConstants() {
  assert.deepEqual(VALID_YEARLY_CALENDAR_ENTRY_TYPES, ['week_event', 'day_event', 'food', 'closed', 'note']);
  assert.deepEqual(VALID_YEARLY_CALENDAR_COLORS, ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple']);
}

function testYearlyCalendarValidNorwegianRow() {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 2,
    schoolYear: 2027,
    row: validDayRow(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    schoolYear: 2027,
    year: 2028,
    month: 6,
    entryType: 'day_event',
    title: 'Sommerfest',
    description: 'Sommerfest for alle',
    color: 'green',
    weekNumber: null,
    weekNumberEnd: null,
    date: '2028-06-04',
    showOnHomepage: true,
    showForParents: false,
  });
}

function testYearlyCalendarValidCamelCaseRow() {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 3,
    schoolYear: 2027,
    row: {
      entryType: 'note',
      title: 'Husk regnt\u00f8y',
      year: 2027,
      month: 10,
      weekNumber: 41,
      weekNumberEnd: 42,
      description: 'Ta med ekstra skift',
      color: 'blue',
      showOnHomepage: true,
      showForParents: true,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.entryType, 'note');
  assert.equal(result.payload.weekNumber, 41);
  assert.equal(result.payload.weekNumberEnd, 42);
  assert.equal(result.payload.showOnHomepage, false);
  assert.equal(result.payload.showForParents, false);
}

function testYearlyCalendarInvalidRows() {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: '   ' }),
    }),
    'Mangler tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'event' }),
    }),
    'Ugyldig entry_type "event"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'DAY_EVENT' }),
    }),
    'Ugyldig entry_type "DAY_EVENT"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'grey' }),
    }),
    'Fargen "grey"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'Green' }),
    }),
    'Fargen "Green"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2029-02-01', [YEAR_COLUMN]: 2029, [MONTH_COLUMN]: 2 }),
    }),
    'utenfor barnehage\u00e5ret 2027/2028',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2028-02-31', [YEAR_COLUMN]: 2028, [MONTH_COLUMN]: 2 }),
    }),
    'YYYY-MM-DD',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'closed', dato: '' }),
    }),
    'closed krever dato',
  );

  const emptyColor = validateYearlyCalendarImportRow({
    rowNumber: 16,
    schoolYear: 2027,
    row: validDayRow({ farge: '   ' }),
  });
  assert.equal(emptyColor.ok, true);
  assert.equal(emptyColor.payload.color, null);

  const hexColor = validateYearlyCalendarImportRow({
    rowNumber: 17,
    schoolYear: 2027,
    row: validDayRow({ farge: '#3B82F6' }),
  });
  assert.equal(hexColor.ok, true);
  assert.equal(hexColor.payload.color, '#3b82f6');

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: 'T'.repeat(201) }),
    }),
    'Tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ beskrivelse: 'B'.repeat(1001) }),
    }),
    'Beskrivelse',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ [HOMEPAGE_COLUMN]: 'sure' }),
    }),
    'vis_p\u00e5_forside',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ for_foreldre: 'maybe' }),
    }),
    'for_foreldre',
  );
}

function testYearlyCalendarWeekNumberRules() {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validWeekRow({ uke_til: 38 }),
    }),
    'uke_til',
  );

  for (const entryType of ['week_event', 'food', 'note']) {
    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: '' }),
      }),
      `${entryType} krever uke_fra`,
    );

    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: 54 }),
      }),
      `${entryType} krever uke_fra`,
    );
  }

  const food = validateYearlyCalendarImportRow({
    rowNumber: 13,
    schoolYear: 2027,
    row: validWeekRow({ entry_type: 'food', tittel: 'Fiskesuppe', uke_til: 1 }),
  });
  assert.equal(food.ok, true);
  assert.equal(food.payload.weekNumber, 38);
  assert.equal(food.payload.weekNumberEnd, null);
}

function testYearlyCalendarHomepageFlags() {
  const dayEvent = validateYearlyCalendarImportRow({
    rowNumber: 14,
    schoolYear: 2027,
    row: validDayRow({ [HOMEPAGE_COLUMN]: 'true', for_foreldre: 'ja' }),
  });
  assert.equal(dayEvent.ok, true);
  assert.equal(dayEvent.payload.showOnHomepage, true);
  assert.equal(dayEvent.payload.showForParents, true);

  const closed = validateYearlyCalendarImportRow({
    rowNumber: 15,
    schoolYear: 2027,
    row: validDayRow({ entry_type: 'closed', [HOMEPAGE_COLUMN]: true, for_foreldre: true }),
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.payload.showOnHomepage, false);
  assert.equal(closed.payload.showForParents, false);
}

function testYearlyCalendarDiff() {
  const changes = diffYearlyCalendarEntry(
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-04',
      title: 'Sommerfest',
      description: null,
      color: 'blue',
      showOnHomepage: true,
      showForParents: false,
    },
  );

  assert.deepEqual(changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
    { field: 'color', label: 'farge', oldValue: 'green', newValue: 'blue' },
  ]);
}

function testYearlyCalendarImportPreview() {
  const existingEntries = [
    {
      id: 10,
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      id: 11,
      schoolYear: 2027,
      year: 2027,
      month: 12,
      entryType: 'closed',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2027-12-24',
      title: 'Julaften',
      description: null,
      color: 'red',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 12,
      schoolYear: 2027,
      year: 2027,
      month: 9,
      entryType: 'week_event',
      weekNumber: 36,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 13,
      schoolYear: 2027,
      year: 2027,
      month: 10,
      entryType: 'week_event',
      weekNumber: 40,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
  ];

  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries,
    rows: [
      { rowNumber: 2, ...validDayRow({ dato: '2028-06-04', beskrivelse: '' }) },
      {
        rowNumber: 3,
        entry_type: 'closed',
        tittel: 'Julaften',
        dato: '2027-12-24',
        [YEAR_COLUMN]: 2027,
        [MONTH_COLUMN]: 12,
        farge: 'red',
      },
      { rowNumber: 4, ...validWeekRow() },
      { rowNumber: 5, ...validWeekRow({ entry_type: 'bad_type' }) },
      { rowNumber: 6, ...validWeekRow({ tittel: ' dugnad ' }) },
    ],
  });

  assert.equal(preview.rows[0].status, 'changed');
  assert.deepEqual(preview.rows[0].changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
  ]);
  assert.equal(preview.rows[1].status, 'unchanged');
  assert.equal(preview.rows[2].status, 'new');
  assert.equal(preview.rows[3].status, 'invalid');
  assert.equal(preview.rows[4].status, 'ambiguous');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 1,
    changed: 1,
    invalid: 1,
    ambiguous: 1,
  });
}

function testYearlyCalendarImportPreviewFiltersDbShapedSchoolYear() {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 20,
        school_year: 2026,
        year: 2027,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2027-06-04',
        title: 'Sommerfest',
        description: null,
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'new');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 0,
    changed: 0,
    invalid: 0,
    ambiguous: 0,
  });
}

function testYearlyCalendarImportPreviewNormalizesDbShapedMatch() {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 21,
        school_year: 2027,
        year: 2028,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2028-06-04',
        title: 'Sommerfest',
        description: '',
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'unchanged');
  assert.equal(preview.rows[0].existing.schoolYear, 2027);
  assert.equal(preview.rows[0].existing.entryType, 'day_event');
  assert.equal(preview.rows[0].existing.weekNumber, null);
  assert.equal(preview.rows[0].existing.showOnHomepage, true);
  assert.equal(preview.rows[0].existing.showForParents, false);
}

function testYearlyCalendarImportDecisionMatrix() {
  const allowed = [
    ['new', 'create'],
    ['new', 'ignore'],
    ['unchanged', 'ignore'],
    ['changed', 'update'],
    ['changed', 'create'],
    ['changed', 'ignore'],
    ['ambiguous', 'create'],
    ['ambiguous', 'ignore'],
    ['invalid', 'ignore'],
  ];

  for (const [status, action] of allowed) {
    assert.deepEqual(validateImportDecision({ status, action }), { ok: true });
  }

  const rejected = [
    ['new', 'update'],
    ['unchanged', 'create'],
    ['unchanged', 'update'],
    ['ambiguous', 'update'],
    ['invalid', 'create'],
    ['invalid', 'update'],
  ];

  for (const [status, action] of rejected) {
    const result = validateImportDecision({ status, action });
    assert.equal(result.ok, false);
    assert.match(result.error, /not allowed/);
  }
}

testSanitizeHtml();
testRateLimitKeys();
testAssignPhotoSlots();
testSharedConstants();
testPasswordPolicy();
testClientRegressionGuards();
testYearlyCalendarDateHelpers();
testYearlyCalendarMonthGroups();
testYearlyCalendarConstants();
testYearlyCalendarTitleNormalization();
testYearlyCalendarValidNorwegianRow();
testYearlyCalendarValidCamelCaseRow();
testYearlyCalendarInvalidRows();
testYearlyCalendarWeekNumberRules();
testYearlyCalendarHomepageFlags();
testYearlyCalendarDiff();
testYearlyCalendarImportPreview();
testYearlyCalendarImportPreviewFiltersDbShapedSchoolYear();
testYearlyCalendarImportPreviewNormalizesDbShapedMatch();
testYearlyCalendarImportDecisionMatrix();

console.log('Smoke tests passed');

