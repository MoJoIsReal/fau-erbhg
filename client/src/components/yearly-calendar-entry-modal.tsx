import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import type { YearlyCalendarEntry } from "@shared/schema";

export type EntryDraft = {
  schoolYear: number;
  year: number;
  month: number;
  entryType: "week_event" | "day_event" | "food" | "note";
  weekNumber?: number | null;
  weekNumberEnd?: number | null;
  date?: string | null;
  title?: string;
  description?: string | null;
  color?: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: number;
  initial?: Partial<EntryDraft> & { id?: number };
  existing?: YearlyCalendarEntry | null;
}

const COLORS = ["red", "yellow", "green", "orange", "blue", "pink", "purple"] as const;
const TYPES: EntryDraft["entryType"][] = ["week_event", "day_event", "food", "note"];

const PRESET_HEX: Record<(typeof COLORS)[number], string> = {
  red: "#ef4444",
  yellow: "#fde047",
  green: "#22c55e",
  orange: "#fb923c",
  blue: "#60a5fa",
  pink: "#f472b6",
  purple: "#a855f7",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export default function YearlyCalendarEntryModal({ isOpen, onClose, schoolYear, initial, existing }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isEditing = !!existing?.id;

  const [entryType, setEntryType] = useState<EntryDraft["entryType"]>("week_event");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(1);
  const [weekNumber, setWeekNumber] = useState<string>("");
  const [weekNumberEnd, setWeekNumberEnd] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [color, setColor] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    const seed: any = existing ?? initial ?? {};
    setEntryType((seed.entryType as EntryDraft["entryType"]) || "week_event");
    setYear(seed.year ?? new Date().getFullYear());
    setMonth(seed.month ?? 1);
    setWeekNumber(seed.weekNumber != null ? String(seed.weekNumber) : "");
    setWeekNumberEnd(seed.weekNumberEnd != null ? String(seed.weekNumberEnd) : "");
    setDate(seed.date ?? "");
    setTitle(seed.title ?? "");
    setDescription(seed.description ?? "");
    setColor(seed.color ?? "");
  }, [isOpen, initial, existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Multi-week spans are only meaningful for week_event and note. Food is
      // always a single week, day_event uses date instead.
      const supportsSpan = entryType === "week_event" || entryType === "note";
      const body: any = {
        schoolYear,
        year,
        month,
        entryType,
        title,
        description: description || null,
        color: color || null,
        weekNumber: weekNumber ? parseInt(weekNumber) : null,
        weekNumberEnd: supportsSpan && weekNumberEnd ? parseInt(weekNumberEnd) : null,
        date: entryType === "day_event" ? (date || null) : null,
      };
      if (isEditing) {
        const res = await apiRequest("PUT", `/api/yearly-calendar?id=${existing!.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/yearly-calendar`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/yearly-calendar", schoolYear] });
      toast({ title: t.yearlyCalendar.modal.success });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.modal.error,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existing?.id) return;
      const res = await apiRequest("DELETE", `/api/yearly-calendar?id=${existing.id}`);
      if (res.status !== 204 && !res.ok) {
        throw new Error(await res.text());
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/yearly-calendar", schoolYear] });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: t.yearlyCalendar.modal.error,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (!isEditing) return;
    if (window.confirm(t.yearlyCalendar.modal.deleteConfirm)) {
      deleteMutation.mutate();
    }
  };

  const monthNames = [
    t.yearlyCalendar.months.january,
    t.yearlyCalendar.months.february,
    t.yearlyCalendar.months.march,
    t.yearlyCalendar.months.april,
    t.yearlyCalendar.months.may,
    t.yearlyCalendar.months.june,
    t.yearlyCalendar.months.july,
    t.yearlyCalendar.months.august,
    t.yearlyCalendar.months.september,
    t.yearlyCalendar.months.october,
    t.yearlyCalendar.months.november,
    t.yearlyCalendar.months.december,
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t.yearlyCalendar.modal.editTitle : t.yearlyCalendar.modal.addTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>{t.yearlyCalendar.modal.type}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as EntryDraft["entryType"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((typ) => (
                  <SelectItem key={typ} value={typ}>
                    {typ === "week_event" ? t.yearlyCalendar.entryTypes.weekEvent
                      : typ === "day_event" ? t.yearlyCalendar.entryTypes.dayEvent
                      : typ === "food" ? t.yearlyCalendar.entryTypes.food
                      : t.yearlyCalendar.entryTypes.note}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.events.date}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.yearlyCalendar.schoolYearLabel}</Label>
              <Input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} />
            </div>
          </div>

          {entryType !== "day_event" && (
            <div className={entryType === "week_event" || entryType === "note" ? "grid grid-cols-2 gap-3" : ""}>
              <div>
                <Label>{t.yearlyCalendar.modal.weekNumber}</Label>
                <Input
                  type="number"
                  min={1}
                  max={53}
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                />
              </div>
              {(entryType === "week_event" || entryType === "note") && (
                <div>
                  <Label>{t.yearlyCalendar.modal.weekNumberEnd}</Label>
                  <Input
                    type="number"
                    min={weekNumber ? parseInt(weekNumber) + 1 : 2}
                    max={53}
                    value={weekNumberEnd}
                    onChange={(e) => setWeekNumberEnd(e.target.value)}
                    placeholder="—"
                  />
                </div>
              )}
            </div>
          )}

          {entryType === "day_event" && (
            <div>
              <Label>{t.yearlyCalendar.modal.date}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}

          <div>
            <Label>{t.yearlyCalendar.modal.title}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          <div>
            <Label>{t.yearlyCalendar.modal.description}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </div>

          <div>
            <Label>{t.yearlyCalendar.modal.color}</Label>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setColor("")}
                className={`h-7 w-7 rounded-full border-2 bg-white text-neutral-500 text-xs flex items-center justify-center ${
                  !color ? "border-neutral-900 ring-2 ring-neutral-300" : "border-neutral-300"
                }`}
                title={t.yearlyCalendar.colors.none}
                aria-label={t.yearlyCalendar.colors.none}
              >
                ✕
              </button>
              {COLORS.map((c) => {
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: PRESET_HEX[c] }}
                    className={`h-7 w-7 rounded-full border-2 ${
                      selected ? "border-neutral-900 ring-2 ring-neutral-300" : "border-white shadow"
                    }`}
                    title={t.yearlyCalendar.colors[c as keyof typeof t.yearlyCalendar.colors]}
                    aria-label={t.yearlyCalendar.colors[c as keyof typeof t.yearlyCalendar.colors]}
                  />
                );
              })}
              <input
                type="color"
                value={HEX_RE.test(color) ? color : "#ff6b35"}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-8 rounded cursor-pointer border border-neutral-300 p-0"
                aria-label={t.yearlyCalendar.modal.color}
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#rrggbb"
                maxLength={7}
                className="w-28 font-mono text-xs"
              />
            </div>
            {color && !HEX_RE.test(color) && !COLORS.includes(color as any) && (
              <p className="text-xs text-red-500 mt-1">#rrggbb</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {isEditing ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {t.yearlyCalendar.modal.delete}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              {t.yearlyCalendar.modal.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !title || !entryType}
              className="bg-[#FF6B35] hover:bg-[#FF5722] text-white"
            >
              {saveMutation.isPending ? t.yearlyCalendar.modal.saving : t.yearlyCalendar.modal.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
