import { useEffect, useId, useMemo, useState } from "react";
import { Eye, FileSpreadsheet, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import type { Language, useTranslation } from "@/lib/i18n";
import type {
  ImportDecisionAction,
  ImportPreview,
  ImportPreviewRow,
  ImportPreviewStatus,
  YearlyCalendarEntryType,
  YearlyCalendarImportPayload,
} from "@shared/yearly-calendar-utils";

type Translation = ReturnType<typeof useTranslation>;
type ValidationMessageKey = keyof Translation["yearlyCalendar"]["importModal"]["validation"];

interface YearlyCalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: number;
}

type ImportSummary = {
  created: unknown[];
  updated: unknown[];
  ignored: Array<{ rowNumber: number }>;
  errors: Array<{ rowNumber: number; errors: string[] }>;
};

type Decision = {
  schoolYear: number;
  decisions: Array<{
    rowNumber: number;
    status: ImportPreviewStatus;
    action: ImportDecisionAction;
    row: ImportPreviewRow["original"];
    existingId: number | null;
  }>;
};

const STATUS_ORDER: ImportPreviewStatus[] = ["new", "changed", "ambiguous", "invalid", "unchanged"];

const ENTRY_TYPE_LABEL_KEYS: Record<YearlyCalendarEntryType, keyof Translation["yearlyCalendar"]["entryTypes"]> = {
  week_event: "weekEvent",
  day_event: "dayEvent",
  food: "food",
  closed: "closed",
  note: "note",
};

function rowKey(row: ImportPreviewRow, index: number) {
  return `${row.rowNumber}-${index}`;
}

function hasPayload(row: ImportPreviewRow): row is Extract<ImportPreviewRow, { payload: YearlyCalendarImportPayload }> {
  return "payload" in row;
}

function titleValue(value: unknown): string | null {
  const title = String(value ?? "").trim();
  return title || null;
}

function originalTitleFor(row: ImportPreviewRow): string | null {
  const exactTitle = titleValue(row.original.tittel) ?? titleValue(row.original.title);
  if (exactTitle) return exactTitle;

  for (const [key, value] of Object.entries(row.original)) {
    const normalizedKey = key.trim().toLocaleLowerCase("nb-NO");
    if (normalizedKey === "tittel" || normalizedKey === "title") {
      const title = titleValue(value);
      if (title) return title;
    }
  }

  return null;
}

function availableActions(row: ImportPreviewRow): ImportDecisionAction[] {
  if (row.status === "new" || row.status === "ambiguous") return ["create", "ignore"];
  if (row.status === "changed") return ["update", "create", "ignore"];
  return ["ignore"];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function existingIdFor(row: ImportPreviewRow): number | null {
  if (row.status === "changed" || row.status === "unchanged") return row.existing.id;
  return null;
}

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function entryTypeLabelFor(t: Translation, entryType: unknown) {
  if (typeof entryType === "string" && entryType in ENTRY_TYPE_LABEL_KEYS) {
    return t.yearlyCalendar.entryTypes[ENTRY_TYPE_LABEL_KEYS[entryType as YearlyCalendarEntryType]];
  }
  return formatValue(entryType);
}

function fieldAliasLabel(alias: string, t: Translation) {
  const fields = t.yearlyCalendar.importModal.fields;
  const fieldByAlias: Record<string, string> = {
    "år": fields.year,
    year: fields.year,
    "måned": fields.month,
    month: fields.month,
    entry_type: fields.entryType,
    entryType: fields.entryType,
    tittel: fields.title,
    title: fields.title,
    beskrivelse: fields.description,
    description: fields.description,
    farge: fields.color,
    color: fields.color,
    uke_fra: fields.weekNumber,
    weekNumber: fields.weekNumber,
    uke_til: fields.weekNumberEnd,
    weekNumberEnd: fields.weekNumberEnd,
    dato: fields.date,
    date: fields.date,
    "vis_på_forside": fields.showOnHomepage,
    showOnHomepage: fields.showOnHomepage,
    for_foreldre: fields.showForParents,
    showForParents: fields.showForParents,
  };
  return fieldByAlias[alias] ?? alias;
}

function colorLabelFor(t: Translation, color: string) {
  const colors = t.yearlyCalendar.colors as Record<string, string>;
  return colors[color] ?? color;
}

function allowedEntryTypesLabel(t: Translation, allowed: string) {
  return allowed.split(",").map((entryType) => entryTypeLabelFor(t, entryType.trim())).join(", ");
}

function allowedColorsLabel(t: Translation, allowed: string) {
  return allowed.split(",").map((color) => colorLabelFor(t, color.trim())).join(", ");
}

function validationValueLabel(t: Translation, value: string) {
  return value === "(tom)" ? t.yearlyCalendar.importModal.emptyValue : value;
}

function validationMessage(
  t: Translation,
  key: ValidationMessageKey,
  values: Record<string, string>,
) {
  return interpolate(t.yearlyCalendar.importModal.validation[key], values);
}

function formatValidationError(error: string, language: Language, t: Translation) {
  if (language === "no") return error;

  const rowMatch = /^Rad (\d+): (.*)$/.exec(error);
  if (!rowMatch) return `${t.yearlyCalendar.importModal.unknownValidationError} ${error}`;

  const row = rowMatch[1];
  const message = rowMatch[2];
  const values = { row };

  if (message === "Mangler tittel.") {
    return validationMessage(t, "missingTitle", values);
  }
  if (message === "Tittel kan maksimalt være 200 tegn.") {
    return validationMessage(t, "titleTooLong", values);
  }
  if (message === "Beskrivelse kan maksimalt være 1000 tegn.") {
    return validationMessage(t, "descriptionTooLong", values);
  }
  if (/^(?:år|År) må være et heltall\.$/.test(message)) {
    return validationMessage(t, "invalidYear", values);
  }
  if (/^(?:måned|Måned) må være et heltall mellom 1 og 12\.$/.test(message)) {
    return validationMessage(t, "invalidMonth", values);
  }

  const invalidEntryType = /^Ugyldig entry_type "([^"]*)"\. Bruk en av: (.+)\.$/.exec(message);
  if (invalidEntryType) {
    return validationMessage(t, "invalidEntryType", {
      ...values,
      value: validationValueLabel(t, invalidEntryType[1]),
      allowed: allowedEntryTypesLabel(t, invalidEntryType[2]),
    });
  }

  const outsideSchoolYear = /^(\d{4}-\d{2}) ligger utenfor barnehageåret (\d{4}\/\d{4})\.$/.exec(message);
  if (outsideSchoolYear) {
    return validationMessage(t, "monthOutsideSchoolYear", {
      ...values,
      month: outsideSchoolYear[1],
      schoolYear: outsideSchoolYear[2],
    });
  }

  const invalidColor = /^Fargen "([^"]*)" er ikke tillatt\. Bruk en av: (.+)\.$/.exec(message);
  if (invalidColor) {
    return validationMessage(t, "invalidColor", {
      ...values,
      value: invalidColor[1],
      allowed: allowedColorsLabel(t, invalidColor[2]),
    });
  }

  const invalidBoolean = /^(.+) må være true\/false, ja\/nei, yes\/no eller 1\/0\.$/.exec(message);
  if (invalidBoolean) {
    return validationMessage(t, "invalidBoolean", {
      ...values,
      field: fieldAliasLabel(invalidBoolean[1], t),
    });
  }

  const dateRequired = /^(.+) krever dato i format YYYY-MM-DD innenfor barnehageåret (.+)\.$/.exec(message);
  if (dateRequired) {
    return validationMessage(t, "dateRequired", {
      ...values,
      type: entryTypeLabelFor(t, dateRequired[1]),
      schoolYear: dateRequired[2],
    });
  }

  const dateMismatch = /^Dato (.+) samsvarer ikke med år\/måned\.$/.exec(message);
  if (dateMismatch) {
    return validationMessage(t, "dateMismatch", {
      ...values,
      date: dateMismatch[1],
    });
  }

  const weekRequired = /^(.+) krever uke_fra mellom 1 og 53\.$/.exec(message);
  if (weekRequired) {
    return validationMessage(t, "weekRequired", {
      ...values,
      type: entryTypeLabelFor(t, weekRequired[1]),
    });
  }

  if (message === "uke_til må være mellom 1 og 53.") {
    return validationMessage(t, "weekEndRange", values);
  }
  if (message === "uke_til må være høyere enn uke_fra.") {
    return validationMessage(t, "weekEndAfterStart", values);
  }

  return `${t.yearlyCalendar.importModal.unknownValidationError} ${error}`;
}

export default function YearlyCalendarImportModal({
  isOpen,
  onClose,
  schoolYear,
}: YearlyCalendarImportModalProps) {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [actions, setActions] = useState<Record<string, ImportDecisionAction>>({});

  useEffect(() => {
    if (isOpen) return;
    setFile(null);
    setPreview(null);
    setActions({});
  }, [isOpen]);

  const groupedRows = useMemo(() => {
    const groups: Record<ImportPreviewStatus, ImportPreviewRow[]> = {
      new: [],
      unchanged: [],
      changed: [],
      invalid: [],
      ambiguous: [],
    };
    for (const row of preview?.rows ?? []) {
      groups[row.status].push(row);
    }
    return groups;
  }, [preview]);

  const selectedImportCount = useMemo(() => {
    if (!preview) return 0;
    return preview.rows.filter((row, index) => {
      const action = actions[rowKey(row, index)] ?? row.defaultAction;
      return action !== "ignore";
    }).length;
  }, [actions, preview]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t.yearlyCalendar.importModal.noFile);
      const { parseYearlyCalendarWorkbook } = await import("@/lib/yearly-calendar-excel");
      const rows = await parseYearlyCalendarWorkbook(file);
      const response = await apiRequest("POST", "/api/yearly-calendar?action=preview-import", {
        schoolYear,
        rows,
      });
      return response.json() as Promise<ImportPreview>;
    },
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setActions(
        Object.fromEntries(
          nextPreview.rows.map((row, index) => [rowKey(row, index), row.defaultAction]),
        ),
      );
    },
    onError: (error: unknown) => {
      toast({
        title: t.yearlyCalendar.importModal.previewError,
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error(t.yearlyCalendar.importModal.importError);

      const body: Decision = {
        schoolYear,
        decisions: preview.rows.map((row, index) => ({
          rowNumber: row.rowNumber,
          status: row.status,
          action: actions[rowKey(row, index)] ?? row.defaultAction,
          row: row.original,
          existingId: existingIdFor(row),
        })),
      };

      const response = await apiRequest("POST", "/api/yearly-calendar?action=commit-import", body);
      return response.json() as Promise<ImportSummary>;
    },
    onSuccess: (summary) => {
      void queryClient.invalidateQueries({ queryKey: [`/api/yearly-calendar?schoolYear=${schoolYear}`] });

      const errors = summary.errors ?? [];
      if (errors.length > 0) {
        const successfulWrites = (summary.created?.length ?? 0) + (summary.updated?.length ?? 0);
        const formattedErrors = errors.flatMap((error) => (
          error.errors.map((message) => formatValidationError(message, language, t))
        ));

        toast({
          title: successfulWrites > 0
            ? t.yearlyCalendar.importModal.partialImportTitle
            : t.yearlyCalendar.importModal.importError,
          description: [
            successfulWrites > 0 ? t.yearlyCalendar.importModal.partialImportDescription : null,
            ...formattedErrors,
          ].filter(Boolean).join("\n"),
          variant: "destructive",
        });
        onClose();
        return;
      }

      toast({ title: t.yearlyCalendar.importModal.importSuccess });
      onClose();
    },
    onError: (error: unknown) => {
      toast({
        title: t.yearlyCalendar.importModal.importError,
        description: error instanceof Error ? error.message : "",
        variant: "destructive",
      });
    },
  });

  const isBusy = previewMutation.isPending || commitMutation.isPending;
  const commitLabel =
    preview && preview.counts.invalid > 0 && selectedImportCount > 0
      ? t.yearlyCalendar.importModal.commitValidRows
      : t.yearlyCalendar.importModal.commit;

  const actionLabel = (action: ImportDecisionAction) => {
    if (action === "update") return t.yearlyCalendar.importModal.updateExisting;
    if (action === "create") return t.yearlyCalendar.importModal.createNew;
    return t.yearlyCalendar.importModal.ignore;
  };

  const statusLabel = (status: ImportPreviewStatus) => {
    if (status === "new") return t.yearlyCalendar.importModal.newEntries;
    if (status === "unchanged") return t.yearlyCalendar.importModal.unchangedEntries;
    if (status === "changed") return t.yearlyCalendar.importModal.changedEntries;
    if (status === "invalid") return t.yearlyCalendar.importModal.invalidRows;
    return t.yearlyCalendar.importModal.ambiguousRows;
  };

  const entryTypeLabel = (entryType: unknown) => {
    return entryTypeLabelFor(t, entryType);
  };

  const fieldLabel = (field: keyof YearlyCalendarImportPayload, fallback: string) => (
    t.yearlyCalendar.importModal.fields[field] ?? fallback
  );

  const formatFieldValue = (field: keyof YearlyCalendarImportPayload, value: unknown) => {
    if (field === "entryType") return entryTypeLabel(value);
    return formatValue(value);
  };

  const rowTitle = (row: ImportPreviewRow) => {
    if (hasPayload(row)) return row.payload.title;
    return originalTitleFor(row) ?? statusLabel(row.status);
  };

  const renderServerErrors = (errors: string[]) => (
    <div className="space-y-1 text-sm text-red-700 dark:text-red-300">
      <ul className="space-y-1">
        {errors.map((error) => (
          <li key={error}>{formatValidationError(error, language, t)}</li>
        ))}
      </ul>
    </div>
  );

  const renderPayload = (payload: YearlyCalendarImportPayload) => (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t.yearlyCalendar.importModal.fields.entryType}</dt>
        <dd className="truncate font-medium">{entryTypeLabel(payload.entryType)}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t.yearlyCalendar.importModal.fields.title}</dt>
        <dd className="truncate font-medium">{payload.title}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.yearlyCalendar.importModal.fields.date}</dt>
        <dd>{formatValue(payload.date)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.yearlyCalendar.importModal.fields.weekNumber}</dt>
        <dd>{formatValue(payload.weekNumber)}</dd>
      </div>
    </dl>
  );

  const renderAction = (row: ImportPreviewRow, index: number) => {
    const actionsForRow = availableActions(row);
    if (actionsForRow.length === 1) {
      return <Badge variant="outline">{actionLabel(actionsForRow[0])}</Badge>;
    }

    const key = rowKey(row, index);
    return (
      <Select
        value={actions[key] ?? row.defaultAction}
        onValueChange={(value) => setActions((current) => ({
          ...current,
          [key]: value as ImportDecisionAction,
        }))}
      >
        <SelectTrigger className="h-9 w-full sm:w-52" aria-label={statusLabel(row.status)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {actionsForRow.map((action) => (
            <SelectItem key={action} value={action}>
              {actionLabel(action)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const renderRow = (row: ImportPreviewRow, index: number) => (
    <div key={rowKey(row, index)} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">#{row.rowNumber}</Badge>
            <span className="truncate text-sm font-semibold">
              {rowTitle(row)}
            </span>
          </div>

          {hasPayload(row) && renderPayload(row.payload)}

          {row.status === "invalid" && (
            renderServerErrors(row.errors)
          )}

          {row.status === "changed" && (
            <div className="space-y-2">
              {row.changes.map((change) => (
                <div key={change.field} className="grid gap-2 rounded-md bg-neutral-50 p-2 text-sm dark:bg-neutral-950 sm:grid-cols-[9rem_1fr_1fr]">
                  <div className="font-medium">{fieldLabel(change.field, change.label)}</div>
                  <div>
                    <span className="text-muted-foreground">{t.yearlyCalendar.importModal.oldValue}: </span>
                    {formatFieldValue(change.field, change.oldValue)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t.yearlyCalendar.importModal.newValue}: </span>
                    {formatFieldValue(change.field, change.newValue)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {row.status === "ambiguous" && (
            <div className="flex flex-wrap gap-2 text-sm">
              {row.matches.map((match) => (
                <Badge key={match.id ?? `${match.title}-${match.date}`} variant="outline">
                  #{match.id}: {match.title ?? "-"}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0">{renderAction(row, index)}</div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isBusy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t.yearlyCalendar.importModal.title}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(90vh-10rem)] space-y-4 overflow-y-auto px-6 pb-2">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor={fileInputId}>{t.yearlyCalendar.importModal.chooseFile}</Label>
              <Input
                id={fileInputId}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={isBusy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setActions({});
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => {
                if (!file) {
                  toast({
                    title: t.yearlyCalendar.importModal.noFile,
                    variant: "destructive",
                  });
                  return;
                }
                previewMutation.mutate();
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t.yearlyCalendar.importModal.preview}
            </Button>
          </div>

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                {STATUS_ORDER.map((status) => (
                  <div key={status} className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                    <div className="text-2xl font-semibold">{preview.counts[status]}</div>
                    <div className="text-muted-foreground">{statusLabel(status)}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-5">
                {STATUS_ORDER.map((status) => {
                  const rows = groupedRows[status];
                  if (rows.length === 0) return null;

                  return (
                    <section key={status} className="space-y-2" aria-labelledby={`import-${status}`}>
                      <h3 id={`import-${status}`} className="text-sm font-semibold">
                        {statusLabel(status)}
                      </h3>
                      <div className="space-y-2">
                        {rows.map((row) => renderRow(row, preview.rows.indexOf(row)))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-neutral-200 p-4 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
            {t.yearlyCalendar.importModal.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => commitMutation.mutate()}
            disabled={!preview || selectedImportCount === 0 || isBusy}
            className="bg-[#FF6B35] text-white hover:bg-[#FF5722]"
          >
            {commitMutation.isPending ? (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t.yearlyCalendar.importModal.committing}
              </>
            ) : (
              <>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {commitLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
