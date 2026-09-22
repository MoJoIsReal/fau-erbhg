// A landscape A4 calendar using the same category model, typeface and design
// tokens as the website. Loaded only when a reader requests a PDF.
import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Event, YearlyCalendarEntry } from "@shared/schema";
import type { CalendarEntry, CalendarDisplayKind } from "@shared/calendar-entries";
import { normalizeEvent, normalizeYearlyEntry, isoWeekYear, compareSpanningEntries } from "@shared/calendar-entries";
import { monthsForSchoolYear, weeksOfMonth, toCalendarIsoDate } from "@shared/yearly-calendar-display";
import { yearlyCalendarEntryOverlapsMonth } from "@shared/yearly-calendar-placement";
import { formatDate, useTranslation as translationFor, type Language } from "@/lib/i18n";
import { printToken, printPoints } from "@/lib/calendar-pdf-theme";

Font.register({ family: "Manrope", fonts: [
  { src: "/fonts/manrope-regular.ttf", fontWeight: 400 },
  { src: "/fonts/manrope-semibold.ttf", fontWeight: 600 },
  { src: "/fonts/manrope-bold.ttf", fontWeight: 700 },
] });
Font.registerHyphenationCallback((word) => [word]);
Font.registerEmojiSource({ format: "png", url: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/" });

const color = {
  ink: printToken("color-ink"), text: printToken("color-text"), muted: printToken("color-text-muted"),
  primary: printToken("color-primary"), border: printToken("color-border"),
  white: printToken("color-surface-raised"),
  soft: printToken("color-surface-soft"), green: printToken("color-green-50"),
  outside: printToken("color-calendar-outside"), sand: printToken("color-sand"),
};
const space = (step: number) => printPoints(`space-${step}`);
const PAGE_MARGIN = space(8);
const MAX_DAY_ENTRIES = 3;
const MAX_WEEK_ENTRIES = 4;
const TITLE_LIMIT = 72;

const styles = StyleSheet.create({
  page: { fontFamily: "Manrope", fontSize: 9, color: color.text, backgroundColor: color.white,
    paddingTop: 100, paddingBottom: 32, paddingHorizontal: PAGE_MARGIN },
  header: { position: "absolute", top: space(6), left: PAGE_MARGIN, right: PAGE_MARGIN,
    backgroundColor: color.green, borderRadius: printPoints("radius-md"), padding: space(3),
    flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, lineHeight: 1.1, fontWeight: 700, color: color.ink },
  tagline: { fontSize: 8, lineHeight: 1.2, marginTop: space(1), color: color.text },
  identity: { maxWidth: 220, textAlign: "right", fontSize: 8, color: color.primary, lineHeight: 1.5 },
  weekdayHeader: { position: "absolute", top: 77, left: PAGE_MARGIN, right: PAGE_MARGIN,
    flexDirection: "row", paddingVertical: space(2), borderBottomWidth: 0.75, borderBottomColor: color.border },
  weekday: { flex: 1, textAlign: "left", paddingLeft: space(2), fontSize: 8, fontWeight: 600, color: color.muted },
  railLabel: { width: 32, fontSize: 7.5, color: color.muted, textAlign: "center" },
  week: { borderWidth: 0.75, borderColor: color.border, borderRadius: printPoints("radius-sm"),
    overflow: "hidden", marginBottom: space(1) },
  weekTop: { flexDirection: "row", backgroundColor: color.soft, alignItems: "center", minHeight: 22 },
  weekNumber: { width: 32, paddingVertical: space(1), textAlign: "center", fontSize: 11, fontWeight: 700, color: color.primary },
  weekInfo: { flex: 1, paddingHorizontal: space(2), paddingVertical: space(1), flexDirection: "row", flexWrap: "wrap", gap: space(1) },
  band: { maxWidth: "100%", flexDirection: "row", alignItems: "center", borderRadius: printPoints("radius-sm"),
    paddingHorizontal: space(2), paddingVertical: space(1) },
  bandText: { fontSize: 8, lineHeight: 1.35 },
  weekRange: { fontSize: 8, color: color.muted },
  days: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: color.border },
  rail: { width: 32, backgroundColor: color.soft, borderRightWidth: 0.75, borderRightColor: color.border },
  day: { flex: 1, minWidth: 0, minHeight: 38, padding: space(1), borderRightWidth: 0.75, borderRightColor: color.border },
  dayNumber: { fontSize: 10, fontWeight: 600, color: color.ink, marginBottom: space(1) },
  entry: { marginTop: space(1), paddingLeft: space(1), borderLeftWidth: 2 },
  entryTitle: { fontSize: 8.5, lineHeight: 1.3, color: color.ink },
  more: { fontSize: 7.5, color: color.primary, marginTop: space(1), lineHeight: 1.3 },
  notes: { marginTop: space(2), padding: space(2), backgroundColor: color.sand,
    borderRadius: printPoints("radius-sm") },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: color.ink, marginBottom: space(2) },
  noteTitle: { fontSize: 9, fontWeight: 600, color: color.ink },
  noteBody: { fontSize: 8.5, lineHeight: 1.4, marginTop: space(1) },
  detail: { paddingVertical: space(2), borderBottomWidth: 0.75, borderBottomColor: color.border },
  detailMeta: { fontSize: 8, color: color.muted, marginBottom: space(1) },
  footer: { position: "absolute", left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 14,
    flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: color.muted },
});

function category(kind: CalendarDisplayKind, lang: Language) {
  const t = translationFor(lang);
  return {
    label: kind === "stengt" ? t.yearlyCalendar.closedBadge : { ...t.calendar.kinds, ...t.entryEditor.categories }[kind],
    dot: printToken(`cat-${kind}-dot`), text: printToken(`cat-${kind}-text`), tint: printToken(`cat-${kind}-tint`),
  };
}

function compactTitle(title: string) {
  return title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : title;
}

function entryTime(entry: CalendarEntry) {
  return entry.startTime ? `${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ""}` : "";
}

function PrintEntry({ entry, lang, full = false }: { entry: CalendarEntry; lang: Language; full?: boolean }) {
  const kind = category(entry.displayKind, lang);
  return (
    <View style={[styles.entry, { borderLeftColor: kind.dot }]}>
      <Text style={[styles.entryTitle, entry.cancelled ? { textDecoration: "line-through" } : {}]}>
        <Text style={{ fontSize: 7.5, color: kind.text }}>{kind.label}{entry.cancelled ? ` · ${translationFor(lang).events.cancelled2}` : ""} · </Text>
        {entryTime(entry) ? `${entryTime(entry)} ` : ""}{full ? entry.title : compactTitle(entry.title)}
      </Text>
    </View>
  );
}

function Month({ year, month, entries, lang, schoolYear, notes }: {
  year: number; month: number; entries: CalendarEntry[]; lang: Language; schoolYear: number; notes: YearlyCalendarEntry[];
}) {
  const t = translationFor(lang);
  const weeks = weeksOfMonth(year, month);
  const monthName = formatDate(new Date(year, month - 1, 1), lang, { month: "long", year: "numeric" });
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const overflow = new Map<string, CalendarEntry>();
  const rows = weeks.map((week) => {
    const weekYear = isoWeekYear(week.days[0].date);
    const bands = entries.filter((entry) => !entry.date && entry.weekYear === weekYear &&
      entry.week <= week.weekNumber && entry.weekEnd >= week.weekNumber).sort(compareSpanningEntries);
    bands.forEach((entry, index) => { if (index >= MAX_WEEK_ENTRIES || entry.title.length > TITLE_LIMIT) overflow.set(entry.id, entry); });
    const days = week.days.map((day) => {
      const dayEntries = entries.filter((entry) => entry.date === toCalendarIsoDate(day.date));
      dayEntries.forEach((entry, index) => { if (index >= MAX_DAY_ENTRIES || entry.title.length > TITLE_LIMIT) overflow.set(entry.id, entry); });
      return { ...day, entries: dayEntries };
    });
    return { week, bands, days };
  });
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.header} fixed>
        <View><Text style={styles.title}>{title}</Text><Text style={styles.tagline}>{t.calendar.tagline}</Text></View>
        <View style={styles.identity}>
          <Text style={{ fontWeight: 700 }}>{t.header.title}</Text>
          <Text>{t.yearlyCalendar.schoolYearLabel} {schoolYear}/{schoolYear + 1}</Text>
        </View>
      </View>
      <View style={styles.weekdayHeader} fixed>
        <Text style={styles.railLabel}>{t.calendar.week}</Text>
        {weeks[0].days.map((day) => <Text key={day.date.getDay()} style={styles.weekday}>
          {formatDate(day.date, lang, { weekday: "short" })}
        </Text>)}
      </View>
      {rows.map(({ week, bands, days }) => (
        <View key={week.weekNumber} style={styles.week} wrap={false}>
          <View style={styles.weekTop}>
            <Text style={styles.weekNumber}>{week.weekNumber}</Text>
            <View style={styles.weekInfo}>
              {bands.length === 0 && <Text style={styles.weekRange}>
                {formatDate(days[0].date, lang, { day: "numeric", month: "short" })} – {formatDate(days[6].date, lang, { day: "numeric", month: "short" })}
              </Text>}
              {bands.slice(0, MAX_WEEK_ENTRIES).map((entry) => {
                const kind = category(entry.displayKind, lang);
                return <View key={entry.id} style={[styles.band, { backgroundColor: kind.tint }]}>
                  <Text style={[styles.bandText, { color: kind.text }]}>
                    {kind.label}: <Text style={{ fontWeight: 600 }}>{compactTitle(entry.title)}</Text>
                    {entry.weekEnd > entry.week ? ` · ${t.calendar.week} ${entry.week}–${entry.weekEnd}` : ""}
                    {entry.weekdayStart && entry.weekdayEnd ? ` · ${formatDate(week.days[entry.weekdayStart - 1].date, lang, { weekday: "short" })}–${formatDate(week.days[entry.weekdayEnd - 1].date, lang, { weekday: "short" })}` : ""}
                  </Text>
                </View>;
              })}
              {bands.length > MAX_WEEK_ENTRIES && <Text style={styles.more}>+{bands.length - MAX_WEEK_ENTRIES} {t.events.more} · {t.calendarWorkspace.pdfDetails}</Text>}
            </View>
          </View>
          <View style={styles.days}>
            <View style={styles.rail} />
            {days.map((day, index) => <View key={toCalendarIsoDate(day.date)} style={[styles.day,
              !day.inMonth ? { backgroundColor: color.outside } : day.isWeekend ? { backgroundColor: color.soft } : {},
              index === 6 ? { borderRightWidth: 0 } : {},
            ]}>
              <Text style={[styles.dayNumber, !day.inMonth ? { color: color.muted } : {}]}>{day.date.getDate()}</Text>
              {day.entries.slice(0, MAX_DAY_ENTRIES).map((entry) => <PrintEntry key={entry.id} entry={entry} lang={lang} />)}
              {day.entries.length > MAX_DAY_ENTRIES && <Text style={styles.more}>+{day.entries.length - MAX_DAY_ENTRIES} {t.events.more} · {t.calendarWorkspace.pdfDetails}</Text>}
            </View>)}
          </View>
        </View>
      ))}
      {notes.map((note, index) => <View key={note.id} style={styles.notes} wrap={false}>
        {index === 0 && <Text style={styles.sectionTitle}>{t.yearlyCalendar.notes}</Text>}
        <Text style={styles.noteTitle}>{note.title}</Text>
        {note.description && <Text style={styles.noteBody}>{note.description}</Text>}
      </View>)}
      {overflow.size > 0 && <View style={{ marginTop: space(2) }}>
        <Text style={styles.sectionTitle} minPresenceAhead={45}>{t.calendarWorkspace.pdfDetails}</Text>
        <Text style={styles.noteBody}>{t.calendarWorkspace.pdfDetailsHint}</Text>
        {Array.from(overflow.values()).map((entry) => <View key={entry.id} style={styles.detail} wrap={false}>
          <Text style={styles.detailMeta}>{entry.date
            ? formatDate(`${entry.date}T12:00:00`, lang, { weekday: "long", day: "numeric", month: "long" })
            : `${t.calendar.week} ${entry.week}${entry.weekEnd > entry.week ? `–${entry.weekEnd}` : ""}`}</Text>
          <PrintEntry entry={entry} lang={lang} full />
        </View>)}
      </View>}
      <View style={styles.footer} fixed>
        <Text>{t.header.title} · {t.calendarWorkspace.pdfPrintEdition}</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

function YearlyCalendarDocument({ entries, events, schoolYear, lang, year, month }: {
  entries: YearlyCalendarEntry[]; events: Event[]; schoolYear: number; lang: Language; year?: number; month?: number;
}) {
  const t = translationFor(lang);
  const months = monthsForSchoolYear(schoolYear).filter((item) => year == null || month == null || (item.year === year && item.month === month));
  // Keep every raw entry in print, including a day entry alongside a signup event.
  const normalized = [...entries.map(normalizeYearlyEntry), ...events.map((event) => normalizeEvent(event))]
    .filter((entry): entry is CalendarEntry => entry !== null)
    .sort((a, b) => a.sortKey - b.sortKey || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return <Document title={`${t.calendar.title} ${schoolYear}/${schoolYear + 1}`} author={t.header.title} language={lang}>
    {months.map((item) => <Month key={`${item.year}-${item.month}`} {...item} entries={normalized} lang={lang} schoolYear={schoolYear}
      notes={entries.filter((entry) => entry.entryType === "note" && entry.weekNumber == null && yearlyCalendarEntryOverlapsMonth(entry, item.year, item.month))} />)}
  </Document>;
}

export async function downloadYearlyCalendarPdf(opts: {
  entries: YearlyCalendarEntry[]; events?: Event[]; schoolYear: number; lang: Language; year?: number; month?: number;
}): Promise<void> {
  const blob = await pdf(<YearlyCalendarDocument {...opts} events={opts.events ?? []} />).toBlob();
  const monthName = opts.month ? formatDate(new Date(opts.year ?? opts.schoolYear, opts.month - 1, 1), opts.lang, { month: "long" }).toLowerCase() : "";
  const filename = opts.year != null && opts.month != null
    ? `arskalender-${monthName}-${opts.year}.pdf` : `arskalender-${opts.schoolYear}-${opts.schoolYear + 1}.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
