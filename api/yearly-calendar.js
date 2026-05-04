import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText,
  sanitizeNumber,
} from './_shared/middleware.js';
import { generateYearlyPdf, pdfFilename } from './_shared/yearly-pdf.js';

const VALID_ENTRY_TYPES = ['week_event', 'day_event', 'food', 'note'];
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
  };
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

      const rows = await sql`
        SELECT id, school_year, year, month, entry_type, week_number, week_number_end,
               weekday_start, weekday_end, date, title, description, color,
               created_by, created_at, updated_at
        FROM yearly_calendar_entries
        WHERE school_year = ${schoolYear}
        ORDER BY year ASC, month ASC, week_number ASC NULLS LAST
      `;
      const entries = rows.map(mapEntry);

      // PDF download path. Uses Puppeteer + headless Chromium to render a
      // landscape A4 PDF — bypasses iOS Safari's broken @page handling so
      // users get a consistent, properly-paginated file regardless of
      // device.
      if (req.query.format === 'pdf') {
        const lang = req.query.lang === 'en' ? 'en' : 'no';
        const yearParam = req.query.year != null ? parseInt(req.query.year) : null;
        const monthParam = req.query.month != null ? parseInt(req.query.month) : null;
        const year = Number.isFinite(yearParam) ? yearParam : undefined;
        const month = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
          ? monthParam
          : undefined;

        let pdf;
        try {
          pdf = await generateYearlyPdf({ entries, schoolYear, lang, year, month });
        } catch (pdfErr) {
          // Re-throw with extra context so handleError logs the underlying
          // chromium / puppeteer message (the generic outer "API Error" line
          // gets truncated in Vercel's log table view, which makes
          // debugging hard).
          console.error('PDF generation failed:', pdfErr?.message);
          if (pdfErr?.stack) console.error('PDF generation stack:', pdfErr.stack);
          throw pdfErr;
        }
        const filename = pdfFilename({ schoolYear, year, month, lang });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).send(pdf);
      }

      return res.status(200).json(entries);
    }

    // All write methods require auth + a yearly-calendar-eligible role
    const user = parseAuthToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (user.role !== 'admin' && user.role !== 'member' && user.role !== 'staff') {
      return res.status(403).json({ error: 'Yearly calendar editor access required' });
    }
    if (!requireCsrf(req, res)) return;

    if (req.method === 'POST') {
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
          created_by, created_at, updated_at
        ) VALUES (
          ${payload.schoolYear}, ${payload.year}, ${payload.month}, ${payload.entryType}, ${payload.weekNumber}, ${payload.weekNumberEnd},
          ${payload.weekdayStart}, ${payload.weekdayEnd}, ${payload.date}, ${payload.title}, ${payload.description}, ${payload.color},
          ${user.name || user.username || 'ukjent'}, ${now}, ${now}
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
