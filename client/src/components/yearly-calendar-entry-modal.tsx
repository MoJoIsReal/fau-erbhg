import { EditorDialog, EditorSection } from "@/components/site/editor-dialog";
import { CalendarCategory } from "@/components/site/calendar-category";
import { useEffect, useState } from "react";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeInput24h } from "@/components/time-input-24h";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { CalendarEntryKind } from "@shared/calendar-entries";
import { CALENDAR_DISPLAY_KINDS, calendarDisplayKind, calendarDisplayKindForEntry } from "@shared/calendar-entries";
import { supportsYearlyCalendarNewsletter } from "@shared/yearly-calendar-utils";

export type EntryDraft = {
  schoolYear: number;
  year: number;
  month: number;
  entryType: "week_event" | "day_event" | "food" | "note" | "closed";
  /**
   * The category chip the calendar shows. Separate from `entryType`, which
   * only says what shape the row has: a dated row is not automatically "I
   * barnehagen" — it can be a registration deadline, an internal SU meeting
   * or a festival the parents are invited to. `null` follows the type, which
   * is what every row did before this field existed.
   */
  category?: CalendarEntryKind | null;
  weekNumber?: number | null;
  weekNumberEnd?: number | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title?: string;
  description?: string | null;
  color?: string | null;
  showOnHomepage?: boolean | null;
  showForParents?: boolean | null;
  notifyNewsletter?: boolean | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schoolYear: number;
  initial?: Partial<EntryDraft> & { id?: number };
  existing?: YearlyCalendarEntry | null;
}

const TYPES: EntryDraft["entryType"][] = ["week_event", "day_event", "food", "closed", "note"];


const COLORS = ["red", "yellow", "green", "orange", "blue", "pink", "purple"] as const;

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
  const [category, setCategory] = useState<"bhgdag" | "arrangement" | "info" | "internt">("bhgdag");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(1);
  const [weekNumber, setWeekNumber] = useState<string>("");
  const [weekNumberEnd, setWeekNumberEnd] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [showOnHomepage, setShowOnHomepage] = useState<boolean>(false);
  const [notifyNewsletter, setNotifyNewsletter] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const seed: any = existing ?? initial ?? {};
    setEntryType((seed.entryType as EntryDraft["entryType"]) || "week_event");
    setCategory(calendarDisplayKind(calendarDisplayKindForEntry(seed)));
    setYear(seed.year ?? new Date().getFullYear());
    setMonth(seed.month ?? 1);
    setWeekNumber(seed.weekNumber != null ? String(seed.weekNumber) : "");
    setWeekNumberEnd(seed.weekNumberEnd != null ? String(seed.weekNumberEnd) : "");
    setDate(seed.date ?? "");
    setStartTime(seed.startTime ?? "");
    setEndTime(seed.endTime ?? "");
    setTitle(seed.title ?? "");
    setDescription(seed.description ?? "");
    setColor(seed.color ?? "");
    setShowOnHomepage(seed.showOnHomepage === true || seed.showForParents === true);
    setNotifyNewsletter(seed.notifyNewsletter === true);
  }, [isOpen, initial, existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Multi-week spans are only meaningful for week_event and note. Food is
      // always a single week, day_event uses date instead.
      const supportsSpan = entryType === "week_event" || entryType === "note";
      const supportsNewsletter = supportsYearlyCalendarNewsletter(entryType);
      const body: any = {
        schoolYear: existing?.schoolYear ?? schoolYear,
        year: date && (entryType === "day_event" || entryType === "closed") ? Number(date.slice(0, 4)) : year,
        month: date && (entryType === "day_event" || entryType === "closed") ? Number(date.slice(5, 7)) : month,
        entryType,
        category: entryType === "day_event" ? category : null,
        title,
        description: description || null,
        color: color || null,
        weekNumber: weekNumber ? parseInt(weekNumber) : null,
        weekNumberEnd: supportsSpan && weekNumberEnd ? parseInt(weekNumberEnd) : null,
        date: entryType === "day_event" || entryType === "closed" ? (date || null) : null,
        // Only a day_event carries a clock time; the server drops an end that
        // isn't after the start, so don't send one either.
        startTime: entryType === "day_event" ? (startTime || null) : null,
        endTime: entryType === "day_event" && startTime && endTime > startTime ? endTime : null,
        showOnHomepage: entryType === "day_event" ? showOnHomepage : false,
        showForParents: false,
        weekdayStart: supportsSpan ? existing?.weekdayStart ?? null : null,
        weekdayEnd: supportsSpan ? existing?.weekdayEnd ?? null : null,
        notifyNewsletter: supportsNewsletter ? notifyNewsletter : false,
      };
      if (isEditing) {
        const res = await apiRequest("PUT", `/api/yearly-calendar?id=${existing!.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", `/api/yearly-calendar`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/yearly-calendar?") });
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
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("/api/yearly-calendar?") });
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
      <EditorDialog title={isEditing ? t.yearlyCalendar.modal.editTitle : t.yearlyCalendar.modal.addTitle}
        description={t.entryEditor.intro} footer={
        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          {isEditing ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteMutation.isPending || saveMutation.isPending}
                >
                  {t.yearlyCalendar.modal.delete}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.yearlyCalendar.modal.delete}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t.yearlyCalendar.modal.deleteConfirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.yearlyCalendar.modal.cancel}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate()}
                  >
                    {t.yearlyCalendar.modal.delete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
              {t.yearlyCalendar.modal.cancel}
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || deleteMutation.isPending || !title.trim() || ((entryType === "day_event" || entryType === "closed") ? !date : !weekNumber)}
            >
              {saveMutation.isPending ? t.yearlyCalendar.modal.saving : t.yearlyCalendar.modal.save}
            </Button>
          </div>
        </DialogFooter>
        }>
        <div className="space-y-8 [&_label]:text-small [&_label]:text-copy [&_input]:text-body [&_textarea]:text-body">
          <EditorSection title={t.entryEditor.content}>
          <div>
            <Label htmlFor="entry-title">{t.yearlyCalendar.modal.title}</Label>
            <Input id="entry-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          <div>
            <Label htmlFor="entry-description">{t.yearlyCalendar.modal.description}</Label>
            <Textarea id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </div>


            {entryType === "day_event" && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="entry-category">{t.entryEditor.category}</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                  <SelectTrigger id="entry-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CALENDAR_DISPLAY_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{t.entryEditor.categories[kind]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2 pb-3">
                <span className="text-micro text-subtle">{t.entryEditor.preview}</span>
                <CalendarCategory kind={category} />
              </div>
            </div>
            <p className="text-small text-subtle">{t.entryEditor.categoryHint}</p>
            </>}
          </EditorSection>
          <EditorSection title={t.entryEditor.schedule}>
          <div>
            <Label htmlFor="entry-format">{t.entryEditor.format}</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as EntryDraft["entryType"])}>
              <SelectTrigger id="entry-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((typ) => (
                  <SelectItem key={typ} value={typ}>
                    {typ === "week_event" ? t.yearlyCalendar.entryTypes.weekEvent
                      : typ === "day_event" ? t.yearlyCalendar.entryTypes.dayEvent
                      : typ === "food" ? t.yearlyCalendar.entryTypes.food
                      : typ === "closed" ? t.yearlyCalendar.entryTypes.closed
                      : t.yearlyCalendar.entryTypes.note}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

            {entryType !== "day_event" && <CalendarCategory kind={calendarDisplayKindForEntry({ entryType })} />}

            {entryType !== "day_event" && entryType !== "closed" && <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="entry-month">{t.entryEditor.month}</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger id="entry-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="entry-year">{t.entryEditor.year}</Label>
              <Input id="entry-year" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} />
            </div>
          </div>


            </>}
          {entryType !== "day_event" && entryType !== "closed" && (
            <div className={entryType === "week_event" || entryType === "note" ? "grid grid-cols-2 gap-3" : ""}>
              <div>
                <Label htmlFor="entry-week">{t.yearlyCalendar.modal.weekNumber}</Label>
                <Input
                  type="number"
                  min={1}
                  max={53}
                  id="entry-week"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                />
              </div>
              {(entryType === "week_event" || entryType === "note") && (
                <div>
                  <Label htmlFor="entry-end-week">{t.yearlyCalendar.modal.weekNumberEnd}</Label>
                  <Input
                    type="number"
                    min={weekNumber ? parseInt(weekNumber) + 1 : 2}
                    max={53}
                    id="entry-end-week"
                  value={weekNumberEnd}
                    onChange={(e) => setWeekNumberEnd(e.target.value)}
                    placeholder="—"
                  />
                </div>
              )}
            </div>
          )}

          {(entryType === "day_event" || entryType === "closed") && (
            <div>
              <Label htmlFor="entry-date">{t.yearlyCalendar.modal.date}</Label>
              <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}

          {/* Optional: a dated entry without a time stays a whole-day entry.
              With one it shows up as a real appointment in a subscriber's
              calendar instead of a block across the day. */}
          {entryType === "day_event" && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="entry-start-time">{t.yearlyCalendar.modal.startTime}</Label>
                  <TimeInput24h name="entry-start-time" value={startTime} onChange={setStartTime} />
                </div>
                <div>
                  <Label htmlFor="entry-end-time">{t.yearlyCalendar.modal.endTime}</Label>
                  <TimeInput24h name="entry-end-time" value={endTime} onChange={setEndTime} disabled={!startTime} />
                </div>
              </div>
              <p className="mt-1 text-small text-muted-foreground">
                {t.yearlyCalendar.modal.timeHint}
              </p>
            </div>
          )}


          </EditorSection>
          <EditorSection title={t.entryEditor.publishing}>
            {entryType === "day_event" && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3" htmlFor="show-on-homepage">
                <Checkbox id="show-on-homepage" checked={showOnHomepage} onCheckedChange={(checked) => setShowOnHomepage(checked === true)} />
                <span><span className="block font-semibold">{t.entryEditor.homepage}</span><span className="block text-small text-subtle">{showOnHomepage ? t.entryEditor.homepageHint : t.entryEditor.calendarOnly}</span></span>
              </label>
            )}
            {entryType === "closed" && <p className="text-small text-subtle">{t.entryEditor.closedHint}</p>}
            {supportsYearlyCalendarNewsletter(entryType) && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3" htmlFor="notify-newsletter">
                <Checkbox id="notify-newsletter" checked={notifyNewsletter} onCheckedChange={(checked) => setNotifyNewsletter(checked === true)} />
                <span><span className="block font-semibold">{t.yearlyCalendar.modal.notifyNewsletter}</span><span className="block text-small text-subtle">{t.yearlyCalendar.modal.notifyNewsletterHint}</span></span>
              </label>
            )}
            {!supportsYearlyCalendarNewsletter(entryType) && <p className="text-small text-subtle">{t.entryEditor.calendarOnly}</p>}
          </EditorSection>
          <details className="border-t border-hairline pt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-small font-semibold text-subtle">{t.entryEditor.advanced}</summary>
          <div>
            <Label>{t.yearlyCalendar.modal.color}</Label>
            <p className="text-micro text-subtle mt-1 mb-2">
              {t.entryEditor.colorHint}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColor("")}
                className={`h-11 w-11 rounded-pill border-2 bg-surface text-subtle text-micro flex items-center justify-center ${
                  !color ? "border-ink ring-2 ring-hairline" : "border-hairline"
                }`}
                aria-pressed={!color}
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
                    className={`h-11 w-11 rounded-pill border-2 ${
                      selected ? "border-ink ring-2 ring-hairline" : "border-surface shadow-card"
                    }`}
                    aria-pressed={selected}
                    title={t.yearlyCalendar.colors[c as keyof typeof t.yearlyCalendar.colors]}
                    aria-label={t.yearlyCalendar.colors[c as keyof typeof t.yearlyCalendar.colors]}
                  />
                );
              })}
              <input
                type="color"
                value={HEX_RE.test(color) ? color : "#F4A261"}
                onChange={(e) => setColor(e.target.value)}
                className="h-11 w-11 rounded cursor-pointer border border-hairline p-0"
                aria-label={t.yearlyCalendar.modal.color}
              />
              <Input
                aria-label={t.yearlyCalendar.modal.color}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#rrggbb"
                maxLength={7}
                className="w-28 font-mono text-micro"
              />
            </div>
            {color && !HEX_RE.test(color) && !COLORS.includes(color as any) && (
              <p className="text-micro text-destructive mt-1">#rrggbb</p>
            )}
          </div>
          </details>
        </div>
      </EditorDialog>
    </Dialog>
  );
}
