export const VALID_YEARLY_CALENDAR_ENTRY_TYPES = ['week_event', 'day_event', 'food', 'closed', 'note'];
export const VALID_YEARLY_CALENDAR_COLORS = ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];

const YEAR_COLUMN = '\u00e5r';
const MONTH_COLUMN = 'm\u00e5ned';
const HOMEPAGE_COLUMN = 'vis_p\u00e5_forside';

const FIELD_LABELS = {
  schoolYear: 'barnehage\u00e5r',
  year: YEAR_COLUMN,
  month: MONTH_COLUMN,
  entryType: 'entry_type',
  title: 'tittel',
  description: 'beskrivelse',
  color: 'farge',
  weekNumber: 'uke_fra',
  weekNumberEnd: 'uke_til',
  date: 'dato',
  showOnHomepage: HOMEPAGE_COLUMN,
  showForParents: 'for_foreldre',
};

const COMPARE_FIELDS = [
  'year',
  'month',
  'entryType',
  'weekNumber',
  'weekNumberEnd',
  'date',
  'title',
  'description',
  'color',
  'showOnHomepage',
  'showForParents',
];

const DECISION_ACTIONS = {
  new: ['create', 'ignore'],
  unchanged: ['ignore'],
  changed: ['update', 'create', 'ignore'],
  ambiguous: ['create', 'ignore'],
  invalid: ['ignore'],
};

export function getKindergartenSchoolYear(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

export function normalizeYearlyCalendarTitle(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('nb-NO');
}

export function isMonthInSchoolYear(year, month, schoolYear) {
  if (month >= 8 && month <= 12) return year === schoolYear;
  if (month >= 1 && month <= 7) return year === schoolYear + 1;
  return false;
}

function readAlias(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return undefined;
}

function readText(row, aliases, maxLength) {
  const value = readAlias(row, aliases);
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return maxLength && normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function readInteger(row, aliases) {
  const value = readAlias(row, aliases);
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }

  return null;
}

function readBoolean(row, aliases) {
  const value = readAlias(row, aliases);
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLocaleLowerCase('nb-NO');
  return ['true', '1', 'ja', 'yes'].includes(normalized);
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function isDateInSchoolYear(value, schoolYear) {
  if (!isValidIsoDate(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return isMonthInSchoolYear(year, month, schoolYear);
}

function dateParts(value) {
  if (!isValidIsoDate(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return { year, month };
}

function addError(errors, rowNumber, message) {
  errors.push(`Rad ${rowNumber}: ${message}`);
}

function normalizeDescription(value) {
  return value || null;
}

function normalizeColor(value) {
  return value || null;
}

function canonicalPayload(payload) {
  const supportsDate = payload.entryType === 'day_event' || payload.entryType === 'closed';
  const supportsWeekSpan = payload.entryType === 'week_event' || payload.entryType === 'note';
  const supportsHomepage = payload.entryType === 'day_event';

  return {
    schoolYear: payload.schoolYear,
    year: payload.year,
    month: payload.month,
    entryType: payload.entryType,
    title: payload.title,
    description: normalizeDescription(payload.description),
    color: normalizeColor(payload.color),
    weekNumber: supportsDate ? null : payload.weekNumber,
    weekNumberEnd: supportsWeekSpan ? payload.weekNumberEnd : null,
    date: supportsDate ? payload.date : null,
    showOnHomepage: supportsHomepage ? payload.showOnHomepage === true : false,
    showForParents: supportsHomepage ? payload.showForParents === true : false,
  };
}

export function validateYearlyCalendarImportRow({ rowNumber, schoolYear, row }) {
  const source = row ?? {};
  const errors = [];

  const entryType = readText(source, ['entry_type', 'entryType'], 50);
  const title = readText(source, ['tittel', 'title'], 200);
  const date = readText(source, ['dato', 'date'], 20);
  const year = readInteger(source, [YEAR_COLUMN, 'year']);
  const month = readInteger(source, [MONTH_COLUMN, 'month']);
  const weekNumber = readInteger(source, ['uke_fra', 'weekNumber']);
  const weekNumberEnd = readInteger(source, ['uke_til', 'weekNumberEnd']);
  const description = readText(source, ['beskrivelse', 'description'], 1000);
  const color = readText(source, ['farge', 'color'], 30);
  const showOnHomepage = readBoolean(source, [HOMEPAGE_COLUMN, 'showOnHomepage']);
  const showForParents = readBoolean(source, ['for_foreldre', 'showForParents']);

  if (!title) {
    addError(errors, rowNumber, 'Mangler tittel.');
  }

  if (!VALID_YEARLY_CALENDAR_ENTRY_TYPES.includes(entryType)) {
    addError(
      errors,
      rowNumber,
      `Ugyldig entry_type "${entryType || '(tom)'}". Bruk en av: ${VALID_YEARLY_CALENDAR_ENTRY_TYPES.join(', ')}.`,
    );
  }

  if (year === null) {
    addError(errors, rowNumber, `${FIELD_LABELS.year} m\u00e5 v\u00e6re et heltall.`);
  }

  if (month === null || month < 1 || month > 12) {
    addError(errors, rowNumber, `${FIELD_LABELS.month} m\u00e5 v\u00e6re et heltall mellom 1 og 12.`);
  }

  if (year !== null && month !== null && month >= 1 && month <= 12 && !isMonthInSchoolYear(year, month, schoolYear)) {
    addError(errors, rowNumber, `${year}-${String(month).padStart(2, '0')} ligger utenfor barnehage\u00e5ret ${schoolYear}/${schoolYear + 1}.`);
  }

  if (color && !VALID_YEARLY_CALENDAR_COLORS.includes(color)) {
    addError(
      errors,
      rowNumber,
      `Fargen "${color}" er ikke tillatt. Bruk en av: ${VALID_YEARLY_CALENDAR_COLORS.join(', ')}.`,
    );
  }

  if (entryType === 'day_event' || entryType === 'closed') {
    if (!date || !isDateInSchoolYear(date, schoolYear)) {
      addError(errors, rowNumber, `${entryType} krever dato i format YYYY-MM-DD innenfor barnehage\u00e5ret ${schoolYear}/${schoolYear + 1}.`);
    }

    const parsedDate = dateParts(date);
    if (
      parsedDate &&
      year !== null &&
      month !== null &&
      (parsedDate.year !== year || parsedDate.month !== month)
    ) {
      addError(errors, rowNumber, `Dato ${date} samsvarer ikke med ${FIELD_LABELS.year}/${FIELD_LABELS.month}.`);
    }
  }

  if (entryType === 'week_event' || entryType === 'food' || entryType === 'note') {
    if (weekNumber === null || weekNumber < 1 || weekNumber > 53) {
      addError(errors, rowNumber, `${entryType} krever uke_fra mellom 1 og 53.`);
    }
  }

  if (entryType === 'week_event' || entryType === 'note') {
    if (weekNumberEnd !== null && (weekNumberEnd < 1 || weekNumberEnd > 53)) {
      addError(errors, rowNumber, 'uke_til m\u00e5 v\u00e6re mellom 1 og 53.');
    }

    if (weekNumberEnd !== null && weekNumber !== null && weekNumberEnd <= weekNumber) {
      addError(errors, rowNumber, 'uke_til m\u00e5 v\u00e6re h\u00f8yere enn uke_fra.');
    }
  }

  if (errors.length > 0) {
    return { ok: false, rowNumber, errors };
  }

  return {
    ok: true,
    rowNumber,
    payload: canonicalPayload({
      schoolYear,
      year,
      month,
      entryType,
      title,
      description,
      color,
      weekNumber,
      weekNumberEnd,
      date,
      showOnHomepage,
      showForParents,
    }),
  };
}

function getEntryField(entry, field) {
  if (field === 'schoolYear') return entry.schoolYear ?? entry.school_year ?? null;
  if (field === 'entryType') return entry.entryType ?? entry.entry_type ?? null;
  if (field === 'weekNumber') return entry.weekNumber ?? entry.week_number ?? null;
  if (field === 'weekNumberEnd') return entry.weekNumberEnd ?? entry.week_number_end ?? null;
  if (field === 'showOnHomepage') return entry.showOnHomepage ?? entry.show_on_homepage ?? false;
  if (field === 'showForParents') return entry.showForParents ?? entry.show_for_parents ?? false;
  if (field === 'description' || field === 'color' || field === 'date') return entry[field] || null;
  return entry[field] ?? null;
}

export function diffYearlyCalendarEntry(existingEntry, payload) {
  const canonical = canonicalPayload(payload);
  const changes = [];

  for (const field of COMPARE_FIELDS) {
    const oldValue = getEntryField(existingEntry, field);
    const newValue = canonical[field] ?? null;

    if (oldValue !== newValue) {
      changes.push({
        field,
        label: FIELD_LABELS[field],
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

export function buildImportPreview({ schoolYear, existingEntries, rows }) {
  const entriesByTitle = new Map();

  for (const entry of existingEntries ?? []) {
    const entrySchoolYear = getEntryField(entry, 'schoolYear');
    if (entrySchoolYear !== null && entrySchoolYear !== schoolYear) continue;

    const normalizedTitle = normalizeYearlyCalendarTitle(entry.title);
    const entries = entriesByTitle.get(normalizedTitle) ?? [];
    entries.push(entry);
    entriesByTitle.set(normalizedTitle, entries);
  }

  const previewRows = (rows ?? []).map((row) => {
    const rowNumber = row.rowNumber;
    const validation = validateYearlyCalendarImportRow({ rowNumber, schoolYear, row });

    if (!validation.ok) {
      return {
        rowNumber,
        status: 'invalid',
        errors: validation.errors,
        original: row,
        defaultAction: 'ignore',
      };
    }

    const normalizedTitle = normalizeYearlyCalendarTitle(validation.payload.title);
    const matches = entriesByTitle.get(normalizedTitle) ?? [];

    if (matches.length === 0) {
      return {
        rowNumber,
        status: 'new',
        payload: validation.payload,
        original: row,
        defaultAction: 'create',
      };
    }

    if (matches.length > 1) {
      return {
        rowNumber,
        status: 'ambiguous',
        payload: validation.payload,
        matches,
        original: row,
        defaultAction: 'ignore',
      };
    }

    const changes = diffYearlyCalendarEntry(matches[0], validation.payload);
    if (changes.length === 0) {
      return {
        rowNumber,
        status: 'unchanged',
        payload: validation.payload,
        existing: matches[0],
        original: row,
        defaultAction: 'ignore',
      };
    }

    return {
      rowNumber,
      status: 'changed',
      payload: validation.payload,
      existing: matches[0],
      changes,
      original: row,
      defaultAction: 'ignore',
    };
  });

  const counts = { new: 0, unchanged: 0, changed: 0, invalid: 0, ambiguous: 0 };
  for (const row of previewRows) {
    counts[row.status] += 1;
  }

  return { schoolYear, rows: previewRows, counts };
}

export function validateImportDecision({ status, action }) {
  if (!DECISION_ACTIONS[status]?.includes(action)) {
    return {
      ok: false,
      error: `Action "${action}" is not allowed for status "${status}".`,
    };
  }

  return { ok: true };
}
