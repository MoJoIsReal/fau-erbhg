import type { YearlyCalendarEntry } from "@shared/schema";
import {
  VALID_YEARLY_CALENDAR_COLORS,
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  YEARLY_CALENDAR_HEX_COLOR_PATTERN,
  type YearlyCalendarRawImportRow,
} from "@shared/yearly-calendar-utils";
import type { SheetData as ReadSheetData } from "read-excel-file/browser";
import type { Cell, Feature, SheetData as WriteSheetData } from "write-excel-file/browser";

type SpreadsheetValue = string | number | boolean | Date | null;
type WriteFileContent = File | Blob | ArrayBuffer;

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

const COLOR_GUIDE = `${VALID_YEARLY_CALENDAR_COLORS.join(", ")} eller eksisterende hex-farge som #3b82f6 / or an existing hex colour such as #3b82f6`;
const TEMPLATE_VALIDATION_MIN_ROWS = 500;

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

  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
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

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function listValidationXml({ range, values }: { range: string; values: readonly string[] }) {
  const csv = values.join(",");
  return [
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${escapeXmlAttribute(range)}">`,
    `<formula1>"${escapeXmlText(csv)}"</formula1>`,
    "</dataValidation>",
  ].join("");
}

function buildDataValidationsXml(rowCount: number) {
  const lastRow = Math.max(TEMPLATE_VALIDATION_MIN_ROWS + 1, rowCount + 1);
  const booleanValues = ["true", "false"];
  const validations = [
    listValidationXml({ range: `A2:A${lastRow}`, values: VALID_YEARLY_CALENDAR_ENTRY_TYPES }),
    listValidationXml({ range: `I2:I${lastRow}`, values: VALID_YEARLY_CALENDAR_COLORS }),
    listValidationXml({ range: `J2:J${lastRow}`, values: booleanValues }),
    listValidationXml({ range: `K2:K${lastRow}`, values: booleanValues }),
  ];

  return `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`;
}

function findWorksheetAppendixIndex(xml: string) {
  const candidateIndexes = ["<pageMargins", "<pageSetup", "<headerFooter", "<drawing"]
    .map((tag) => xml.indexOf(tag))
    .filter((index) => index >= 0);

  if (candidateIndexes.length > 0) return Math.min(...candidateIndexes);
  return xml.indexOf("</worksheet>");
}

function yearlyCalendarDataValidationFeature(rowCount: number): Feature<WriteFileContent> {
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform(xml, sheetOptions) {
            if (sheetOptions.sheet !== "Oppføringer") return xml;

            const dataValidationsXml = buildDataValidationsXml(rowCount);
            const insertBefore = findWorksheetAppendixIndex(xml);
            if (insertBefore >= 0) {
              return `${xml.slice(0, insertBefore)}${dataValidationsXml}${xml.slice(insertBefore)}`;
            }

            return xml;
          },
        },
      },
    },
  };
}

function buildGuideSheetData(schoolYear: number): WriteSheetData {
  return [
    [boldCell("Årskalender Excel-mal / Yearly calendar Excel template")],
    [],
    [boldCell("Barnehageår / Kindergarten year"), `${schoolYear}/${schoolYear + 1}`],
    [],
    [boldCell("Gyldige entry_type-verdier / Valid entry_type values")],
    ["week_event", textCell("Aktivitet eller periode som ligger på uke, eventuelt ukeintervall. / Activity or period tied to a week, optionally a week range.")],
    ["day_event", textCell("Hendelse på én bestemt dato. Kan vises på forsiden. / Event on one specific date. Can be shown on the front page.")],
    ["food", textCell("Ukens varmmat. Bruk uke_fra. / Weekly hot meal. Use uke_fra.")],
    ["closed", textCell("Barnehagen er stengt. Krever dato. / Kindergarten is closed. Requires dato.")],
    ["note", textCell("Merknad knyttet til uke, eventuelt ukeintervall. / Note tied to a week, optionally a week range.")],
    [],
    [boldCell("Gyldige farger / Valid colours"), textCell(COLOR_GUIDE)],
    [boldCell("Hex-format / Hex format"), YEARLY_CALENDAR_HEX_COLOR_PATTERN],
    [],
    [boldCell("Datoformat / Date format"), "YYYY-MM-DD"],
    [boldCell("Boolean-format / Boolean format"), "true/false, ja/nei, yes/no eller/or 1/0"],
    [],
    [boldCell("Påkrevde felt / Required fields")],
    ["day_event", "entry_type, tittel, dato, år, måned"],
    ["closed", "entry_type, tittel, dato, år, måned"],
    ["week_event", "entry_type, tittel, år, måned, uke_fra"],
    ["food", "entry_type, tittel, år, måned, uke_fra"],
    ["note", "entry_type, tittel, år, måned, uke_fra"],
    [],
    [boldCell("Tillatte verdier / Allowed values")],
    ["entry_type", VALID_YEARLY_CALENDAR_ENTRY_TYPES.join(", ")],
    ["farge / color", COLOR_GUIDE],
    ["vis_på_forside / for_foreldre", "true, false, ja, nei, yes, no, 1, 0"],
    [],
    [
      boldCell("Merk / Note"),
      textCell(
        "Dropdowns/data validation are intentionally omitted for dependency hygiene. Use the allowed values listed in this sheet. / Nedtrekkslister er utelatt for å holde Excel-støtten lett. Bruk verdiene som er listet her.",
      ),
    ],
    [],
    [boldCell("Eksempler / Examples")],
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
  ], {
    features: [yearlyCalendarDataValidationFeature(opts.entries.length)],
  });
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
