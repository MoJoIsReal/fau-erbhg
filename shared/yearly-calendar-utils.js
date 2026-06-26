export const VALID_YEARLY_CALENDAR_ENTRY_TYPES = ['week_event', 'day_event', 'food', 'closed', 'note'];
export const VALID_YEARLY_CALENDAR_COLORS = ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];
export const YEARLY_CALENDAR_HEX_COLOR_PATTERN = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$';

const HEX_COLOR_RE = new RegExp(YEARLY_CALENDAR_HEX_COLOR_PATTERN);

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

function readAliasEntry(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      return { found: true, alias, value: row[alias] };
    }
  }
  return { found: false, alias: aliases[0], value: undefined };
}

function readAlias(row, aliases) {
  return readAliasEntry(row, aliases).value;
}

function readText(row, aliases) {
  const value = readAlias(row, aliases);
  return String(value ?? '').trim();
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
  const { found, alias, value } = readAliasEntry(row, aliases);
  if (!found || value === null || value === undefined) return { ok: true, value: false };
  if (value === true || value === false) return { ok: true, value };
  if (typeof value === 'number') {
    if (value === 1) return { ok: true, value: true };
    if (value === 0) return { ok: true, value: false };
    return { ok: false, alias, value };
  }
  if (typeof value !== 'string') return { ok: false, alias, value };

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: false };

  const normalized = trimmed.toLocaleLowerCase('nb-NO');
  if (['true', '1', 'ja', 'yes'].includes(normalized)) return { ok: true, value: true };
  if (['false', '0', 'nei', 'no'].includes(normalized)) return { ok: true, value: false };
  return { ok: false, alias, value };
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
  if (!value) return null;
  return HEX_COLOR_RE.test(value) ? value.toLowerCase() : value;
}

export function isValidYearlyCalendarColor(value) {
  return (
    value === '' ||
    value === null ||
    value === undefined ||
    VALID_YEARLY_CALENDAR_COLORS.includes(value) ||
    HEX_COLOR_RE.test(value)
  );
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

  const entryType = readText(source, ['entry_type', 'entryType']);
  const title = readText(source, ['tittel', 'title']);
  const date = readText(source, ['dato', 'date']);
  const year = readInteger(source, [YEAR_COLUMN, 'year']);
  const month = readInteger(source, [MONTH_COLUMN, 'month']);
  const weekNumber = readInteger(source, ['uke_fra', 'weekNumber']);
  const weekNumberEnd = readInteger(source, ['uke_til', 'weekNumberEnd']);
  const description = readText(source, ['beskrivelse', 'description']);
  const colorInput = readText(source, ['farge', 'color']);
  const color = normalizeColor(colorInput);
  const showOnHomepage = readBoolean(source, [HOMEPAGE_COLUMN, 'showOnHomepage']);
  const showForParents = readBoolean(source, ['for_foreldre', 'showForParents']);

  if (!title) {
    addError(errors, rowNumber, 'Mangler tittel.');
  }

  if (title.length > 200) {
    addError(errors, rowNumber, 'Tittel kan maksimalt v\u00e6re 200 tegn.');
  }

  if (description.length > 1000) {
    addError(errors, rowNumber, 'Beskrivelse kan maksimalt v\u00e6re 1000 tegn.');
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

  if (!isValidYearlyCalendarColor(colorInput)) {
    addError(
      errors,
      rowNumber,
      `Fargen "${colorInput}" er ikke tillatt. Bruk en av: ${VALID_YEARLY_CALENDAR_COLORS.join(', ')} eller en eksisterende hex-farge som #3b82f6.`,
    );
  }

  if (!showOnHomepage.ok) {
    addError(errors, rowNumber, `${showOnHomepage.alias} m\u00e5 v\u00e6re true/false, ja/nei, yes/no eller 1/0.`);
  }

  if (!showForParents.ok) {
    addError(errors, rowNumber, `${showForParents.alias} m\u00e5 v\u00e6re true/false, ja/nei, yes/no eller 1/0.`);
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
      showOnHomepage: showOnHomepage.value,
      showForParents: showForParents.value,
    }),
  };
}

function getEntryField(entry, field) {
  if (field === 'id') return entry.id ?? null;
  if (field === 'schoolYear') return entry.schoolYear ?? entry.school_year ?? null;
  if (field === 'entryType') return entry.entryType ?? entry.entry_type ?? null;
  if (field === 'weekNumber') return entry.weekNumber ?? entry.week_number ?? null;
  if (field === 'weekNumberEnd') return entry.weekNumberEnd ?? entry.week_number_end ?? null;
  if (field === 'weekdayStart') return entry.weekdayStart ?? entry.weekday_start ?? null;
  if (field === 'weekdayEnd') return entry.weekdayEnd ?? entry.weekday_end ?? null;
  if (field === 'showOnHomepage') return entry.showOnHomepage ?? entry.show_on_homepage ?? false;
  if (field === 'showForParents') return entry.showForParents ?? entry.show_for_parents ?? false;
  if (field === 'notifyNewsletter') return entry.notifyNewsletter ?? entry.notify_newsletter ?? false;
  if (field === 'newsletterSentAt') return entry.newsletterSentAt ?? entry.newsletter_sent_at ?? null;
  if (field === 'createdBy') return entry.createdBy ?? entry.created_by ?? null;
  if (field === 'createdAt') return entry.createdAt ?? entry.created_at ?? null;
  if (field === 'updatedAt') return entry.updatedAt ?? entry.updated_at ?? null;
  if (field === 'description' || field === 'color' || field === 'date') return entry[field] || null;
  return entry[field] ?? null;
}

function normalizeExistingEntry(entry) {
  return {
    id: getEntryField(entry, 'id'),
    schoolYear: getEntryField(entry, 'schoolYear'),
    year: getEntryField(entry, 'year'),
    month: getEntryField(entry, 'month'),
    entryType: getEntryField(entry, 'entryType'),
    weekNumber: getEntryField(entry, 'weekNumber'),
    weekNumberEnd: getEntryField(entry, 'weekNumberEnd'),
    weekdayStart: getEntryField(entry, 'weekdayStart'),
    weekdayEnd: getEntryField(entry, 'weekdayEnd'),
    date: getEntryField(entry, 'date'),
    title: getEntryField(entry, 'title'),
    description: getEntryField(entry, 'description'),
    color: getEntryField(entry, 'color'),
    showOnHomepage: getEntryField(entry, 'showOnHomepage'),
    showForParents: getEntryField(entry, 'showForParents'),
    notifyNewsletter: getEntryField(entry, 'notifyNewsletter'),
    newsletterSentAt: getEntryField(entry, 'newsletterSentAt'),
    createdBy: getEntryField(entry, 'createdBy'),
    createdAt: getEntryField(entry, 'createdAt'),
    updatedAt: getEntryField(entry, 'updatedAt'),
  };
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

    const normalizedEntry = normalizeExistingEntry(entry);
    const normalizedTitle = normalizeYearlyCalendarTitle(normalizedEntry.title);
    const entries = entriesByTitle.get(normalizedTitle) ?? [];
    entries.push(normalizedEntry);
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
