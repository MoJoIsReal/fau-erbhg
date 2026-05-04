// Server-side PDF generation for the yearly calendar.
//
// Renders a print-optimised HTML document with Puppeteer + headless
// Chromium and returns a landscape A4 PDF buffer. Used by both the Vercel
// serverless function (api/yearly-calendar.js) and the local dev server
// (server/routes.ts).
//
// Why server-side instead of window.print()? iOS Safari ignores
// `@page { size: landscape }` and produces broken portrait pages with
// awkward splits. Generating a real PDF eliminates the platform-specific
// print quirks: the file always renders identically, in landscape, with
// proper page breaks.

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// URL of the prebuilt chromium binary that matches the version of
// @sparticuz/chromium-min in package.json. We use the "min" variant
// (which doesn't ship the binary inside the package) so the Vercel
// function bundle stays small and we don't depend on Vercel's NFT
// tracer picking up the binary file — instead, chromium-min downloads
// the tarball from the GitHub release at first launch and caches it in
// /tmp. Cold start on first call: +1-2s for the download. Bump this
// URL whenever you bump @sparticuz/chromium-min in package.json.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

// ──────────────────────────────────────────────────────────────────
// Calendar helpers (ported from client/src/pages/yearly-calendar.tsx)
// ──────────────────────────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const ENTRY_COLOR_HEX = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#a855f7',
};

const DEFAULT_TYPE_COLOR = {
  food: '#fb923c',
  week_event: '#ef4444',
  day_event: '#22c55e',
  note: '#e5e5e5',
};

function readableTextOn(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

function entryColorStyle(entry) {
  // Hex override (set per-entry via colour picker)
  if (entry.color && HEX_RE.test(entry.color)) {
    return { background: entry.color, color: readableTextOn(entry.color) };
  }
  // Named colour (red/yellow/green/blue/orange/pink/purple)
  if (entry.color && ENTRY_COLOR_HEX[entry.color]) {
    const bg = ENTRY_COLOR_HEX[entry.color];
    return { background: bg, color: readableTextOn(bg) };
  }
  // Default by entry type
  const bg = DEFAULT_TYPE_COLOR[entry.entryType] ?? '#e5e5e5';
  return { background: bg, color: readableTextOn(bg) };
}

function entryEndWeek(entry) {
  return entry.weekNumberEnd && entry.weekNumberEnd > (entry.weekNumber ?? 0)
    ? entry.weekNumberEnd
    : (entry.weekNumber ?? 0);
}

// "single" | "start" | "middle" | "end" | null — see yearly-calendar.tsx
function spanPosition(entry, weekNumber) {
  const start = entry.weekNumber ?? 0;
  const end = entryEndWeek(entry);
  if (weekNumber < start || weekNumber > end) return null;
  if (start === end) return 'single';
  if (weekNumber === start) return 'start';
  if (weekNumber === end) return 'end';
  return 'middle';
}

function sortByTypeAndColor(entries) {
  return [...entries].sort((a, b) => {
    const aFood = a.entryType === 'food' ? 0 : 1;
    const bFood = b.entryType === 'food' ? 0 : 1;
    if (aFood !== bFood) return aFood - bFood;
    const aColor = a.color ?? '';
    const bColor = b.color ?? '';
    if (aColor !== bColor) return aColor.localeCompare(bColor);
    return a.id - b.id;
  });
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function monthsForSchoolYear(schoolYear) {
  const out = [];
  for (let m = 8; m <= 12; m++) out.push({ year: schoolYear, month: m });
  for (let m = 1; m <= 7; m++) out.push({ year: schoolYear + 1, month: m });
  return out;
}

function weeksOfMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - dayOfWeek);

  const weeks = [];
  while (true) {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(cursor);
      days.push({ date: d, inMonth: d.getMonth() + 1 === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 2);
    weeks.push({ weekNumber: isoWeek(days[0].date), days });
    if (days[4].date >= last) break;
  }
  return weeks.filter((w) => w.days.some((d) => d.inMonth));
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Per-month palette: gradient stops + accent. Mirrors monthTheme() in the
// React page but as concrete colours so we don't depend on Tailwind here.
function monthTheme(month) {
  switch (month) {
    case 8:  return { from: '#4A8C5F', via: '#5fa370', to: '#FFD27A', icon: '🦋' };
    case 9:  return { from: '#4A8C5F', via: '#6f9b54', to: '#E18B3B', icon: '🍂' };
    case 10: return { from: '#5d6f24', via: '#8a5b1c', to: '#D9572C', icon: '🍁' };
    case 11: return { from: '#4A5C3F', via: '#6b5436', to: '#a04e2a', icon: '🍃' };
    case 12: return { from: '#1f4f3a', via: '#2C5F41', to: '#7A2424', icon: '⭐' };
    case 1:  return { from: '#3b6f8f', via: '#5a8aab', to: '#b9d6e4', icon: '❄️' };
    case 2:  return { from: '#3b6f8f', via: '#6691ab', to: '#dfecf3', icon: '⛄' };
    case 3:  return { from: '#4A8C5F', via: '#7eb37d', to: '#d4e3c0', icon: '🌱' };
    case 4:  return { from: '#4A8C5F', via: '#8bc18a', to: '#f5b8b8', icon: '🌸' };
    case 5:  return { from: '#4A8C5F', via: '#8bc18a', to: '#FFB347', icon: '🌷' };
    case 6:  return { from: '#4A8C5F', via: '#9CCB6E', to: '#FFD45E', icon: '☀️' };
    case 7:  return { from: '#4A8C5F', via: '#FFB347', to: '#FFD45E', icon: '🌞' };
    default: return { from: '#4A8C5F', via: '#4A8C5F', to: '#2C5F41', icon: '' };
  }
}

// ──────────────────────────────────────────────────────────────────
// i18n (PDF only ever runs server-side, so we keep a small static map
// rather than importing the full client translations file).
// ──────────────────────────────────────────────────────────────────

const I18N = {
  no: {
    title: 'Årskalender',
    tagline: 'Kunsten å være sammen i lekens magiske verden',
    notes: 'Notater',
    week: 'UKE',
    weekdays: ['MAN', 'TIR', 'ONS', 'TOR', 'FRE'],
    months: [
      'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
    ],
  },
  en: {
    title: 'Yearly calendar',
    tagline: 'The art of being together in play',
    notes: 'Notes',
    week: 'WK',
    weekdays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
  },
};

// ──────────────────────────────────────────────────────────────────
// HTML rendering
// ──────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBadge(entry, position) {
  const { background, color } = entryColorStyle(entry);
  const left = position === 'middle' || position === 'end';
  const right = position === 'start' || position === 'middle';
  const food = entry.entryType === 'food';
  return (
    `<span class="badge" style="background:${background};color:${color}">` +
    (left ? '<span class="chev">‹</span>' : '') +
    (food ? '<span class="utensil">🍴</span>' : '') +
    `<span>${escapeHtml(entry.title)}</span>` +
    (right ? '<span class="chev">›</span>' : '') +
    '</span>'
  );
}

function renderWeekRow(week, monthEntries, t) {
  const days = week.days
    .map((d, idx) => `
      <div class="day${d.inMonth ? '' : ' out-of-month'}">
        <div class="day-head">
          <span class="day-label">${escapeHtml(t.weekdays[idx])}</span>
          <span class="day-num">${d.date.getDate()}</span>
        </div>
        ${renderDayEvents(d, monthEntries)}
      </div>
    `)
    .join('');

  const weekLevelEntries = sortByTypeAndColor(
    monthEntries.filter((e) => {
      if (spanPosition(e, week.weekNumber) === null) return false;
      if (e.entryType === 'week_event' || e.entryType === 'food') return true;
      if (e.entryType === 'note' && e.weekNumber != null) return true;
      return false;
    })
  );
  const badges = weekLevelEntries
    .map((e) => renderBadge(e, spanPosition(e, week.weekNumber)))
    .join('');

  const dFirst = week.days[0].date;
  const dLast = week.days[4].date;
  const range = `${dFirst.getDate()}.${dFirst.getMonth() + 1}–${dLast.getDate()}.${dLast.getMonth() + 1}`;

  return `
    <div class="week-card">
      <div class="week-header">
        <div class="week-meta">
          <span class="week-num">${week.weekNumber}</span>
          <span class="week-label">${escapeHtml(t.week)}</span>
        </div>
        <div class="week-badges">${badges}</div>
        <div class="week-range">${range}</div>
      </div>
      <div class="week-days">${days}</div>
    </div>
  `;
}

function renderDayEvents(day, monthEntries) {
  const dateStr = toIsoDate(day.date);
  const dayEntries = sortByTypeAndColor(
    monthEntries.filter((e) => e.entryType === 'day_event' && e.date === dateStr)
  );
  if (dayEntries.length === 0) return '';
  const events = dayEntries
    .map((e) => {
      const { background, color } = entryColorStyle(e);
      return `<span class="day-event" style="background:${background};color:${color}">${escapeHtml(e.title)}</span>`;
    })
    .join('');
  return `<div class="day-events">${events}</div>`;
}

function renderMonth(year, month, entries, lang) {
  const monthEntries = entries.filter((e) => e.year === year && e.month === month);
  const weeks = weeksOfMonth(year, month);
  const noteEntries = sortByTypeAndColor(
    monthEntries.filter((e) => e.entryType === 'note' && e.weekNumber == null)
  );
  const t = I18N[lang] || I18N.no;
  const theme = monthTheme(month);
  const monthName = t.months[month - 1];

  const notesHtml = noteEntries.length === 0
    ? `<li class="empty">—</li>`
    : noteEntries
        .map((n) => `
          <li>
            <div class="note-title">${escapeHtml(n.title)}</div>
            ${n.description ? `<div class="note-desc">${escapeHtml(n.description)}</div>` : ''}
          </li>
        `)
        .join('');

  const weeksHtml = weeks.map((w) => renderWeekRow(w, monthEntries, t)).join('');

  return `
    <section class="month">
      <header class="month-header" style="background: linear-gradient(135deg, ${theme.from}, ${theme.via}, ${theme.to})">
        <h1>
          <span class="icon">${theme.icon}</span>
          ${monthName.toUpperCase()} ${year}
        </h1>
        <p class="month-tagline">${escapeHtml(t.tagline)}</p>
      </header>
      <div class="month-body">
        <aside class="notes">
          <h2>📝 ${escapeHtml(t.notes)}</h2>
          <ul>${notesHtml}</ul>
        </aside>
        <div class="weeks">${weeksHtml}</div>
      </div>
    </section>
  `;
}

function renderHtml({ entries, schoolYear, lang, year, month }) {
  const t = I18N[lang] || I18N.no;
  const allMonths = monthsForSchoolYear(schoolYear);
  const months = year != null && month != null
    ? allMonths.filter((m) => m.year === year && m.month === month)
    : allMonths;

  const sections = months.map(({ year: y, month: m }) => renderMonth(y, m, entries, lang)).join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(t.title)} ${schoolYear}/${schoolYear + 1}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }

  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: white; color: #111; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 8.5pt;
    line-height: 1.25;
  }

  /* Each month section starts on a fresh page (except the first). */
  .month {
    page-break-before: always;
    break-before: page;
    border-radius: 3mm;
    overflow: hidden;
    border: 0.4mm solid rgba(0, 0, 0, 0.08);
    background: #2C5F41;
    color: white;
  }
  .month:first-child {
    page-break-before: auto;
    break-before: auto;
  }

  /* Header glued to first week so it never splits across pages. */
  .month-header {
    padding: 4mm 6mm;
    color: white;
    page-break-after: avoid;
    break-after: avoid;
  }
  .month-header h1 {
    margin: 0;
    font-size: 18pt;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #FF6B35;
    text-shadow: 0 0.5mm 0.8mm rgba(0,0,0,0.25);
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 2mm;
  }
  .month-header h1 .icon { font-size: 16pt; }
  .month-tagline {
    margin: 1mm 0 0 0;
    font-style: italic;
    font-size: 8.5pt;
    color: #FFF6CC;
  }

  .month-body {
    display: grid;
    grid-template-columns: 50mm 1fr;
  }

  /* Notater sidebar */
  .notes {
    background: #FFF1F2;
    color: #1f2937;
    padding: 3mm 4mm;
    border-right: 0.3mm solid rgba(74, 140, 95, 0.4);
  }
  .notes h2 {
    margin: 0 0 2mm 0;
    font-size: 10pt;
    color: #2C5F41;
    font-weight: 700;
  }
  .notes ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 8pt;
  }
  .notes li {
    background: white;
    border-radius: 1.5mm;
    padding: 1.5mm 2mm;
    margin-bottom: 1.5mm;
    box-shadow: 0 0.2mm 0.5mm rgba(0,0,0,0.06);
  }
  .notes li.empty {
    background: transparent;
    box-shadow: none;
    padding: 0;
    color: #6b7280;
    font-style: italic;
  }
  .note-title { font-weight: 600; }
  .note-desc { font-size: 7.5pt; color: #4b5563; margin-top: 0.5mm; }

  /* Weeks column */
  .weeks { padding: 2mm; }

  .week-card {
    background: #1f4530;
    border: 0.2mm solid rgba(255, 255, 255, 0.1);
    border-radius: 2mm;
    margin-bottom: 1.5mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .week-header {
    padding: 1.5mm 2mm 1mm 2mm;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    column-gap: 2mm;
    row-gap: 1mm;
  }
  .week-meta { display: flex; align-items: baseline; gap: 1mm; }
  .week-num {
    color: #FFE66B;
    font-weight: 800;
    font-size: 13pt;
    line-height: 1;
  }
  .week-label {
    font-size: 7pt;
    color: rgba(255, 246, 204, 0.75);
    letter-spacing: 0.05em;
  }
  .week-range {
    font-size: 7pt;
    color: rgba(255, 246, 204, 0.65);
    text-align: right;
  }
  .week-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 1mm;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5mm;
    padding: 0.6mm 1.5mm;
    border-radius: 5mm;
    font-size: 7pt;
    font-weight: 600;
    line-height: 1.2;
  }
  .badge .chev { font-weight: 700; }
  .badge .utensil { font-size: 6.5pt; }

  .week-days {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: rgba(44, 95, 65, 0.4);
    border-top: 0.2mm solid rgba(255, 255, 255, 0.05);
  }
  .day {
    padding: 1.5mm;
    border-right: 0.2mm solid rgba(255, 255, 255, 0.05);
    min-height: 8mm;
  }
  .day:last-child { border-right: none; }
  .day.out-of-month { opacity: 0.35; }
  .day-head { display: flex; align-items: baseline; gap: 1mm; }
  .day-label {
    font-size: 6.5pt;
    color: rgba(255, 246, 204, 0.65);
    letter-spacing: 0.05em;
  }
  .day-num {
    font-size: 9pt;
    font-weight: 700;
    color: #FFE66B;
  }
  .day-events {
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
    margin-top: 0.8mm;
  }
  .day-event {
    display: block;
    padding: 0.5mm 1mm;
    border-radius: 1mm;
    font-size: 6.5pt;
    line-height: 1.2;
  }
</style>
</head>
<body>
${sections}
</body>
</html>`;
}

// ──────────────────────────────────────────────────────────────────
// Puppeteer launch + render
// ──────────────────────────────────────────────────────────────────

// Launch Chromium. On Vercel/Lambda we have chromium-min download the
// prebuilt binary from GitHub releases (cached in /tmp after first
// call). Locally, set PUPPETEER_EXECUTABLE_PATH to your system Chrome
// to skip the download — otherwise we fall back to chromium-min too,
// which is fine but adds a one-time download on dev start.
async function launchBrowser() {
  const localExec = process.env.PUPPETEER_EXECUTABLE_PATH;
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: chromium.headless,
    });
  }

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
    executablePath: localExec || (await chromium.executablePath(CHROMIUM_PACK_URL)),
  });
}

/**
 * Generate a landscape A4 PDF for the yearly calendar.
 *
 * @param {object} opts
 * @param {Array}  opts.entries     All yearly_calendar_entries for the school year
 * @param {number} opts.schoolYear  The school year start (e.g. 2025 for 2025/2026)
 * @param {'no'|'en'} [opts.lang='no']
 * @param {number} [opts.year]      Optional: only render this calendar year
 * @param {number} [opts.month]     Optional: only render this month (1-12)
 * @returns {Promise<Buffer>}
 */
export async function generateYearlyPdf({ entries, schoolYear, lang = 'no', year, month }) {
  const html = renderHtml({ entries, schoolYear, lang, year, month });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
      preferCSSPageSize: true,
    });
    return pdf;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

/** Build the Content-Disposition filename. */
export function pdfFilename({ schoolYear, year, month, lang = 'no' }) {
  if (year != null && month != null) {
    const t = I18N[lang] || I18N.no;
    const monthName = t.months[month - 1].toLowerCase();
    return `arskalender-${monthName}-${year}.pdf`;
  }
  return `arskalender-${schoolYear}-${schoolYear + 1}.pdf`;
}
