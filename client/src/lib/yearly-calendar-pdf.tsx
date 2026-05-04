// Client-side PDF generator for the Årskalender.
//
// Uses @react-pdf/renderer to build a real landscape A4 PDF in the
// browser. The PDF is downloaded as a Blob — bypasses iOS Safari's
// broken @page handling and Vercel's serverless chromium quirks that
// blocked the previous server-rendered approach.
//
// This module is dynamic-import'd from yearly-calendar.tsx so the
// ~600 KB gzipped @react-pdf bundle only loads when the user clicks
// "Last ned PDF".

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { YearlyCalendarEntry } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────
// Helpers (mirrors client/src/pages/yearly-calendar.tsx so the PDF
// looks like the on-screen calendar).
// ──────────────────────────────────────────────────────────────────

// Badge colour is determined entirely by entry type so the PDF looks the
// same in every month. Mirror of colorClassForType in
// client/src/pages/yearly-calendar.tsx — keep them in sync.
// Mat=gul, Uke info=blå, Stengt (note)=rød, Dags events=grønn.
const TYPE_COLOR: Record<string, { background: string; color: string }> = {
  food:       { background: "#fde047", color: "#1f2937" },
  week_event: { background: "#3b82f6", color: "#ffffff" },
  day_event:  { background: "#22c55e", color: "#ffffff" },
  note:       { background: "#ef4444", color: "#ffffff" },
};

function entryColors(entry: YearlyCalendarEntry): { background: string; color: string } {
  return TYPE_COLOR[entry.entryType] ?? TYPE_COLOR.note;
}

function entryEndWeek(entry: YearlyCalendarEntry): number {
  return entry.weekNumberEnd && entry.weekNumberEnd > (entry.weekNumber ?? 0)
    ? entry.weekNumberEnd
    : (entry.weekNumber ?? 0);
}

type SpanPos = "single" | "start" | "middle" | "end" | null;

function spanPosition(entry: YearlyCalendarEntry, weekNumber: number): SpanPos {
  const start = entry.weekNumber ?? 0;
  const end = entryEndWeek(entry);
  if (weekNumber < start || weekNumber > end) return null;
  if (start === end) return "single";
  if (weekNumber === start) return "start";
  if (weekNumber === end) return "end";
  return "middle";
}

function sortByTypeAndColor(entries: YearlyCalendarEntry[]): YearlyCalendarEntry[] {
  return [...entries].sort((a, b) => {
    const aFood = a.entryType === "food" ? 0 : 1;
    const bFood = b.entryType === "food" ? 0 : 1;
    if (aFood !== bFood) return aFood - bFood;
    const aColor = a.color ?? "";
    const bColor = b.color ?? "";
    if (aColor !== bColor) return aColor.localeCompare(bColor);
    return a.id - b.id;
  });
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function monthsForSchoolYear(schoolYear: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let m = 8; m <= 12; m++) out.push({ year: schoolYear, month: m });
  for (let m = 1; m <= 7; m++) out.push({ year: schoolYear + 1, month: m });
  return out;
}

type DayCell = { date: Date; inMonth: boolean };

function weeksOfMonth(year: number, month: number): { weekNumber: number; days: DayCell[] }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - dayOfWeek);

  const weeks: { weekNumber: number; days: DayCell[] }[] = [];
  while (true) {
    const days: DayCell[] = [];
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

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Per-month accent colour. We don't try to do a full gradient header
// since @react-pdf doesn't support CSS gradients natively; a single
// accent shade per month gives the calendar a seasonal feel without
// rasterising a background image.
function monthAccent(month: number): string {
  switch (month) {
    case 8:  return "#FFD27A"; // August — sommer
    case 9:  return "#E18B3B"; // September — tidlig høst
    case 10: return "#D9572C"; // Oktober
    case 11: return "#a04e2a"; // November
    case 12: return "#7A2424"; // Desember
    case 1:  return "#5a8aab"; // Januar
    case 2:  return "#6691ab"; // Februar
    case 3:  return "#7eb37d"; // Mars
    case 4:  return "#8bc18a"; // April
    case 5:  return "#FFB347"; // Mai
    case 6:  return "#FFD45E"; // Juni
    case 7:  return "#FFB347"; // Juli
    default: return "#4A8C5F";
  }
}

// ──────────────────────────────────────────────────────────────────
// i18n strings used in the PDF (NO + EN). Kept inline so this module
// stays self-contained when dynamic-imported.
// ──────────────────────────────────────────────────────────────────

type Lang = "no" | "en";

const STRINGS: Record<Lang, {
  tagline: string;
  notes: string;
  week: string;
  weekdays: string[];
  months: string[];
  emptyNotes: string;
}> = {
  no: {
    tagline: "Kunsten å være sammen i lekens magiske verden",
    notes: "Notater",
    week: "UKE",
    weekdays: ["MAN", "TIR", "ONS", "TOR", "FRE"],
    months: [
      "Januar", "Februar", "Mars", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Desember",
    ],
    emptyNotes: "—",
  },
  en: {
    tagline: "The art of being together in play",
    notes: "Notes",
    week: "WK",
    weekdays: ["MON", "TUE", "WED", "THU", "FRI"],
    months: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    emptyNotes: "—",
  },
};

// Use Twemoji for emojis. @react-pdf can fetch each emoji as a PNG
// from Twitter's CDN at render time. Without this, emojis would
// render as empty boxes (Helvetica has no emoji glyphs). Format
// `png` is the most compatible across emoji ranges.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/",
});

// ──────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#2C5F41",
    color: "white",
    padding: 0,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "column",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#FF6B35",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerTagline: {
    fontSize: 8,
    fontStyle: "italic",
    color: "#FFF6CC",
    marginTop: 2,
  },
  headerAccentBar: {
    height: 3,
    width: "100%",
  },
  body: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  notes: {
    width: 130,
    backgroundColor: "#FFF1F2",
    color: "#1f2937",
    padding: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  notesTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#2C5F41",
    marginBottom: 4,
  },
  notesItem: {
    backgroundColor: "white",
    borderRadius: 2,
    padding: 3,
    marginBottom: 3,
  },
  notesItemTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
  },
  notesItemDesc: {
    fontSize: 7,
    color: "#4b5563",
    marginTop: 1,
  },
  notesEmpty: {
    fontStyle: "italic",
    color: "#6b7280",
    fontSize: 8,
  },
  weeksColumn: {
    flex: 1,
    flexDirection: "column",
  },
  weekCard: {
    backgroundColor: "#1f4530",
    borderRadius: 3,
    marginBottom: 3,
    overflow: "hidden",
  },
  weekHeader: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  weekNum: {
    color: "#FFE66B",
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginRight: 3,
  },
  weekLabel: {
    fontSize: 6.5,
    color: "rgba(255, 246, 204, 0.75)",
    marginRight: 6,
    letterSpacing: 0.5,
  },
  weekBadgesContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 3,
    rowGap: 2,
  },
  weekRange: {
    fontSize: 6.5,
    color: "rgba(255, 246, 204, 0.65)",
    marginLeft: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    fontSize: 7,
  },
  badgeText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  weekDays: {
    flexDirection: "row",
    backgroundColor: "rgba(44, 95, 65, 0.45)",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  day: {
    flex: 1,
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: "rgba(255, 255, 255, 0.06)",
    minHeight: 28,
  },
  dayLast: {
    borderRightWidth: 0,
  },
  dayHead: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  dayLabel: {
    fontSize: 6,
    color: "rgba(255, 246, 204, 0.65)",
    marginRight: 3,
    letterSpacing: 0.4,
  },
  dayNum: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#FFE66B",
  },
  dayOutOfMonth: {
    opacity: 0.35,
  },
  dayEvent: {
    paddingHorizontal: 2.5,
    paddingVertical: 1,
    borderRadius: 1.5,
    marginTop: 1.5,
    fontSize: 6.5,
  },
});

// ──────────────────────────────────────────────────────────────────
// PDF components
// ──────────────────────────────────────────────────────────────────

function Badge({
  entry,
  position,
}: {
  entry: YearlyCalendarEntry;
  position: SpanPos;
}) {
  const { background, color } = entryColors(entry);
  const left = position === "middle" || position === "end";
  const right = position === "start" || position === "middle";
  const isFood = entry.entryType === "food";
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color }]}>
        {left ? "‹ " : ""}
        {isFood ? "🍴 " : ""}
        {entry.title}
        {right ? " ›" : ""}
      </Text>
    </View>
  );
}

function Week({
  week,
  monthEntries,
  weekdayLabels,
  weekLabel,
}: {
  week: { weekNumber: number; days: DayCell[] };
  monthEntries: YearlyCalendarEntry[];
  weekdayLabels: string[];
  weekLabel: string;
}) {
  const weekLevel = sortByTypeAndColor(
    monthEntries.filter((e) => {
      if (spanPosition(e, week.weekNumber) === null) return false;
      if (e.entryType === "week_event" || e.entryType === "food") return true;
      if (e.entryType === "note" && e.weekNumber != null) return true;
      return false;
    }),
  );
  const dFirst = week.days[0].date;
  const dLast = week.days[4].date;
  const range = `${dFirst.getDate()}.${dFirst.getMonth() + 1}–${dLast.getDate()}.${dLast.getMonth() + 1}`;

  return (
    <View style={styles.weekCard} wrap={false}>
      <View style={styles.weekHeader}>
        <Text style={styles.weekNum}>{week.weekNumber}</Text>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <View style={styles.weekBadgesContainer}>
          {weekLevel.map((entry) => (
            <Badge
              key={entry.id}
              entry={entry}
              position={spanPosition(entry, week.weekNumber)}
            />
          ))}
        </View>
        <Text style={styles.weekRange}>{range}</Text>
      </View>
      <View style={styles.weekDays}>
        {week.days.map((d, idx) => {
          const dateStr = toIsoDate(d.date);
          const dayEntries = sortByTypeAndColor(
            monthEntries.filter(
              (e) => e.entryType === "day_event" && e.date === dateStr,
            ),
          );
          const isLast = idx === week.days.length - 1;
          return (
            <View
              key={dateStr}
              style={[
                styles.day,
                isLast ? styles.dayLast : {},
                d.inMonth ? {} : styles.dayOutOfMonth,
              ]}
            >
              <View style={styles.dayHead}>
                <Text style={styles.dayLabel}>{weekdayLabels[idx]}</Text>
                <Text style={styles.dayNum}>{d.date.getDate()}</Text>
              </View>
              {dayEntries.map((entry) => {
                const { background, color } = entryColors(entry);
                return (
                  <View
                    key={entry.id}
                    style={[styles.dayEvent, { backgroundColor: background }]}
                  >
                    <Text style={{ fontSize: 6.5, color }}>{entry.title}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Month({
  year,
  month,
  entries,
  lang,
}: {
  year: number;
  month: number;
  entries: YearlyCalendarEntry[];
  lang: Lang;
}) {
  const t = STRINGS[lang];
  const monthEntries = entries.filter((e) => e.year === year && e.month === month);
  const weeks = weeksOfMonth(year, month);
  const noteEntries = sortByTypeAndColor(
    monthEntries.filter((e) => e.entryType === "note" && e.weekNumber == null),
  );
  const accent = monthAccent(month);
  const monthName = t.months[month - 1].toUpperCase();

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={[styles.headerAccentBar, { backgroundColor: accent }]} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {`${monthName} ${year}`}
          </Text>
          <Text style={styles.headerTagline}>{t.tagline}</Text>
        </View>
      </View>
      <View style={[styles.headerAccentBar, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.notes}>
          <Text style={styles.notesTitle}>{t.notes}</Text>
          {noteEntries.length === 0 ? (
            <Text style={styles.notesEmpty}>{t.emptyNotes}</Text>
          ) : (
            noteEntries.map((n) => (
              <View key={n.id} style={styles.notesItem}>
                <Text style={styles.notesItemTitle}>{n.title}</Text>
                {n.description ? (
                  <Text style={styles.notesItemDesc}>{n.description}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
        <View style={styles.weeksColumn}>
          {weeks.map((w) => (
            <Week
              key={w.weekNumber}
              week={w}
              monthEntries={monthEntries}
              weekdayLabels={t.weekdays}
              weekLabel={t.week}
            />
          ))}
        </View>
      </View>
    </Page>
  );
}

function YearlyCalendarDocument({
  entries,
  schoolYear,
  lang,
  year,
  month,
}: {
  entries: YearlyCalendarEntry[];
  schoolYear: number;
  lang: Lang;
  year?: number;
  month?: number;
}) {
  const allMonths = monthsForSchoolYear(schoolYear);
  const months = year != null && month != null
    ? allMonths.filter((m) => m.year === year && m.month === month)
    : allMonths;

  return (
    <Document
      title={`Årskalender ${schoolYear}/${schoolYear + 1}`}
      author="FAU Erdal Barnehage"
    >
      {months.map((m) => (
        <Month
          key={`${m.year}-${m.month}`}
          year={m.year}
          month={m.month}
          entries={entries}
          lang={lang}
        />
      ))}
    </Document>
  );
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

function pdfFilename(opts: {
  schoolYear: number;
  year?: number;
  month?: number;
  lang: Lang;
}): string {
  if (opts.year != null && opts.month != null) {
    const monthName = STRINGS[opts.lang].months[opts.month - 1].toLowerCase();
    return `arskalender-${monthName}-${opts.year}.pdf`;
  }
  return `arskalender-${opts.schoolYear}-${opts.schoolYear + 1}.pdf`;
}

/**
 * Generate a yearly calendar PDF in the browser and trigger a download.
 *
 * Returns nothing — completes when the file has been handed off to
 * the browser's download mechanism. Throws on failure (callers should
 * surface the error via toast).
 */
export async function downloadYearlyCalendarPdf(opts: {
  entries: YearlyCalendarEntry[];
  schoolYear: number;
  lang: Lang;
  year?: number;
  month?: number;
}): Promise<void> {
  const blob = await pdf(
    <YearlyCalendarDocument
      entries={opts.entries}
      schoolYear={opts.schoolYear}
      lang={opts.lang}
      year={opts.year}
      month={opts.month}
    />,
  ).toBlob();
  const filename = pdfFilename(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
