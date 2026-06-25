import type { YearlyCalendarEntry } from "@shared/schema";
import {
  VALID_YEARLY_CALENDAR_COLORS,
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  type YearlyCalendarRawImportRow,
} from "@shared/yearly-calendar-utils";
import type { SheetData as ReadSheetData } from "read-excel-file/browser";
import type { Cell, SheetData as WriteSheetData } from "write-excel-file/browser";

type SpreadsheetValue = string | number | boolean | Date | null;

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

type EntryHeader = (typeof ENTRY_HEADERS)[number];

function entryToRow(entry: YearlyCalendarEntry): Record<EntryHeader, SpreadsheetValue> {
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

function boldCell(value: SpreadsheetValue): Cell {
  return { value: value ?? "", fontWeight: "bold" };
}

function textCell(value: SpreadsheetValue): Cell {
  return { value: value ?? "", wrap: true };
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

function buildEntrySheetData(entries: YearlyCalendarEntry[]): WriteSheetData {
  return [
    ENTRY_HEADERS.map((header) => boldCell(header)),
    ...entries.map((entry) => {
      const row = entryToRow(entry);
      return ENTRY_HEADERS.map((header) => row[header]);
    }),
  ];
}

function buildGuideSheetData(schoolYear: number): WriteSheetData {
  return [
    [boldCell("Årskalender Excel-mal")],
    [],
    [boldCell("Barnehageår"), `${schoolYear}/${schoolYear + 1}`],
    [],
    [boldCell("Gyldige entry_type-verdier")],
    ["week_event", textCell("Aktivitet eller periode som ligger på uke, eventuelt ukeintervall.")],
    ["day_event", textCell("Hendelse på én bestemt dato. Kan vises på forsiden.")],
    ["food", textCell("Ukens varmmat. Bruk uke_fra.")],
    ["closed", textCell("Barnehagen er stengt. Krever dato.")],
    ["note", textCell("Merknad knyttet til uke, eventuelt ukeintervall.")],
    [],
    [boldCell("Gyldige farger"), VALID_YEARLY_CALENDAR_COLORS.join(", ")],
    [],
    [boldCell("Datoformat"), "YYYY-MM-DD"],
    [boldCell("Boolean-format"), "true eller false"],
    [],
    [boldCell("Påkrevde felt")],
    ["day_event", "entry_type, tittel, dato, år, måned"],
    ["closed", "entry_type, tittel, dato, år, måned"],
    ["week_event", "entry_type, tittel, år, måned, uke_fra"],
    ["food", "entry_type, tittel, år, måned, uke_fra"],
    ["note", "entry_type, tittel, år, måned, uke_fra"],
    [],
    [boldCell("Tillatte verdier")],
    ["entry_type", VALID_YEARLY_CALENDAR_ENTRY_TYPES.join(", ")],
    ["farge", VALID_YEARLY_CALENDAR_COLORS.join(", ")],
    ["vis_på_forside / for_foreldre", "true, false"],
    [],
    [
      boldCell("Merk"),
      textCell(
        "Dropdowns/data validation are intentionally omitted for dependency hygiene. Use the allowed values listed in this sheet.",
      ),
    ],
    [],
    [boldCell("Eksempler")],
    ENTRY_HEADERS.map((header) => boldCell(header)),
    ["day_event", "Sommerfest", "2028-06-04", 2028, 6, "", "", "Sommerfest for familier", "green", true, true],
    ["closed", "Planleggingsdag", "2027-11-10", 2027, 11, "", "", "", "red", false, false],
    ["week_event", "Brannvernuke", "", 2027, 9, 38, "", "", "orange", false, false],
  ];
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function downloadYearlyCalendarTemplate(opts: {
  schoolYear: number;
  entries: YearlyCalendarEntry[];
}) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbook = writeXlsxFile([
    {
      sheet: "Oppføringer",
      data: buildEntrySheetData(opts.entries),
      stickyRowsCount: 1,
      columns: ENTRY_HEADERS.map(() => ({ width: 18 })),
    },
    {
      sheet: "Veiledning",
      data: buildGuideSheetData(opts.schoolYear),
      columns: [{ width: 28 }, { width: 90 }],
    },
  ]);
  const blob = await workbook.toBlob();

  downloadBlob(blob, `arskalender-mal-${opts.schoolYear}-${opts.schoolYear + 1}.xlsx`);
}

export async function parseYearlyCalendarWorkbook(file: File): Promise<YearlyCalendarRawImportRow[]> {
  const { readSheet } = await import("read-excel-file/browser");
  let sheetData: ReadSheetData;

  try {
    sheetData = await readSheet(file, "Oppføringer");
  } catch {
    sheetData = await readSheet(file);
  }

  const headerRow = sheetData[0] ?? [];
  const headerByColumn = new Map<number, string>();
  headerRow.forEach((value, index) => {
    const header = normalizeCellValue(value).toString().trim();
    if (header) headerByColumn.set(index, header);
  });

  const rows: YearlyCalendarRawImportRow[] = [];
  sheetData.slice(1).forEach((row, rowIndex) => {
    const out: YearlyCalendarRawImportRow = { rowNumber: rowIndex + 2 };
    let hasValue = false;

    row.forEach((cellValue, colNumber) => {
      const header = headerByColumn.get(colNumber);
      if (!header) return;

      const value = normalizeCellValue(cellValue);
      if (value !== "") hasValue = true;
      (out as Record<string, unknown>)[header] = value;
    });

    if (hasValue) rows.push(out);
  });

  return rows;
}
