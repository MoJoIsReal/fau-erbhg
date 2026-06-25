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
import { parseYearlyCalendarWorkbook } from "@/lib/yearly-calendar-excel";
import type {
  ImportDecisionAction,
  ImportPreview,
  ImportPreviewRow,
  ImportPreviewStatus,
  YearlyCalendarImportPayload,
} from "@shared/yearly-calendar-utils";

interface YearlyCalendarImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: number;
}

type ImportSummary = {
  created?: unknown[];
  updated?: unknown[];
  ignored?: unknown[];
  errors?: Array<{ rowNumber: number; errors: string[] }>;
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

function rowKey(row: ImportPreviewRow, index: number) {
  return `${row.rowNumber}-${index}`;
}

function hasPayload(row: ImportPreviewRow): row is Extract<ImportPreviewRow, { payload: YearlyCalendarImportPayload }> {
  return "payload" in row;
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

export default function YearlyCalendarImportModal({
  isOpen,
  onClose,
  schoolYear,
}: YearlyCalendarImportModalProps) {
  const { t } = useLanguage();
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

      if (summary.errors && summary.errors.length > 0) {
        toast({
          title: t.yearlyCalendar.importModal.importError,
          description: summary.errors
            .map((error) => `#${error.rowNumber}: ${error.errors.join(" ")}`)
            .join("\n"),
          variant: "destructive",
        });
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

  const renderPayload = (payload: YearlyCalendarImportPayload) => (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t.yearlyCalendar.modal.type}</dt>
        <dd className="truncate font-medium">{payload.entryType}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">{t.yearlyCalendar.modal.title}</dt>
        <dd className="truncate font-medium">{payload.title}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.yearlyCalendar.modal.date}</dt>
        <dd>{formatValue(payload.date)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t.yearlyCalendar.modal.weekNumber}</dt>
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
              {hasPayload(row) ? row.payload.title : statusLabel(row.status)}
            </span>
          </div>

          {hasPayload(row) && renderPayload(row.payload)}

          {row.status === "invalid" && (
            <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
              {row.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          {row.status === "changed" && (
            <div className="space-y-2">
              {row.changes.map((change) => (
                <div key={change.field} className="grid gap-2 rounded-md bg-neutral-50 p-2 text-sm dark:bg-neutral-950 sm:grid-cols-[9rem_1fr_1fr]">
                  <div className="font-medium">{change.label}</div>
                  <div>
                    <span className="text-muted-foreground">{t.yearlyCalendar.importModal.oldValue}: </span>
                    {formatValue(change.oldValue)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t.yearlyCalendar.importModal.newValue}: </span>
                    {formatValue(change.newValue)}
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
