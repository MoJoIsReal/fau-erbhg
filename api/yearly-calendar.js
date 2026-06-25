import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeNumber,
} from './_shared/middleware.js';
import { YEARLY_CALENDAR_EDITORS } from '../shared/constants.js';
import {
  buildImportPreview,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';

const VALID_ENTRY_TYPES = ['week_event', 'day_event', 'food', 'note', 'closed'];
const VALID_COLOR_NAMES = ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple'];
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeColor(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (VALID_COLOR_NAMES.includes(trimmed)) return trimmed;
  if (HEX_RE.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function mapEntry(row) {
  return {
    id: row.id,
    schoolYear: row.school_year,
    year: row.year,
    month: row.month,
    entryType: row.entry_type,
    weekNumber: row.week_number,
    weekNumberEnd: row.week_number_end,
    weekdayStart: row.weekday_start,
    weekdayEnd: row.weekday_end,
    date: row.date,
    title: row.title,
    description: row.description,
    color: row.color,
    showOnHomepage: row.show_on_homepage ?? false,
    showForParents: row.show_for_parents ?? false,
    notifyNewsletter: row.notify_newsletter ?? false,
    newsletterSentAt: row.newsletter_sent_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeEntryPayload(body) {
  const entryType = VALID_ENTRY_TYPES.includes(body.entryType) ? body.entryType : null;
  const title = sanitizeText(body.title, 200);
  const description = body.description ? sanitizeText(body.description, 1000) : null;
  const color = sanitizeColor(body.color);
  const schoolYear = sanitizeNumber(body.schoolYear, 2020, 2100);
  const year = sanitizeNumber(body.year, 2020, 2100);
  const month = sanitizeNumber(body.month, 1, 12);
  const weekNumber = body.weekNumber != null ? sanitizeNumber(body.weekNumber, 1, 53) : null;
  const weekNumberEndRaw = body.weekNumberEnd != null ? sanitizeNumber(body.weekNumberEnd, 1, 53) : null;
  // Only keep end if greater than start (otherwise it's a single-week entry)
  const weekNumberEnd = weekNumberEndRaw != null && weekNumber != null && weekNumberEndRaw > weekNumber
    ? weekNumberEndRaw
    : null;
  const weekdayStart = body.weekdayStart != null ? sanitizeNumber(body.weekdayStart, 1, 7) : null;
  const weekdayEnd = body.weekdayEnd != null ? sanitizeNumber(body.weekdayEnd, 1, 7) : null;
  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  // Only day_event entries can be flagged for the homepage. Force false on
  // every other type so a stale flag can't survive a type change.
  const showOnHomepage = entryType === 'day_event' ? body.showOnHomepage === true : false;
  const showForParents = entryType === 'day_event' ? body.showForParents === true : false;
  // Only day_event entries have a concrete date the cron can key a reminder off.
  const notifyNewsletter = entryType === 'day_event' ? body.notifyNewsletter === true : false;

  return {
    entryType,
    title,
    description,
    color,
    schoolYear,
    year,
    month,
    weekNumber,
    weekNumberEnd,
    weekdayStart,
    weekdayEnd,
    date,
    showOnHomepage,
    showForParents,
    notifyNewsletter,
  };
}

function sanitizeInteger(value, min, max) {
  const num = sanitizeNumber(value, min, max);
  return Number.isInteger(num) ? num : null;
}

function normalizeImportRows(rows) {
  return rows.map((row, index) => {
    const rowNumber = sanitizeInteger(row?.rowNumber, 1, 100000) ?? index + 2;
    return { ...(row || {}), rowNumber };
  });
}

async function getEntriesForSchoolYear(sql, schoolYear) {
  const rows = await sql`
    SELECT id, school_year, year, month, entry_type, week_number, week_number_end,
           weekday_start, weekday_end, date, title, description, color,
           show_on_homepage, show_for_parents, notify_newsletter, newsletter_sent_at,
           created_by, created_at, updated_at
    FROM yearly_calendar_entries
    WHERE school_year = ${schoolYear}
    ORDER BY year ASC, month ASC, week_number ASC NULLS LAST
  `;
  return rows.map(mapEntry);
}

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      const schoolYear = parseInt(req.query.schoolYear);
      if (!schoolYear || isNaN(schoolYear)) {
        return res.status(400).json({ error: 'Valid schoolYear query parameter required' });
      }

      const entries = await getEntriesForSchoolYear(sql, schoolYear);
      return res.status(200).json(entries);
    }

    // All write methods require auth + a yearly-calendar-eligible role
    const user = await requireRole(req, res, YEARLY_CALENDAR_EDITORS, sql);
    if (!user) return;
    if (!requireCsrf(req, res)) return;

    if (req.method === 'POST') {
      if (req.query.action === 'preview-import') {
        const schoolYear = sanitizeInteger(req.body?.schoolYear, 2020, 2100);
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;

        if (!schoolYear) {
          return res.status(400).json({ error: 'Valid schoolYear is required' });
        }
        if (!rows) {
          return res.status(400).json({ error: 'Rows must be an array' });
        }
        if (rows.length > 500) {
          return res.status(400).json({ error: 'Import cannot contain more than 500 rows' });
        }

        const existingEntries = await getEntriesForSchoolYear(sql, schoolYear);
        const preview = buildImportPreview({
          schoolYear,
          existingEntries,
          rows: normalizeImportRows(rows),
        });
        return res.status(200).json(preview);
      }

      if (req.query.action === 'commit-import') {
        const schoolYear = sanitizeInteger(req.body?.schoolYear, 2020, 2100);
        const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : null;

        if (!schoolYear) {
          return res.status(400).json({ error: 'Valid schoolYear is required' });
        }
        if (!decisions) {
          return res.status(400).json({ error: 'Decisions must be an array' });
        }
        if (decisions.length > 500) {
          return res.status(400).json({ error: 'Import cannot contain more than 500 decisions' });
        }

        const existingEntries = await getEntriesForSchoolYear(sql, schoolYear);
        const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));
        const now = new Date().toISOString();
        const createdBy = user.name || user.username || 'ukjent';
        const summary = { created: [], updated: [], ignored: [], errors: [] };

        for (const [index, decision] of decisions.entries()) {
          const rowNumber = sanitizeInteger(decision?.rowNumber, 1, 100000) ?? index + 2;
          const status = sanitizeText(decision?.status, 20);
          const action = sanitizeText(decision?.action, 20);
          const existingId = decision?.existingId != null
            ? sanitizeInteger(decision.existingId, 1, 2147483647)
            : null;
          const decisionValidation = validateImportDecision({ status, action });
          if (!decisionValidation.ok) {
            summary.errors.push({ rowNumber, errors: [decisionValidation.error] });
            continue;
          }

          if (action === 'ignore') {
            summary.ignored.push({ rowNumber });
            continue;
          }

          const row = { ...(decision?.row || {}), rowNumber };
          const previewRow = buildImportPreview({
            schoolYear,
            existingEntries,
            rows: [row],
          }).rows[0];
          const validation = validateYearlyCalendarImportRow({ rowNumber, schoolYear, row });
          const serverDecisionValidation = validateImportDecision({
            status: previewRow?.status || status,
            action,
          });
          const errors = [];

          if (!serverDecisionValidation.ok) {
            errors.push(serverDecisionValidation.error);
          }
          if (!validation.ok) {
            errors.push(...validation.errors);
          }

          if (errors.length > 0) {
            summary.errors.push({ rowNumber, errors });
            continue;
          }

          const payload = validation.payload;

          if (action === 'update') {
            const matchedExistingId = previewRow?.status === 'changed' ? previewRow.existing?.id : null;

            if (!existingId || !existingById.has(existingId) || existingId !== matchedExistingId) {
              summary.errors.push({
                rowNumber,
                errors: ['Existing entry was not found for the selected school year.'],
              });
              continue;
            }

            try {
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
                  AND school_year = ${schoolYear}
                RETURNING *
              `;

              if (updated.length === 0) {
                summary.errors.push({
                  rowNumber,
                  errors: ['Existing entry was not found for the selected school year.'],
                });
              } else {
                summary.updated.push(mapEntry(updated[0]));
              }
            } catch (error) {
              summary.errors.push({
                rowNumber,
                errors: ['Failed to update row.'],
              });
            }
            continue;
          }

          if (action === 'create') {
            try {
              const created = await sql`
                INSERT INTO yearly_calendar_entries (
                  school_year, year, month, entry_type, week_number, week_number_end,
                  weekday_start, weekday_end, date, title, description, color,
                  show_on_homepage, show_for_parents, notify_newsletter, created_by, created_at, updated_at
                ) VALUES (
                  ${payload.schoolYear}, ${payload.year}, ${payload.month}, ${payload.entryType}, ${payload.weekNumber}, ${payload.weekNumberEnd},
                  ${null}, ${null}, ${payload.date}, ${payload.title}, ${payload.description}, ${payload.color},
                  ${payload.showOnHomepage}, ${payload.showForParents}, ${false}, ${createdBy}, ${now}, ${now}
                )
                RETURNING *
              `;
              summary.created.push(mapEntry(created[0]));
            } catch (error) {
              summary.errors.push({
                rowNumber,
                errors: ['Failed to create row.'],
              });
            }
          }
        }

        return res.status(200).json(summary);
      }

      const payload = sanitizeEntryPayload(req.body || {});
      if (!payload.entryType || !payload.title || !payload.schoolYear || !payload.year || !payload.month) {
        return res.status(400).json({
          error: 'entryType, title, schoolYear, year and month are required',
        });
      }
      const now = new Date().toISOString();
      const created = await sql`
        INSERT INTO yearly_calendar_entries (
          school_year, year, month, entry_type, week_number, week_number_end,
          weekday_start, weekday_end, date, title, description, color,
          show_on_homepage, show_for_parents, notify_newsletter, created_by, created_at, updated_at
        ) VALUES (
          ${payload.schoolYear}, ${payload.year}, ${payload.month}, ${payload.entryType}, ${payload.weekNumber}, ${payload.weekNumberEnd},
          ${payload.weekdayStart}, ${payload.weekdayEnd}, ${payload.date}, ${payload.title}, ${payload.description}, ${payload.color},
          ${payload.showOnHomepage}, ${payload.showForParents}, ${payload.notifyNewsletter}, ${user.name || user.username || 'ukjent'}, ${now}, ${now}
        )
        RETURNING *
      `;
      return res.status(201).json(mapEntry(created[0]));
    }

    if (req.method === 'PUT') {
      const id = parseInt(req.query.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Valid id query parameter required' });
      }
      const payload = sanitizeEntryPayload(req.body || {});
      if (!payload.entryType || !payload.title) {
        return res.status(400).json({ error: 'entryType and title are required' });
      }
      const now = new Date().toISOString();
      const updated = await sql`
        UPDATE yearly_calendar_entries
        SET school_year = ${payload.schoolYear},
            year = ${payload.year},
            month = ${payload.month},
            entry_type = ${payload.entryType},
            week_number = ${payload.weekNumber},
            week_number_end = ${payload.weekNumberEnd},
            weekday_start = ${payload.weekdayStart},
            weekday_end = ${payload.weekdayEnd},
            date = ${payload.date},
            title = ${payload.title},
            description = ${payload.description},
            color = ${payload.color},
            show_on_homepage = ${payload.showOnHomepage},
            show_for_parents = ${payload.showForParents},
            notify_newsletter = ${payload.notifyNewsletter},
            updated_at = ${now}
        WHERE id = ${id}
        RETURNING *
      `;
      if (updated.length === 0) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      return res.status(200).json(mapEntry(updated[0]));
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id);
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: 'Valid id query parameter required' });
      }
      const deleted = await sql`
        DELETE FROM yearly_calendar_entries WHERE id = ${id} RETURNING id
      `;
      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Entry not found' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
