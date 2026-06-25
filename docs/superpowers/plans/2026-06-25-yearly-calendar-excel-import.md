# Yearly Calendar Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe Excel template export and preview-driven import flow for yearly-calendar entries, including automatic 1 August kindergarten-year defaults.

**Architecture:** Put reusable validation, normalization, matching, diffing, and kindergarten-year logic in small shared modules. Keep Excel workbook generation/parsing in a lazy-loaded browser-only client module. Extend the existing `api/yearly-calendar.js` serverless function with import preview and commit actions so the Vercel function count does not increase.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, shadcn/ui, Vercel serverless functions, Neon SQL tagged templates, `exceljs` for `.xlsx` generation/parsing, existing smoke tests in `scripts/smoke-tests.mjs`.

---

## Reference Material

- Design spec: `docs/superpowers/specs/2026-06-25-yearly-calendar-excel-import-design.md`
- Yearly calendar page: `client/src/pages/yearly-calendar.tsx`
- Existing yearly entry modal: `client/src/components/yearly-calendar-entry-modal.tsx`
- Existing yearly API: `api/yearly-calendar.js`
- Existing schema/types: `shared/schema.ts`
- Existing constants: `shared/constants.js`
- Existing smoke tests: `scripts/smoke-tests.mjs`

## Scope Check

This plan covers one cohesive subsystem: Excel export/import for yearly-calendar entries. It also includes the 1 August default-year helper because the import and export controls depend on the selected kindergarten year and the design explicitly requires the default-year behavior.

## File Structure

- Create `shared/yearly-calendar-utils.js`
  - Single source for valid entry types, valid colors, title normalization, school-year calculation, school-year month checks, import row validation, row-to-payload conversion, existing-entry matching, field diffing, and commit action validation.
  - Used by the API, smoke tests, and optionally the client.

- Create `shared/yearly-calendar-utils.d.ts`
  - TypeScript declarations for the shared JS helper so client imports stay typed.

- Create `client/src/lib/kindergarten-year.ts`
  - Thin client helper that re-exports `getKindergartenSchoolYear()` from the shared utility.
  - Keeps page imports clear and avoids duplicating the date rule.

- Create `client/src/lib/yearly-calendar-excel.ts`
  - Browser-only Excel helpers using dynamically imported `exceljs`.
  - Exports `downloadYearlyCalendarTemplate()` and `parseYearlyCalendarWorkbook()`.

- Create `client/src/components/yearly-calendar-import-modal.tsx`
  - Upload, preview, per-row action choices, commit, and error display.
  - Does not know database details beyond API request/response shapes.

- Modify `api/yearly-calendar.js`
  - Add `action=preview-import` and `action=commit-import` POST branches.
  - Reuse existing auth, CSRF, sanitizer, role rules, and SQL client.

- Modify `client/src/pages/yearly-calendar.tsx`
  - Use shared default-year helper.
  - Expand year selector options enough to manually pick future years like `2027/2028`.
  - Add `Last ned Excel-mal` and `Importer Excel` controls for editors.
  - Mount the import modal.

- Modify `client/src/pages/home.tsx`
  - Use the same default-year helper for yearly-calendar homepage queries.

- Modify `client/src/lib/i18n.ts`
  - Add Norwegian and English text for template export, import, preview groups, row actions, and success/error messages.

- Modify `scripts/smoke-tests.mjs`
  - Add tests for default-year calculation, row validation, title matching, diffing, and commit action validation.

- Modify `package.json` and `package-lock.json`
  - Add `exceljs`.

---

### Task 1: Add Shared Yearly-Calendar Import Utilities

**Files:**
- Create: `shared/yearly-calendar-utils.js`
- Create: `shared/yearly-calendar-utils.d.ts`
- Modify: `scripts/smoke-tests.mjs`

- [ ] **Step 1: Write smoke tests for shared utility behavior**

Append this import near the top of `scripts/smoke-tests.mjs`:

```js
import {
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  VALID_YEARLY_CALENDAR_COLORS,
  buildImportPreview,
  getKindergartenSchoolYear,
  normalizeYearlyCalendarTitle,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';
```

Append these test functions before the existing test calls:

```js
function testKindergartenSchoolYear() {
  assert.equal(getKindergartenSchoolYear(new Date('2026-06-25T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-07-31T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-08-01T12:00:00Z')), 2026);
  assert.equal(getKindergartenSchoolYear(new Date('2028-01-15T12:00:00Z')), 2027);
}

function testYearlyCalendarImportValidation() {
  assert.deepEqual(VALID_YEARLY_CALENDAR_ENTRY_TYPES, ['week_event', 'day_event', 'food', 'closed', 'note']);
  assert.deepEqual(VALID_YEARLY_CALENDAR_COLORS, ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple']);
  assert.equal(normalizeYearlyCalendarTitle('  Sommerfest   Juni '), 'sommerfest juni');

  const valid = validateYearlyCalendarImportRow({
    rowNumber: 2,
    schoolYear: 2027,
    row: {
      entry_type: 'day_event',
      tittel: 'Sommerfest',
      dato: '2028-06-04',
      år: 2028,
      måned: 6,
      farge: 'green',
      vis_på_forside: true,
      for_foreldre: false,
    },
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.payload.title, 'Sommerfest');
  assert.equal(valid.payload.date, '2028-06-04');
  assert.equal(valid.payload.showOnHomepage, true);

  const invalid = validateYearlyCalendarImportRow({
    rowNumber: 5,
    schoolYear: 2027,
    row: {
      entry_type: 'event',
      tittel: '',
      dato: '2029-02-01',
      år: 2029,
      måned: 2,
      farge: 'grey',
    },
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((message) => message.includes('Mangler tittel')));
  assert.ok(invalid.errors.some((message) => message.includes('Ugyldig entry_type')));
  assert.ok(invalid.errors.some((message) => message.includes('Fargen "grey"')));
  assert.ok(invalid.errors.some((message) => message.includes('utenfor barnehageåret 2027/2028')));
}

function testYearlyCalendarImportPreview() {
  const existing = [
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
      description: '',
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
      description: '',
      color: 'red',
      showOnHomepage: false,
      showForParents: false,
    },
  ];

  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: existing,
    rows: [
      {
        rowNumber: 2,
        entry_type: 'day_event',
        tittel: 'Sommerfest',
        dato: '2028-06-04',
        år: 2028,
        måned: 6,
        farge: 'green',
        vis_på_forside: true,
        for_foreldre: false,
      },
      {
        rowNumber: 3,
        entry_type: 'closed',
        tittel: 'Julaften',
        dato: '2027-12-24',
        år: 2027,
        måned: 12,
        farge: 'red',
      },
      {
        rowNumber: 4,
        entry_type: 'week_event',
        tittel: 'Brannvernuke',
        år: 2027,
        måned: 9,
        uke_fra: 38,
        farge: 'orange',
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'changed');
  assert.deepEqual(preview.rows[0].changes, [
    { field: 'date', oldValue: '2028-06-02', newValue: '2028-06-04' },
  ]);
  assert.equal(preview.rows[1].status, 'unchanged');
  assert.equal(preview.rows[2].status, 'new');

  assert.deepEqual(validateImportDecision({ status: 'changed', action: 'update' }), { ok: true });
  assert.deepEqual(validateImportDecision({ status: 'changed', action: 'create' }), { ok: true });
  assert.deepEqual(validateImportDecision({ status: 'changed', action: 'ignore' }), { ok: true });
  assert.equal(validateImportDecision({ status: 'invalid', action: 'create' }).ok, false);
}
```

Add these calls before `console.log('Smoke tests passed');`:

```js
testKindergartenSchoolYear();
testYearlyCalendarImportValidation();
testYearlyCalendarImportPreview();
```

- [ ] **Step 2: Run smoke tests and verify the new import fails**

Run:

```bash
npm test
```

Expected: FAIL with an import/module-not-found error for `../shared/yearly-calendar-utils.js`.

- [ ] **Step 3: Create `shared/yearly-calendar-utils.js`**

Create the file with this implementation:

```js
export const VALID_YEARLY_CALENDAR_ENTRY_TYPES = ['week_event', 'day_event', 'food', 'closed', 'note'];
export const VALID_YEARLY_CALENDAR_COLORS = ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];

const REQUIRED_BY_TYPE = {
  day_event: ['date'],
  closed: ['date'],
  week_event: ['weekNumber'],
  food: ['weekNumber'],
  note: ['weekNumber'],
};

const FIELD_LABELS = {
  entryType: 'entry_type',
  title: 'tittel',
  date: 'dato',
  year: 'år',
  month: 'måned',
  weekNumber: 'uke_fra',
  weekNumberEnd: 'uke_til',
  description: 'beskrivelse',
  color: 'farge',
  showOnHomepage: 'vis_på_forside',
  showForParents: 'for_foreldre',
};

const COMPARE_FIELDS = [
  'entryType',
  'year',
  'month',
  'weekNumber',
  'weekNumberEnd',
  'date',
  'title',
  'description',
  'color',
  'showOnHomepage',
  'showForParents',
];

export function getKindergartenSchoolYear(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

export function normalizeYearlyCalendarTitle(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function toBool(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLocaleLowerCase('nb-NO');
  return ['true', 'ja', 'yes', '1'].includes(normalized);
}

function text(value, maxLength) {
  const out = String(value ?? '').trim();
  return out.length > maxLength ? out.slice(0, maxLength) : out;
}

function dateInSchoolYear(date, schoolYear) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  return isMonthInSchoolYear(year, month, schoolYear);
}

export function isMonthInSchoolYear(year, month, schoolYear) {
  if (month >= 8 && month <= 12) return year === schoolYear;
  if (month >= 1 && month <= 7) return year === schoolYear + 1;
  return false;
}

function canonicalPayload(payload) {
  const supportsDate = payload.entryType === 'day_event' || payload.entryType === 'closed';
  const supportsSpan = payload.entryType === 'week_event' || payload.entryType === 'note';
  const supportsHomepageFlags = payload.entryType === 'day_event';

  return {
    schoolYear: payload.schoolYear,
    year: payload.year,
    month: payload.month,
    entryType: payload.entryType,
    title: payload.title,
    description: payload.description || null,
    color: payload.color || null,
    weekNumber: supportsDate ? null : payload.weekNumber,
    weekNumberEnd: supportsSpan ? payload.weekNumberEnd : null,
    date: supportsDate ? payload.date : null,
    showOnHomepage: supportsHomepageFlags ? payload.showOnHomepage === true : false,
    showForParents: supportsHomepageFlags ? payload.showForParents === true : false,
  };
}

export function validateYearlyCalendarImportRow({ rowNumber, schoolYear, row }) {
  const errors = [];
  const entryType = text(row.entry_type ?? row.entryType, 50);
  const title = text(row.tittel ?? row.title, 200);
  const rawDate = text(row.dato ?? row.date, 20);
  const year = toInt(row['år'] ?? row.year);
  const month = toInt(row['måned'] ?? row.month);
  const weekNumber = toInt(row.uke_fra ?? row.weekNumber);
  const weekNumberEndRaw = toInt(row.uke_til ?? row.weekNumberEnd);
  const description = text(row.beskrivelse ?? row.description, 1000);
  const color = text(row.farge ?? row.color, 30);
  const prefix = `Rad ${rowNumber}: `;

  if (!title) errors.push(`${prefix}Mangler tittel.`);
  if (!VALID_YEARLY_CALENDAR_ENTRY_TYPES.includes(entryType)) {
    errors.push(`${prefix}Ugyldig entry_type "${entryType || '(tom)'}". Bruk en av: ${VALID_YEARLY_CALENDAR_ENTRY_TYPES.join(', ')}.`);
  }
  if (!year || year < 2020 || year > 2100) errors.push(`${prefix}År må være et heltall mellom 2020 og 2100.`);
  if (!month || month < 1 || month > 12) errors.push(`${prefix}Måned må være et heltall mellom 1 og 12.`);
  if (year && month && !isMonthInSchoolYear(year, month, schoolYear)) {
    errors.push(`${prefix}${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')} ligger utenfor barnehageåret ${schoolYear}/${schoolYear + 1}.`);
  }
  if (color && !VALID_YEARLY_CALENDAR_COLORS.includes(color)) {
    errors.push(`${prefix}Fargen "${color}" er ikke tillatt. Bruk en av: ${VALID_YEARLY_CALENDAR_COLORS.join(', ')}.`);
  }

  if (entryType && REQUIRED_BY_TYPE[entryType]?.includes('date')) {
    if (!rawDate || !dateInSchoolYear(rawDate, schoolYear)) {
      errors.push(`${prefix}${entryType} krever dato i format YYYY-MM-DD innenfor barnehageåret ${schoolYear}/${schoolYear + 1}.`);
    }
  }

  if (entryType && REQUIRED_BY_TYPE[entryType]?.includes('weekNumber')) {
    if (!weekNumber || weekNumber < 1 || weekNumber > 53) {
      errors.push(`${prefix}${entryType} krever uke_fra mellom 1 og 53.`);
    }
  }

  if (weekNumberEndRaw != null && (weekNumberEndRaw < 1 || weekNumberEndRaw > 53)) {
    errors.push(`${prefix}uke_til må være mellom 1 og 53.`);
  }
  if (weekNumberEndRaw != null && weekNumber != null && weekNumberEndRaw <= weekNumber) {
    errors.push(`${prefix}uke_til må være høyere enn uke_fra.`);
  }

  if (errors.length > 0) {
    return { ok: false, rowNumber, errors };
  }

  const weekNumberEnd = weekNumberEndRaw != null && weekNumber != null && weekNumberEndRaw > weekNumber
    ? weekNumberEndRaw
    : null;

  return {
    ok: true,
    rowNumber,
    payload: canonicalPayload({
      schoolYear,
      year,
      month,
      entryType,
      title,
      description: description || null,
      color: color || null,
      weekNumber,
      weekNumberEnd,
      date: rawDate || null,
      showOnHomepage: toBool(row.vis_på_forside ?? row.showOnHomepage),
      showForParents: toBool(row.for_foreldre ?? row.showForParents),
    }),
  };
}

function comparableValue(entry, field) {
  if (field === 'entryType') return entry.entryType ?? entry.entry_type;
  if (field === 'weekNumber') return entry.weekNumber ?? entry.week_number ?? null;
  if (field === 'weekNumberEnd') return entry.weekNumberEnd ?? entry.week_number_end ?? null;
  if (field === 'showOnHomepage') return entry.showOnHomepage ?? entry.show_on_homepage ?? false;
  if (field === 'showForParents') return entry.showForParents ?? entry.show_for_parents ?? false;
  if (field === 'description') return entry.description || null;
  if (field === 'color') return entry.color || null;
  if (field === 'date') return entry.date || null;
  return entry[field] ?? null;
}

export function diffYearlyCalendarEntry(existingEntry, payload) {
  const changes = [];
  const canonical = canonicalPayload(payload);
  for (const field of COMPARE_FIELDS) {
    const oldValue = comparableValue(existingEntry, field);
    const newValue = canonical[field] ?? null;
    if (oldValue !== newValue) {
      changes.push({ field, label: FIELD_LABELS[field], oldValue, newValue });
    }
  }
  return changes;
}

export function buildImportPreview({ schoolYear, existingEntries, rows }) {
  const byTitle = new Map();
  for (const entry of existingEntries) {
    const normalized = normalizeYearlyCalendarTitle(entry.title);
    const bucket = byTitle.get(normalized) ?? [];
    bucket.push(entry);
    byTitle.set(normalized, bucket);
  }

  const previewRows = rows.map((row) => {
    const rowNumber = row.rowNumber;
    const validation = validateYearlyCalendarImportRow({ rowNumber, schoolYear, row });
    if (!validation.ok) {
      return { rowNumber, status: 'invalid', errors: validation.errors, original: row };
    }

    const normalizedTitle = normalizeYearlyCalendarTitle(validation.payload.title);
    const matches = byTitle.get(normalizedTitle) ?? [];
    if (matches.length === 0) {
      return { rowNumber, status: 'new', payload: validation.payload, original: row, defaultAction: 'create' };
    }
    if (matches.length > 1) {
      return { rowNumber, status: 'ambiguous', payload: validation.payload, matches, original: row, defaultAction: 'ignore' };
    }

    const changes = diffYearlyCalendarEntry(matches[0], validation.payload);
    if (changes.length === 0) {
      return { rowNumber, status: 'unchanged', payload: validation.payload, existing: matches[0], original: row, defaultAction: 'ignore' };
    }
    return { rowNumber, status: 'changed', payload: validation.payload, existing: matches[0], changes, original: row, defaultAction: 'ignore' };
  });

  return {
    schoolYear,
    rows: previewRows,
    counts: previewRows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, { new: 0, unchanged: 0, changed: 0, invalid: 0, ambiguous: 0 }),
  };
}

export function validateImportDecision({ status, action }) {
  const allowed = {
    new: ['create', 'ignore'],
    unchanged: ['ignore'],
    changed: ['update', 'create', 'ignore'],
    ambiguous: ['create', 'ignore'],
    invalid: ['ignore'],
  };
  if (!allowed[status]?.includes(action)) {
    return { ok: false, error: `Action "${action}" is not allowed for status "${status}".` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Create `shared/yearly-calendar-utils.d.ts`**

Create the file with this declaration:

```ts
import type { YearlyCalendarEntry } from './schema';

export const VALID_YEARLY_CALENDAR_ENTRY_TYPES: ['week_event', 'day_event', 'food', 'closed', 'note'];
export const VALID_YEARLY_CALENDAR_COLORS: ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];

export type YearlyCalendarImportPayload = {
  schoolYear: number;
  year: number;
  month: number;
  entryType: 'week_event' | 'day_event' | 'food' | 'closed' | 'note';
  title: string;
  description: string | null;
  color: string | null;
  weekNumber: number | null;
  weekNumberEnd: number | null;
  date: string | null;
  showOnHomepage: boolean;
  showForParents: boolean;
};

export type YearlyCalendarRawImportRow = {
  rowNumber: number;
  entry_type?: string;
  entryType?: string;
  tittel?: string;
  title?: string;
  dato?: string;
  date?: string;
  år?: number | string;
  year?: number | string;
  måned?: number | string;
  month?: number | string;
  uke_fra?: number | string;
  weekNumber?: number | string;
  uke_til?: number | string;
  weekNumberEnd?: number | string;
  beskrivelse?: string;
  description?: string;
  farge?: string;
  color?: string;
  vis_på_forside?: boolean | string | number;
  showOnHomepage?: boolean | string | number;
  for_foreldre?: boolean | string | number;
  showForParents?: boolean | string | number;
};

export type ImportValidationResult =
  | { ok: true; rowNumber: number; payload: YearlyCalendarImportPayload }
  | { ok: false; rowNumber: number; errors: string[] };

export type ImportPreviewRow =
  | { rowNumber: number; status: 'new'; payload: YearlyCalendarImportPayload; original: YearlyCalendarRawImportRow; defaultAction: 'create' }
  | { rowNumber: number; status: 'unchanged'; payload: YearlyCalendarImportPayload; existing: YearlyCalendarEntry; original: YearlyCalendarRawImportRow; defaultAction: 'ignore' }
  | { rowNumber: number; status: 'changed'; payload: YearlyCalendarImportPayload; existing: YearlyCalendarEntry; changes: Array<{ field: string; label?: string; oldValue: unknown; newValue: unknown }>; original: YearlyCalendarRawImportRow; defaultAction: 'ignore' }
  | { rowNumber: number; status: 'ambiguous'; payload: YearlyCalendarImportPayload; matches: YearlyCalendarEntry[]; original: YearlyCalendarRawImportRow; defaultAction: 'ignore' }
  | { rowNumber: number; status: 'invalid'; errors: string[]; original: YearlyCalendarRawImportRow };

export function getKindergartenSchoolYear(date?: Date): number;
export function normalizeYearlyCalendarTitle(value: unknown): string;
export function isMonthInSchoolYear(year: number, month: number, schoolYear: number): boolean;
export function validateYearlyCalendarImportRow(opts: { rowNumber: number; schoolYear: number; row: YearlyCalendarRawImportRow }): ImportValidationResult;
export function diffYearlyCalendarEntry(existingEntry: YearlyCalendarEntry, payload: YearlyCalendarImportPayload): Array<{ field: string; label?: string; oldValue: unknown; newValue: unknown }>;
export function buildImportPreview(opts: { schoolYear: number; existingEntries: YearlyCalendarEntry[]; rows: YearlyCalendarRawImportRow[] }): { schoolYear: number; rows: ImportPreviewRow[]; counts: Record<'new' | 'unchanged' | 'changed' | 'invalid' | 'ambiguous', number> };
export function validateImportDecision(opts: { status: ImportPreviewRow['status']; action: 'create' | 'update' | 'ignore' }): { ok: true } | { ok: false; error: string };
```

- [ ] **Step 5: Run smoke tests and verify the shared utility passes**

Run:

```bash
npm test
```

Expected: PASS with `Smoke tests passed`.

- [ ] **Step 6: Commit shared utility and tests**

Run:

```bash
git add shared/yearly-calendar-utils.js shared/yearly-calendar-utils.d.ts scripts/smoke-tests.mjs
git commit -m "feat: add yearly calendar import utilities"
```

Expected: commit succeeds.

---

### Task 2: Centralize The 1 August Default-Year Rule

**Files:**
- Create: `client/src/lib/kindergarten-year.ts`
- Modify: `client/src/pages/yearly-calendar.tsx`
- Modify: `client/src/pages/home.tsx`

- [ ] **Step 1: Create the client helper**

Create `client/src/lib/kindergarten-year.ts`:

```ts
export { getKindergartenSchoolYear } from '@shared/yearly-calendar-utils';
```

- [ ] **Step 2: Use the helper in `client/src/pages/yearly-calendar.tsx`**

Add this import:

```ts
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
```

Replace:

```ts
const defaultSchoolYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
```

with:

```ts
const defaultSchoolYear = getKindergartenSchoolYear(now);
```

Replace:

```ts
const schoolYearOptions = [defaultSchoolYear, defaultSchoolYear + 1];
```

with:

```ts
const schoolYearOptions = Array.from({ length: 6 }, (_, idx) => defaultSchoolYear - 1 + idx);
if (!schoolYearOptions.includes(schoolYear)) {
  schoolYearOptions.push(schoolYear);
  schoolYearOptions.sort((a, b) => a - b);
}
```

- [ ] **Step 3: Use the helper in `client/src/pages/home.tsx`**

Add this import:

```ts
import { getKindergartenSchoolYear } from "@/lib/kindergarten-year";
```

Replace:

```ts
const currentSchoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
```

with:

```ts
const currentSchoolYear = getKindergartenSchoolYear(now);
```

- [ ] **Step 4: Run type check and smoke tests**

Run:

```bash
npm run check
npm test
```

Expected: both pass.

- [ ] **Step 5: Commit the default-year helper**

Run:

```bash
git add client/src/lib/kindergarten-year.ts client/src/pages/yearly-calendar.tsx client/src/pages/home.tsx
git commit -m "fix: centralize yearly calendar school year default"
```

Expected: commit succeeds.

---

### Task 3: Add ExcelJS Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install ExcelJS**

Run:

```bash
npm install exceljs
```

Expected:

- `exceljs` appears in `dependencies` in `package.json`.
- `package-lock.json` updates.
- Command exits with code 0.

- [ ] **Step 2: Verify dependency tree installs cleanly**

Run:

```bash
npm run check
npm test
```

Expected: both pass.

- [ ] **Step 3: Commit dependency update**

Run:

```bash
git add package.json package-lock.json
git commit -m "chore: add Excel workbook support"
```

Expected: commit succeeds.

---

### Task 4: Build Browser Excel Template Export And Parse Helpers

**Files:**
- Create: `client/src/lib/yearly-calendar-excel.ts`

- [ ] **Step 1: Create the Excel helper module**

Create `client/src/lib/yearly-calendar-excel.ts`:

```ts
import type { YearlyCalendarEntry } from "@shared/schema";
import {
  VALID_YEARLY_CALENDAR_COLORS,
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  type YearlyCalendarRawImportRow,
} from "@shared/yearly-calendar-utils";

type ExcelWorkbook = import("exceljs").Workbook;

const ENTRY_HEADERS = [
  "entry_type",
  "tittel",
  "dato",
  "år",
  "måned",
  "uke_fra",
  "uke_til",
  "beskrivelse",
  "farge",
  "vis_på_forside",
  "for_foreldre",
] as const;

function entryToRow(entry: YearlyCalendarEntry): Record<(typeof ENTRY_HEADERS)[number], string | number | boolean> {
  return {
    entry_type: entry.entryType,
    tittel: entry.title,
    dato: entry.date ?? "",
    år: entry.year,
    måned: entry.month,
    uke_fra: entry.weekNumber ?? "",
    uke_til: entry.weekNumberEnd ?? "",
    beskrivelse: entry.description ?? "",
    farge: entry.color ?? "",
    vis_på_forside: entry.showOnHomepage === true,
    for_foreldre: entry.showForParents === true,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function addEntrySheet(workbook: ExcelWorkbook, entries: YearlyCalendarEntry[]) {
  const worksheet = workbook.addWorksheet("Oppføringer");
  worksheet.addRow([...ENTRY_HEADERS]);
  for (const entry of entries) {
    const row = entryToRow(entry);
    worksheet.addRow(ENTRY_HEADERS.map((header) => row[header]));
  }

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns = ENTRY_HEADERS.map((header) => ({
    header,
    key: header,
    width: header === "beskrivelse" ? 36 : 18,
  }));

  const entryTypeFormula = `"${VALID_YEARLY_CALENDAR_ENTRY_TYPES.join(",")}"`;
  const colorFormula = `"${VALID_YEARLY_CALENDAR_COLORS.join(",")}"`;
  const booleanFormula = '"true,false"';

  for (let rowNumber = 2; rowNumber <= 500; rowNumber += 1) {
    worksheet.getCell(`A${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [entryTypeFormula],
    };
    worksheet.getCell(`I${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [colorFormula],
    };
    worksheet.getCell(`J${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [booleanFormula],
    };
    worksheet.getCell(`K${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [booleanFormula],
    };
  }
}

function addGuideSheet(workbook: ExcelWorkbook, schoolYear: number) {
  const worksheet = workbook.addWorksheet("Veiledning");
  const rows = [
    ["Årskalender Excel-mal"],
    [""],
    ["Barnehageår", `${schoolYear}/${schoolYear + 1}`],
    [""],
    ["Gyldige entry_type-verdier"],
    ["week_event", "Aktivitet eller periode som ligger på uke, eventuelt ukeintervall."],
    ["day_event", "Hendelse på én bestemt dato. Kan vises på forsiden."],
    ["food", "Ukens varmmat. Bruk uke_fra."],
    ["closed", "Barnehagen er stengt. Krever dato."],
    ["note", "Merknad knyttet til uke, eventuelt ukeintervall."],
    [""],
    ["Gyldige farger", VALID_YEARLY_CALENDAR_COLORS.join(", ")],
    [""],
    ["Datoformat", "YYYY-MM-DD"],
    ["Boolean-format", "true eller false"],
    [""],
    ["Påkrevde felt"],
    ["day_event", "entry_type, tittel, dato, år, måned"],
    ["closed", "entry_type, tittel, dato, år, måned"],
    ["week_event", "entry_type, tittel, år, måned, uke_fra"],
    ["food", "entry_type, tittel, år, måned, uke_fra"],
    ["note", "entry_type, tittel, år, måned, uke_fra"],
    [""],
    ["Eksempel"],
    ["day_event", "Sommerfest", "2028-06-04", "2028", "6", "", "", "Sommerfest for familier", "green", "true", "true"],
    ["closed", "Planleggingsdag", "2027-11-10", "2027", "11", "", "", "", "red", "false", "false"],
  ];

  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getColumn(1).width = 22;
  worksheet.getColumn(2).width = 80;
  worksheet.getRow(1).font = { bold: true, size: 16 };
  worksheet.getRow(5).font = { bold: true };
  worksheet.getRow(12).font = { bold: true };
  worksheet.getRow(17).font = { bold: true };
  worksheet.getRow(24).font = { bold: true };
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in (value as { text?: unknown })) {
    return String((value as { text?: unknown }).text ?? "");
  }
  return value as string | number | boolean;
}

export async function downloadYearlyCalendarTemplate(opts: {
  schoolYear: number;
  entries: YearlyCalendarEntry[];
}) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FAU Erdal Barnehage";
  workbook.created = new Date();
  addEntrySheet(workbook, opts.entries);
  addGuideSheet(workbook, opts.schoolYear);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `arskalender-mal-${opts.schoolYear}-${opts.schoolYear + 1}.xlsx`);
}

export async function parseYearlyCalendarWorkbook(file: File): Promise<YearlyCalendarRawImportRow[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.getWorksheet("Oppføringer") ?? workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values as unknown[];
  const headerByColumn = new Map<number, string>();
  headers.forEach((value, index) => {
    if (index > 0 && value) headerByColumn.set(index, String(value).trim());
  });

  const rows: YearlyCalendarRawImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const out: YearlyCalendarRawImportRow = { rowNumber };
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headerByColumn.get(colNumber);
      if (!header) return;
      const value = normalizeCellValue(cell.value);
      if (value !== "") hasValue = true;
      (out as Record<string, unknown>)[header] = value;
    });
    if (hasValue) rows.push(out);
  });

  return rows;
}
```

- [ ] **Step 2: Run type check**

Run:

```bash
npm run check
```

Expected: PASS. If TypeScript reports that `exceljs` import types are too broad for `BlobPart`, wrap the buffer in `new Uint8Array(buffer as ArrayBuffer)`.

- [ ] **Step 3: Commit Excel helper**

Run:

```bash
git add client/src/lib/yearly-calendar-excel.ts
git commit -m "feat: add yearly calendar Excel helpers"
```

Expected: commit succeeds.

---

### Task 5: Add Import Preview And Commit API Actions

**Files:**
- Modify: `api/yearly-calendar.js`

- [ ] **Step 1: Import shared import helpers**

Add to `api/yearly-calendar.js`:

```js
import {
  buildImportPreview,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';
```

- [ ] **Step 2: Add shared row selection helper**

Add after `sanitizeEntryPayload()`:

```js
async function getEntriesForSchoolYear(sql, schoolYear) {
  const rows = await sql`
    SELECT id, school_year, year, month, entry_type, week_number, week_number_end,
           weekday_start, weekday_end, date, title, description, color,
           show_on_homepage, show_for_parents, created_by, created_at, updated_at
    FROM yearly_calendar_entries
    WHERE school_year = ${schoolYear}
    ORDER BY year ASC, month ASC, week_number ASC NULLS LAST
  `;
  return rows.map(mapEntry);
}
```

- [ ] **Step 3: Replace GET query with helper**

Replace the existing GET query block with:

```js
const entries = await getEntriesForSchoolYear(sql, schoolYear);
return res.status(200).json(entries);
```

- [ ] **Step 4: Add preview branch after auth/CSRF and before normal POST create**

Inside the authenticated write section, before `if (req.method === 'POST') {`, add:

```js
if (req.method === 'POST' && req.query.action === 'preview-import') {
  const schoolYear = sanitizeNumber(req.body?.schoolYear, 2020, 2100);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!schoolYear) {
    return res.status(400).json({ error: 'Valid schoolYear is required' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: 'Import cannot contain more than 500 rows' });
  }

  const existingEntries = await getEntriesForSchoolYear(sql, schoolYear);
  const preview = buildImportPreview({ schoolYear, existingEntries, rows });
  return res.status(200).json(preview);
}
```

- [ ] **Step 5: Add commit branch after preview and before normal POST create**

Still before the normal create branch, add:

```js
if (req.method === 'POST' && req.query.action === 'commit-import') {
  const schoolYear = sanitizeNumber(req.body?.schoolYear, 2020, 2100);
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];

  if (!schoolYear) {
    return res.status(400).json({ error: 'Valid schoolYear is required' });
  }
  if (decisions.length > 500) {
    return res.status(400).json({ error: 'Import cannot contain more than 500 decisions' });
  }

  const existingEntries = await getEntriesForSchoolYear(sql, schoolYear);
  const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const now = new Date().toISOString();
  const results = { created: [], updated: [], ignored: [], errors: [] };

  for (const decision of decisions) {
    const rowNumber = sanitizeNumber(decision?.rowNumber, 1, 100000);
    const status = sanitizeText(decision?.status, 20);
    const action = sanitizeText(decision?.action, 20);
    const existingId = decision?.existingId != null ? sanitizeNumber(decision.existingId, 1, 2147483647) : null;
    const validation = validateYearlyCalendarImportRow({
      rowNumber,
      schoolYear,
      row: { ...(decision?.row || {}), rowNumber },
    });
    const decisionValidation = validateImportDecision({ status, action });

    if (!rowNumber || !decisionValidation.ok || !validation.ok) {
      results.errors.push({
        rowNumber: rowNumber || null,
        errors: [
          ...(decisionValidation.ok ? [] : [decisionValidation.error]),
          ...(validation.ok ? [] : validation.errors),
        ],
      });
      continue;
    }

    if (action === 'ignore') {
      results.ignored.push({ rowNumber });
      continue;
    }

    const payload = validation.payload;
    if (action === 'update') {
      if (!existingId || !existingById.has(existingId)) {
        results.errors.push({ rowNumber, errors: ['Existing entry was not found for update.'] });
        continue;
      }
      const updated = await sql`
        UPDATE yearly_calendar_entries
        SET school_year = ${payload.schoolYear},
            year = ${payload.year},
            month = ${payload.month},
            entry_type = ${payload.entryType},
            week_number = ${payload.weekNumber},
            week_number_end = ${payload.weekNumberEnd},
            weekday_start = ${null},
            weekday_end = ${null},
            date = ${payload.date},
            title = ${payload.title},
            description = ${payload.description},
            color = ${payload.color},
            show_on_homepage = ${payload.showOnHomepage},
            show_for_parents = ${payload.showForParents},
            updated_at = ${now}
        WHERE id = ${existingId}
        RETURNING *
      `;
      if (updated.length === 0) {
        results.errors.push({ rowNumber, errors: ['Existing entry was not found for update.'] });
      } else {
        results.updated.push(mapEntry(updated[0]));
      }
      continue;
    }

    if (action === 'create') {
      const created = await sql`
        INSERT INTO yearly_calendar_entries (
          school_year, year, month, entry_type, week_number, week_number_end,
          weekday_start, weekday_end, date, title, description, color,
          show_on_homepage, show_for_parents, created_by, created_at, updated_at
        ) VALUES (
          ${payload.schoolYear}, ${payload.year}, ${payload.month}, ${payload.entryType}, ${payload.weekNumber}, ${payload.weekNumberEnd},
          ${null}, ${null}, ${payload.date}, ${payload.title}, ${payload.description}, ${payload.color},
          ${payload.showOnHomepage}, ${payload.showForParents}, ${user.name || user.username || 'ukjent'}, ${now}, ${now}
        )
        RETURNING *
      `;
      results.created.push(mapEntry(created[0]));
    }
  }

  return res.status(200).json(results);
}
```

- [ ] **Step 6: Run smoke tests and type check**

Run:

```bash
npm test
npm run check
```

Expected: both pass.

- [ ] **Step 7: Commit API import actions**

Run:

```bash
git add api/yearly-calendar.js
git commit -m "feat: add yearly calendar import API actions"
```

Expected: commit succeeds.

---

### Task 6: Add Import Preview Modal UI

**Files:**
- Create: `client/src/components/yearly-calendar-import-modal.tsx`
- Modify: `client/src/lib/i18n.ts`

- [ ] **Step 1: Add i18n type fields**

In the `yearlyCalendar` type in `client/src/lib/i18n.ts`, add:

```ts
downloadTemplate: string;
importExcel: string;
importModal: {
  title: string;
  chooseFile: string;
  preview: string;
  commit: string;
  commitValidRows: string;
  committing: string;
  cancel: string;
  newEntries: string;
  unchangedEntries: string;
  changedEntries: string;
  invalidRows: string;
  ambiguousRows: string;
  updateExisting: string;
  createNew: string;
  ignore: string;
  oldValue: string;
  newValue: string;
  noFile: string;
  previewError: string;
  importSuccess: string;
  importError: string;
};
```

- [ ] **Step 2: Add Norwegian strings**

Inside the Norwegian `yearlyCalendar` object, add:

```ts
downloadTemplate: "Last ned Excel-mal",
importExcel: "Importer Excel",
importModal: {
  title: "Importer årskalender",
  chooseFile: "Velg Excel-fil",
  preview: "Forhåndsvis",
  commit: "Importer",
  commitValidRows: "Importer gyldige rader",
  committing: "Importerer...",
  cancel: "Avbryt",
  newEntries: "Nye oppføringer",
  unchangedEntries: "Uendrede oppføringer",
  changedEntries: "Endringer som må bekreftes",
  invalidRows: "Rader med feil",
  ambiguousRows: "Flere treff på samme tittel",
  updateExisting: "Oppdater eksisterende",
  createNew: "Opprett som ny",
  ignore: "Ignorer",
  oldValue: "Gammel verdi",
  newValue: "Ny verdi",
  noFile: "Velg en Excel-fil først.",
  previewError: "Kunne ikke lese Excel-filen.",
  importSuccess: "Import fullført",
  importError: "Kunne ikke importere radene.",
},
```

- [ ] **Step 3: Add English strings**

Inside the English `yearlyCalendar` object, add:

```ts
downloadTemplate: "Download Excel template",
importExcel: "Import Excel",
importModal: {
  title: "Import yearly calendar",
  chooseFile: "Choose Excel file",
  preview: "Preview",
  commit: "Import",
  commitValidRows: "Import valid rows",
  committing: "Importing...",
  cancel: "Cancel",
  newEntries: "New entries",
  unchangedEntries: "Unchanged entries",
  changedEntries: "Changes to confirm",
  invalidRows: "Rows with errors",
  ambiguousRows: "Multiple matches for the same title",
  updateExisting: "Update existing",
  createNew: "Create as new",
  ignore: "Ignore",
  oldValue: "Old value",
  newValue: "New value",
  noFile: "Choose an Excel file first.",
  previewError: "Could not read the Excel file.",
  importSuccess: "Import completed",
  importError: "Could not import the rows.",
},
```

- [ ] **Step 4: Create the modal component**

Create `client/src/components/yearly-calendar-import-modal.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseYearlyCalendarWorkbook } from "@/lib/yearly-calendar-excel";
import type { YearlyCalendarRawImportRow, ImportPreviewRow } from "@shared/yearly-calendar-utils";

type ImportAction = "create" | "update" | "ignore";

type PreviewResponse = {
  schoolYear: number;
  rows: ImportPreviewRow[];
  counts: Record<"new" | "unchanged" | "changed" | "invalid" | "ambiguous", number>;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: number;
};

function actionForRow(row: ImportPreviewRow): ImportAction {
  if (row.status === "new") return "create";
  return "ignore";
}

function rowTitle(row: ImportPreviewRow): string {
  if ("payload" in row) return row.payload.title;
  const original = row.original as YearlyCalendarRawImportRow;
  return String(original.tittel ?? original.title ?? `Rad ${row.rowNumber}`);
}

export default function YearlyCalendarImportModal({ isOpen, onClose, schoolYear }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<YearlyCalendarRawImportRow[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [actions, setActions] = useState<Record<number, ImportAction>>({});

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t.yearlyCalendar.importModal.noFile);
      const rows = await parseYearlyCalendarWorkbook(file);
      setRawRows(rows);
      const res = await apiRequest("POST", "/api/yearly-calendar?action=preview-import", { schoolYear, rows });
      return res.json() as Promise<PreviewResponse>;
    },
    onSuccess: (data) => {
      setPreview(data);
      setActions(Object.fromEntries(data.rows.map((row) => [row.rowNumber, actionForRow(row)])));
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.importModal.previewError,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview) return null;
      const byRowNumber = new Map(rawRows.map((row) => [row.rowNumber, row]));
      const decisions = preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        action: actions[row.rowNumber] ?? actionForRow(row),
        existingId: "existing" in row ? row.existing.id : null,
        row: byRowNumber.get(row.rowNumber) ?? row.original,
      }));
      const res = await apiRequest("POST", "/api/yearly-calendar?action=commit-import", { schoolYear, decisions });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/yearly-calendar?schoolYear=${schoolYear}`] });
      toast({ title: t.yearlyCalendar.importModal.importSuccess });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.importModal.importError,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const groups = {
      new: [] as ImportPreviewRow[],
      unchanged: [] as ImportPreviewRow[],
      changed: [] as ImportPreviewRow[],
      invalid: [] as ImportPreviewRow[],
      ambiguous: [] as ImportPreviewRow[],
    };
    preview?.rows.forEach((row) => groups[row.status].push(row as any));
    return groups;
  }, [preview]);

  const importableCount = preview?.rows.filter((row) => {
    const action = actions[row.rowNumber] ?? actionForRow(row);
    return row.status !== "invalid" && action !== "ignore";
  }).length ?? 0;

  const renderAction = (row: ImportPreviewRow) => {
    if (row.status === "invalid" || row.status === "unchanged") return null;
    const allowed: ImportAction[] = row.status === "changed" ? ["update", "create", "ignore"] : ["create", "ignore"];
    return (
      <Select
        value={actions[row.rowNumber] ?? actionForRow(row)}
        onValueChange={(value) => setActions((old) => ({ ...old, [row.rowNumber]: value as ImportAction }))}
      >
        <SelectTrigger className="w-full sm:w-[210px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowed.includes("update") && <SelectItem value="update">{t.yearlyCalendar.importModal.updateExisting}</SelectItem>}
          {allowed.includes("create") && <SelectItem value="create">{t.yearlyCalendar.importModal.createNew}</SelectItem>}
          <SelectItem value="ignore">{t.yearlyCalendar.importModal.ignore}</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const renderRows = (title: string, rows: ImportPreviewRow[]) => {
    if (rows.length === 0) return null;
    return (
      <section className="space-y-2">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{title} ({rows.length})</h3>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.rowNumber} className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium">{rowTitle(row)}</p>
                  <p className="text-xs text-neutral-500">Rad {row.rowNumber}</p>
                </div>
                {renderAction(row)}
              </div>
              {row.status === "changed" && (
                <div className="mt-2 space-y-1 text-sm">
                  {row.changes.map((change) => (
                    <p key={change.field}>
                      <span className="font-medium">{change.label ?? change.field}</span>: {t.yearlyCalendar.importModal.oldValue}: {String(change.oldValue ?? "")} / {t.yearlyCalendar.importModal.newValue}: {String(change.newValue ?? "")}
                    </p>
                  ))}
                </div>
              )}
              {row.status === "invalid" && (
                <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
                  {row.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.yearlyCalendar.importModal.title} {schoolYear}/{schoolYear + 1}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="yearly-calendar-import-file">{t.yearlyCalendar.importModal.chooseFile}</Label>
            <Input
              id="yearly-calendar-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setRawRows([]);
                setActions({});
              }}
            />
          </div>

          <Button type="button" onClick={() => previewMutation.mutate()} disabled={!file || previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {t.yearlyCalendar.importModal.preview}
          </Button>

          {preview && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3"><CheckCircle2 className="h-4 w-4" /> {t.yearlyCalendar.importModal.newEntries}: {preview.counts.new}</div>
                <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 p-3">{t.yearlyCalendar.importModal.unchangedEntries}: {preview.counts.unchanged}</div>
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-3"><AlertTriangle className="h-4 w-4" /> {t.yearlyCalendar.importModal.changedEntries}: {preview.counts.changed}</div>
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3">{t.yearlyCalendar.importModal.invalidRows}: {preview.counts.invalid}</div>
                <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3">{t.yearlyCalendar.importModal.ambiguousRows}: {preview.counts.ambiguous}</div>
              </div>

              {renderRows(t.yearlyCalendar.importModal.changedEntries, grouped.changed)}
              {renderRows(t.yearlyCalendar.importModal.newEntries, grouped.new)}
              {renderRows(t.yearlyCalendar.importModal.ambiguousRows, grouped.ambiguous)}
              {renderRows(t.yearlyCalendar.importModal.invalidRows, grouped.invalid)}
              {renderRows(t.yearlyCalendar.importModal.unchangedEntries, grouped.unchanged)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t.yearlyCalendar.importModal.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => commitMutation.mutate()}
            disabled={!preview || importableCount === 0 || commitMutation.isPending}
            className="bg-[#FF6B35] hover:bg-[#FF5722] text-white"
          >
            {commitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview?.counts.invalid ? t.yearlyCalendar.importModal.commitValidRows : t.yearlyCalendar.importModal.commit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run type check**

Run:

```bash
npm run check
```

Expected: PASS. If `ImportPreviewRow` cannot be imported as a runtime value, ensure it is imported with `import type`.

- [ ] **Step 6: Commit modal and i18n**

Run:

```bash
git add client/src/components/yearly-calendar-import-modal.tsx client/src/lib/i18n.ts
git commit -m "feat: add yearly calendar import preview modal"
```

Expected: commit succeeds.

---

### Task 7: Wire Export And Import Controls Into The Yearly Calendar Page

**Files:**
- Modify: `client/src/pages/yearly-calendar.tsx`

- [ ] **Step 1: Add imports**

Update the lucide import to include upload/file icons:

```ts
import { Plus, Pencil, Calendar as CalendarIcon, Utensils, Sticker, GripVertical, ChevronLeft, ChevronRight, Download, Loader2, FileSpreadsheet, Upload } from "lucide-react";
```

Add:

```ts
import YearlyCalendarImportModal from "@/components/yearly-calendar-import-modal";
```

- [ ] **Step 2: Add import modal state**

Near the existing modal state, add:

```ts
const [importModalOpen, setImportModalOpen] = useState(false);
```

- [ ] **Step 3: Add template download handler**

Near `downloadPdf`, add:

```ts
const downloadTemplate = async () => {
  try {
    const { downloadYearlyCalendarTemplate } = await import("@/lib/yearly-calendar-excel");
    await downloadYearlyCalendarTemplate({ schoolYear, entries });
  } catch (err) {
    toast({
      title: t.yearlyCalendar.pdfErrorTitle,
      description: err instanceof Error ? err.message : t.yearlyCalendar.pdfErrorDescription,
      variant: "destructive",
    });
  }
};
```

- [ ] **Step 4: Add buttons in the hero action area**

Inside the existing `{canEdit && (...)}` block that renders `Legg til`, add these sibling buttons after the add button:

```tsx
<Button
  onClick={downloadTemplate}
  variant="secondary"
  className="bg-white dark:bg-neutral-950 text-[#2C5F41] hover:bg-yellow-100 dark:hover:bg-neutral-900 print:hidden"
>
  <FileSpreadsheet className="h-4 w-4 mr-2" />
  {t.yearlyCalendar.downloadTemplate}
</Button>

<Button
  onClick={() => setImportModalOpen(true)}
  variant="secondary"
  className="bg-white dark:bg-neutral-950 text-[#2C5F41] hover:bg-yellow-100 dark:hover:bg-neutral-900 print:hidden"
>
  <Upload className="h-4 w-4 mr-2" />
  {t.yearlyCalendar.importExcel}
</Button>
```

- [ ] **Step 5: Mount the import modal**

Near the existing `YearlyCalendarEntryModal`, add:

```tsx
<YearlyCalendarImportModal
  isOpen={importModalOpen}
  onClose={() => setImportModalOpen(false)}
  schoolYear={schoolYear}
/>
```

- [ ] **Step 6: Run type check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit page wiring**

Run:

```bash
git add client/src/pages/yearly-calendar.tsx
git commit -m "feat: wire yearly calendar Excel import controls"
```

Expected: commit succeeds.

---

### Task 8: End-To-End Local Verification

**Files:**
- No source edits unless verification finds defects.

- [ ] **Step 1: Run full static and smoke verification**

Run:

```bash
npm run check
npm test
```

Expected: both pass.

- [ ] **Step 2: Build production assets**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully.

- [ ] **Step 3: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite reports a local URL on port `5000`.

- [ ] **Step 4: Manually verify the page**

Open:

```text
http://localhost:5000/arskalender
```

Expected:

- Anonymous users can view the yearly calendar.
- Logged-in yearly-calendar editors see `Last ned Excel-mal` and `Importer Excel`.
- Default school year follows the 1 August helper for the current date.
- The year selector offers years around the default, including future years such as `2027/2028` when the default is `2025/2026`.
- Downloading the template creates an `.xlsx` with `Oppføringer` and `Veiledning`.
- `Veiledning` lists all `entry_type` values and valid colors.

- [ ] **Step 5: Verify import preview against deployed/local API mode**

Because plain `npm run dev` does not run Vercel serverless functions, verify import behavior with one of these commands:

```bash
npx vercel dev
```

or deploy to a Vercel preview environment.

Expected:

- Uploading a valid edited workbook shows grouped preview rows.
- Invalid rows show specific error messages.
- Changed rows show old and new values and allow `Oppdater eksisterende`, `Opprett som ny`, or `Ignorer`.
- Committing invalid plus valid rows imports only valid non-ignored rows.
- Query cache refreshes and the page displays newly created or updated entries.

- [ ] **Step 6: Commit fixes found during verification**

If verification required changes, commit them:

```bash
git add <changed-files>
git commit -m "fix: polish yearly calendar Excel import"
```

Expected: commit succeeds only if there were actual verification fixes.

