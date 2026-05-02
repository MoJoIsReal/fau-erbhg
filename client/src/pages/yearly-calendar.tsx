import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Calendar as CalendarIcon, Utensils, Sticker, GripVertical } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  rectIntersection,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { YearlyCalendarEntry } from "@shared/schema";
import YearlyCalendarEntryModal, { type EntryDraft } from "@/components/yearly-calendar-entry-modal";

const ENTRY_COLOR_CLASSES: Record<string, string> = {
  red: "bg-red-500 text-white",
  yellow: "bg-yellow-300 text-neutral-900",
  green: "bg-green-500 text-white",
  orange: "bg-orange-400 text-neutral-900",
  blue: "bg-blue-400 text-white",
  pink: "bg-pink-400 text-white",
  purple: "bg-purple-500 text-white",
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function readableTextOn(hex: string): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

type ColorStyle = { className: string; style?: React.CSSProperties };

function defaultColorForType(type: YearlyCalendarEntry["entryType"]): string {
  switch (type) {
    case "food":
      return "bg-orange-400 text-neutral-900";
    case "week_event":
      return "bg-red-500 text-white";
    case "day_event":
      return "bg-green-500 text-white";
    case "note":
    default:
      return "bg-neutral-200 text-neutral-900";
  }
}

function colorStyle(entry: YearlyCalendarEntry): ColorStyle {
  if (entry.color && HEX_RE.test(entry.color)) {
    return {
      className: "shadow-sm",
      style: { backgroundColor: entry.color, color: readableTextOn(entry.color) },
    };
  }
  if (entry.color && ENTRY_COLOR_CLASSES[entry.color]) {
    return { className: ENTRY_COLOR_CLASSES[entry.color] };
  }
  return { className: defaultColorForType(entry.entryType) };
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

function weeksOfMonth(year: number, month: number): { weekNumber: number; days: { date: Date; inMonth: boolean }[] }[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - dayOfWeek);

  const weeks: { weekNumber: number; days: { date: Date; inMonth: boolean }[] }[] = [];
  while (true) {
    const days: { date: Date; inMonth: boolean }[] = [];
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

type DropTarget =
  | { kind: "day"; year: number; month: number; weekNumber: number; date: string }
  | { kind: "week"; year: number; month: number; weekNumber: number };

type DragData = { entry: YearlyCalendarEntry };

interface DraggableEntryProps {
  entry: YearlyCalendarEntry;
  canEdit: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  title?: string;
}

function DraggableEntry({ entry, canEdit, onClick, className, style, children, title }: DraggableEntryProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { entry } as DragData,
    disabled: !canEdit,
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      title={title}
      className={`${className ?? ""} ${canEdit ? "cursor-grab active:cursor-grabbing touch-none select-none" : ""} ${
        isDragging ? "opacity-60 z-50 relative" : ""
      }`}
      style={{
        ...style,
        transform: CSS.Translate.toString(transform),
      }}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

interface DroppableProps {
  id: string;
  data: DropTarget;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

function DroppableCell({ id, data, disabled, className, children, onClick }: DroppableProps) {
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled });
  return (
    <td
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "bg-yellow-500/25 outline outline-2 outline-yellow-400 outline-offset-[-2px]" : ""}`}
      onClick={onClick}
    >
      {children}
    </td>
  );
}

function DroppableRow({ id, data, disabled, className, children }: DroppableProps) {
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "bg-yellow-500/25 outline outline-2 outline-yellow-400" : ""}`}
    >
      {children}
    </div>
  );
}

export default function YearlyCalendarPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = !!user && (user.role === "admin" || user.role === "member" || user.role === "staff");

  const now = new Date();
  const defaultSchoolYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const [schoolYear, setSchoolYear] = useState<number>(defaultSchoolYear);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<YearlyCalendarEntry | null>(null);
  const [draftDefaults, setDraftDefaults] = useState<Partial<EntryDraft>>({
    schoolYear,
    year: schoolYear,
    month: 8,
    entryType: "week_event",
  });

  // Mouse: require small movement to start drag (so taps still fire onClick).
  // Touch: require a 200ms long-press (so vertical scrolling still works).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const { data: entries = [] } = useQuery<YearlyCalendarEntry[]>({
    queryKey: ["/api/yearly-calendar", schoolYear],
    queryFn: async () => {
      const res = await fetch(`/api/yearly-calendar?schoolYear=${schoolYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load yearly calendar");
      return res.json();
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ entry, patch }: { entry: YearlyCalendarEntry; patch: Partial<YearlyCalendarEntry> }) => {
      const body = { ...entry, ...patch };
      const res = await apiRequest("PUT", `/api/yearly-calendar?id=${entry.id}`, body);
      return res.json();
    },
    onMutate: async ({ entry, patch }) => {
      const key = ["/api/yearly-calendar", schoolYear];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<YearlyCalendarEntry[]>(key);
      queryClient.setQueryData<YearlyCalendarEntry[]>(key, (old) =>
        (old ?? []).map((e) => (e.id === entry.id ? { ...e, ...patch } : e))
      );
      return { previous };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["/api/yearly-calendar", schoolYear], ctx.previous);
      }
      toast({
        title: t.yearlyCalendar.modal.error,
        description: err?.message ?? "",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/yearly-calendar", schoolYear] });
    },
  });

  const months = useMemo(() => monthsForSchoolYear(schoolYear), [schoolYear]);

  const monthName = (m: number) => {
    const keys = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ] as const;
    return t.yearlyCalendar.months[keys[m - 1]];
  };

  const weekdayLabels = [
    t.yearlyCalendar.monday,
    t.yearlyCalendar.tuesday,
    t.yearlyCalendar.wednesday,
    t.yearlyCalendar.thursday,
    t.yearlyCalendar.friday,
  ];

  const schoolYearOptions = [defaultSchoolYear, defaultSchoolYear + 1];

  const openCreate = (defaults: Partial<EntryDraft>) => {
    setEditingEntry(null);
    setDraftDefaults({ schoolYear, ...defaults });
    setModalOpen(true);
  };
  const openEdit = (entry: YearlyCalendarEntry) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const data = active.data.current as DragData | undefined;
    const target = over.data.current as DropTarget | undefined;
    if (!data || !target) return;
    const { entry } = data;

    if (target.kind === "day") {
      if (entry.entryType !== "day_event") return;
      if (entry.date === target.date) return;
      moveMutation.mutate({
        entry,
        patch: {
          year: target.year,
          month: target.month,
          weekNumber: target.weekNumber,
          date: target.date,
        },
      });
      return;
    }

    if (target.kind === "week") {
      if (entry.entryType !== "week_event" && entry.entryType !== "food" && entry.entryType !== "note") return;
      if (entry.weekNumber === target.weekNumber && entry.month === target.month && entry.year === target.year) return;
      moveMutation.mutate({
        entry,
        patch: {
          year: target.year,
          month: target.month,
          weekNumber: target.weekNumber,
        },
      });
      return;
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleDragEnd}>
      <div className="space-y-8">
        {/* Hero strip */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2C5F41] via-[#4A8C5F] to-[#FF6B35] text-white p-6 sm:p-8 shadow-lg relative overflow-hidden">
          <div className="absolute -top-6 -right-6 text-yellow-300 opacity-30 text-7xl select-none" aria-hidden>★</div>
          <div className="absolute -bottom-8 -left-6 text-yellow-200 opacity-20 text-8xl select-none" aria-hidden>★</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold">{t.yearlyCalendar.title}</h1>
          <p className="mt-1 text-white/90">{t.yearlyCalendar.subtitle}</p>
          <p className="mt-3 italic text-yellow-100">{t.yearlyCalendar.tagline}</p>

          <div className="mt-5 flex flex-wrap gap-3 items-center">
            <span className="text-sm text-white/80">{t.yearlyCalendar.schoolYearLabel}:</span>
            <Select value={String(schoolYear)} onValueChange={(v) => setSchoolYear(parseInt(v))}>
              <SelectTrigger className="w-[180px] bg-white text-neutral-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schoolYearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{`${y}/${y + 1}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canEdit && (
              <Button
                onClick={() => openCreate({ year: months[0].year, month: months[0].month, entryType: "week_event" })}
                className="bg-white text-[#FF6B35] hover:bg-yellow-100"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t.yearlyCalendar.addEntry}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-12">
          {months.map(({ year, month }) => {
            const monthEntries = entries.filter((e) => e.year === year && e.month === month);
            const weeks = weeksOfMonth(year, month);
            const noteEntries = monthEntries.filter((e) => e.entryType === "note");

            return (
              <section
                key={`${year}-${month}`}
                className="rounded-3xl bg-[#2C5F41]/95 dark:bg-neutral-900 text-white shadow-xl overflow-hidden border-4 border-[#4A8C5F]/40"
              >
                <div className="relative px-6 py-4 bg-gradient-to-br from-[#4A8C5F] to-[#2C5F41]">
                  <h2 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-wide uppercase text-[#FF6B35] drop-shadow-sm">
                    {monthName(month)} {year}
                  </h2>
                  <p className="text-yellow-100 italic text-sm">{t.yearlyCalendar.tagline}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-0">
                  {/* Notes sidebar */}
                  <div className="bg-rose-50 text-neutral-900 p-5 border-b-2 lg:border-b-0 lg:border-r-2 border-[#4A8C5F]/30 lg:min-h-full">
                    <div className="font-heading font-bold text-[#2C5F41] mb-2 flex items-center gap-2">
                      <Sticker className="h-5 w-5" /> {t.yearlyCalendar.notes}
                    </div>
                    <ul className="space-y-2 text-sm">
                      {noteEntries.map((entry) => (
                        <li key={entry.id}>
                          <DraggableEntry
                            entry={entry}
                            canEdit={canEdit}
                            onClick={canEdit ? () => openEdit(entry) : undefined}
                            className="bg-white rounded-md px-3 py-2 shadow-sm hover:bg-yellow-50"
                          >
                            <div className="font-medium flex items-center gap-1">
                              {canEdit && <GripVertical className="h-3 w-3 text-neutral-400" aria-hidden />}
                              {entry.title}
                            </div>
                            {entry.description && (
                              <div className="text-neutral-600 text-xs">{entry.description}</div>
                            )}
                          </DraggableEntry>
                        </li>
                      ))}
                      {noteEntries.length === 0 && (
                        <li className="text-neutral-500 italic text-sm">—</li>
                      )}
                    </ul>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full border-[#2C5F41] text-[#2C5F41]"
                        onClick={() => openCreate({ year, month, entryType: "note" })}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t.yearlyCalendar.addEntry}
                      </Button>
                    )}
                  </div>

                  {/* Mobile layout: stacked week cards */}
                  <div className="lg:hidden p-3 space-y-3">
                    {weeks.map((week) => {
                      const weekLevelEntries = monthEntries.filter(
                        (e) =>
                          e.weekNumber === week.weekNumber &&
                          (e.entryType === "week_event" || e.entryType === "food")
                      );
                      const mFirst = week.days[0].date;
                      const mLast = week.days[4].date;
                      const range = `${mFirst.getDate()}.${mFirst.getMonth() + 1}–${mLast.getDate()}.${mLast.getMonth() + 1}`;
                      const weekRowId = `m-wkrow-${year}-${month}-${week.weekNumber}`;
                      return (
                        <div
                          key={week.weekNumber}
                          className="rounded-lg bg-[#1f4530] border border-white/10 overflow-hidden"
                        >
                          <DroppableRow
                            id={weekRowId}
                            data={{ kind: "week", year, month, weekNumber: week.weekNumber }}
                            disabled={!canEdit}
                            className="px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between mb-2">
                              <div className="flex items-baseline gap-2">
                                <span className="text-yellow-300 font-bold text-2xl leading-none">
                                  {week.weekNumber}
                                </span>
                                <span className="text-yellow-100/80 text-xs uppercase">
                                  {t.yearlyCalendar.weekHeader}
                                </span>
                              </div>
                              <span className="text-yellow-100/60 text-xs">{range}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {weekLevelEntries.map((entry) => {
                                const cs = colorStyle(entry);
                                return (
                                  <DraggableEntry
                                    key={entry.id}
                                    entry={entry}
                                    canEdit={canEdit}
                                    onClick={canEdit ? () => openEdit(entry) : undefined}
                                    title={entry.description ?? entry.title}
                                    className={`text-xs rounded-full px-3 py-1 font-medium shadow inline-flex items-center ${cs.className}`}
                                    style={cs.style}
                                  >
                                    {entry.entryType === "food" && (
                                      <Utensils className="inline h-3 w-3 mr-1" aria-hidden />
                                    )}
                                    {entry.title}
                                  </DraggableEntry>
                                );
                              })}
                              {canEdit && (
                                <button
                                  type="button"
                                  className="text-[11px] text-white/70 hover:text-white border border-white/30 rounded-full px-2 py-0.5"
                                  onClick={() =>
                                    openCreate({
                                      year,
                                      month,
                                      entryType: "week_event",
                                      weekNumber: week.weekNumber,
                                    })
                                  }
                                >
                                  + {t.yearlyCalendar.addEntry}
                                </button>
                              )}
                            </div>
                          </DroppableRow>

                          <ul className="divide-y divide-white/5 bg-[#2C5F41]/40">
                            {week.days.map((d) => {
                              const dateStr = toIsoDate(d.date);
                              const dayEntries = monthEntries.filter(
                                (e) => e.entryType === "day_event" && e.date === dateStr
                              );
                              const dayShort = weekdayLabels[week.days.indexOf(d)].slice(0, 3);
                              return (
                                <li key={dateStr}>
                                  <DroppableRow
                                    id={`m-day-${dateStr}`}
                                    data={{ kind: "day", year, month, weekNumber: week.weekNumber, date: dateStr }}
                                    disabled={!canEdit || !d.inMonth}
                                    className={`flex items-start gap-3 px-3 py-2 ${d.inMonth ? "" : "opacity-40"}`}
                                  >
                                    <div className="flex flex-col items-center w-12 shrink-0">
                                      <span className="text-yellow-100/70 text-[10px] uppercase">{dayShort}</span>
                                      <span className="text-yellow-200 font-bold text-base leading-tight">
                                        {d.date.getDate()}
                                      </span>
                                    </div>
                                    <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                                      {dayEntries.map((entry) => {
                                        const cs = colorStyle(entry);
                                        return (
                                          <DraggableEntry
                                            key={entry.id}
                                            entry={entry}
                                            canEdit={canEdit}
                                            onClick={canEdit ? () => openEdit(entry) : undefined}
                                            title={entry.description ?? entry.title}
                                            className={`text-xs rounded-md px-2 py-1 ${cs.className} max-w-full inline-flex items-center gap-1`}
                                            style={cs.style}
                                          >
                                            <CalendarIcon className="h-3 w-3 shrink-0" />
                                            <span className="truncate">{entry.title}</span>
                                          </DraggableEntry>
                                        );
                                      })}
                                      {canEdit && d.inMonth && dayEntries.length === 0 && (
                                        <button
                                          type="button"
                                          className="text-[11px] text-white/60 hover:text-white"
                                          onClick={() =>
                                            openCreate({
                                              year,
                                              month,
                                              entryType: "day_event",
                                              weekNumber: week.weekNumber,
                                              date: dateStr,
                                            })
                                          }
                                        >
                                          + {t.yearlyCalendar.addEntry}
                                        </button>
                                      )}
                                    </div>
                                  </DroppableRow>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop layout: Mon–Fri table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#1f4530] text-yellow-100 uppercase text-xs">
                          <th className="px-3 py-2 text-left w-20">{t.yearlyCalendar.weekHeader}</th>
                          {weekdayLabels.map((d) => (
                            <th key={d} className="px-3 py-2 text-left">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((week) => {
                          const weekCellId = `wkcell-${year}-${month}-${week.weekNumber}`;
                          return (
                            <tr key={week.weekNumber} className="border-t border-white/10 align-top">
                              <DroppableCell
                                id={weekCellId}
                                data={{ kind: "week", year, month, weekNumber: week.weekNumber }}
                                disabled={!canEdit}
                                className="px-3 py-3 text-yellow-300 font-bold text-lg"
                              >
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="hover:underline"
                                    onClick={() =>
                                      openCreate({
                                        year,
                                        month,
                                        entryType: "week_event",
                                        weekNumber: week.weekNumber,
                                      })
                                    }
                                  >
                                    {week.weekNumber}
                                  </button>
                                ) : (
                                  <span>{week.weekNumber}</span>
                                )}
                              </DroppableCell>
                              {week.days.map((d) => {
                                const dateStr = toIsoDate(d.date);
                                const dayEntries = monthEntries.filter(
                                  (e) => e.entryType === "day_event" && e.date === dateStr
                                );
                                const dayId = `day-${dateStr}`;
                                return (
                                  <DroppableCell
                                    key={dateStr}
                                    id={dayId}
                                    data={{ kind: "day", year, month, weekNumber: week.weekNumber, date: dateStr }}
                                    disabled={!canEdit || !d.inMonth}
                                    className={`px-2 py-3 align-top min-w-[110px] ${d.inMonth ? "" : "opacity-30"}`}
                                  >
                                    <div className="text-yellow-100 text-xs mb-1">{d.date.getDate()}</div>
                                    <div className="space-y-1">
                                      {dayEntries.map((entry) => {
                                        const cs = colorStyle(entry);
                                        return (
                                          <DraggableEntry
                                            key={entry.id}
                                            entry={entry}
                                            canEdit={canEdit}
                                            onClick={canEdit ? () => openEdit(entry) : undefined}
                                            title={entry.description ?? entry.title}
                                            className={`text-xs rounded px-2 py-1 shadow-sm ${cs.className}`}
                                            style={cs.style}
                                          >
                                            <div className="flex items-center gap-1 font-semibold">
                                              <CalendarIcon className="h-3 w-3" />
                                              <span className="truncate">{entry.title}</span>
                                            </div>
                                          </DraggableEntry>
                                        );
                                      })}
                                      {canEdit && d.inMonth && (
                                        <button
                                          type="button"
                                          className="text-[10px] text-white/60 hover:text-white"
                                          onClick={() =>
                                            openCreate({
                                              year,
                                              month,
                                              entryType: "day_event",
                                              weekNumber: week.weekNumber,
                                              date: dateStr,
                                            })
                                          }
                                        >
                                          + {t.yearlyCalendar.addEntry}
                                        </button>
                                      )}
                                    </div>
                                  </DroppableCell>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr className="border-t border-white/10">
                          <td colSpan={6} className="px-3 py-3 space-y-2">
                            {weeks.map((week) => {
                              const weekEntries = monthEntries.filter(
                                (e) =>
                                  e.weekNumber === week.weekNumber &&
                                  (e.entryType === "week_event" || e.entryType === "food")
                              );
                              const rowId = `wkrow-${year}-${month}-${week.weekNumber}`;
                              return (
                                <DroppableRow
                                  key={`we-${week.weekNumber}`}
                                  id={rowId}
                                  data={{ kind: "week", year, month, weekNumber: week.weekNumber }}
                                  disabled={!canEdit}
                                  className="flex flex-wrap items-center gap-2 rounded px-1 py-0.5"
                                >
                                  <span className="text-xs uppercase text-yellow-100 font-bold">
                                    {t.yearlyCalendar.week} {week.weekNumber}:
                                  </span>
                                  {weekEntries.map((entry) => {
                                    const cs = colorStyle(entry);
                                    return (
                                      <DraggableEntry
                                        key={entry.id}
                                        entry={entry}
                                        canEdit={canEdit}
                                        onClick={canEdit ? () => openEdit(entry) : undefined}
                                        title={entry.description ?? entry.title}
                                        className={`text-xs rounded-full px-3 py-1 font-medium shadow inline-flex items-center ${cs.className}`}
                                        style={cs.style}
                                      >
                                        {entry.entryType === "food" && (
                                          <Utensils className="inline h-3 w-3 mr-1" aria-hidden />
                                        )}
                                        {entry.title}
                                        {canEdit && <Pencil className="inline h-3 w-3 ml-1 opacity-70" />}
                                      </DraggableEntry>
                                    );
                                  })}
                                  {weekEntries.length === 0 && (
                                    <span className="text-xs text-white/40 italic">—</span>
                                  )}
                                </DroppableRow>
                              );
                            })}
                            {monthEntries.filter((e) => e.entryType === "week_event" || e.entryType === "food").length === 0 && (
                              <div className="text-xs text-white/50 italic">{t.yearlyCalendar.noEntries}</div>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <YearlyCalendarEntryModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          schoolYear={schoolYear}
          existing={editingEntry}
          initial={draftDefaults}
        />
      </div>
    </DndContext>
  );
}
