import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Calendar as CalendarIcon, Utensils, Sticker, GripVertical } from "lucide-react";
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

// Pick a readable text color (black or white) for a given hex background.
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
  const dayOfWeek = (first.getDay() + 6) % 7; // 0=Mon..6=Sun
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
    cursor.setDate(cursor.getDate() + 2); // skip weekend
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

type DragPayload = {
  id: number;
  entryType: YearlyCalendarEntry["entryType"];
};

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
  const [dragOver, setDragOver] = useState<string | null>(null);

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

  // Only show the current and next school year. Once August rolls over,
  // the "old" year automatically drops off the list.
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

  const handleDragStart = (e: React.DragEvent, entry: YearlyCalendarEntry) => {
    if (!canEdit) return;
    const payload: DragPayload = { id: entry.id, entryType: entry.entryType };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };

  const readPayload = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return null;
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  };

  const handleDropOnDay = (
    e: React.DragEvent,
    target: { year: number; month: number; weekNumber: number; date: string }
  ) => {
    e.preventDefault();
    setDragOver(null);
    const payload = readPayload(e);
    if (!payload) return;
    const entry = entries.find((x) => x.id === payload.id);
    if (!entry || entry.entryType !== "day_event") return;
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
  };

  const handleDropOnWeek = (
    e: React.DragEvent,
    target: { year: number; month: number; weekNumber: number }
  ) => {
    e.preventDefault();
    setDragOver(null);
    const payload = readPayload(e);
    if (!payload) return;
    const entry = entries.find((x) => x.id === payload.id);
    if (!entry) return;
    if (entry.entryType !== "week_event" && entry.entryType !== "food" && entry.entryType !== "note") return;
    if (entry.weekNumber === target.weekNumber && entry.month === target.month && entry.year === target.year) {
      return;
    }
    moveMutation.mutate({
      entry,
      patch: {
        year: target.year,
        month: target.month,
        weekNumber: target.weekNumber,
      },
    });
  };

  const allowDayDrop = (e: React.DragEvent, key: string) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== key) setDragOver(key);
  };
  const allowWeekDrop = allowDayDrop;

  return (
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
                <div className="bg-rose-50 text-neutral-900 p-5 border-r-2 border-[#4A8C5F]/30 lg:min-h-full">
                  <div className="font-heading font-bold text-[#2C5F41] mb-2 flex items-center gap-2">
                    <Sticker className="h-5 w-5" /> {t.yearlyCalendar.notes}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {noteEntries.map((entry) => (
                      <li
                        key={entry.id}
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, entry)}
                        className={`bg-white rounded-md px-3 py-2 shadow-sm ${
                          canEdit ? "cursor-grab active:cursor-grabbing hover:bg-yellow-50" : ""
                        }`}
                        onClick={canEdit ? () => openEdit(entry) : undefined}
                      >
                        <div className="font-medium flex items-center gap-1">
                          {canEdit && <GripVertical className="h-3 w-3 text-neutral-400" aria-hidden />}
                          {entry.title}
                        </div>
                        {entry.description && (
                          <div className="text-neutral-600 text-xs">{entry.description}</div>
                        )}
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

                {/* Day grid */}
                <div className="overflow-x-auto">
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
                        const weekKey = `wk-${year}-${month}-${week.weekNumber}`;
                        return (
                        <tr key={week.weekNumber} className="border-t border-white/10 align-top">
                          <td
                            className={`px-3 py-3 text-yellow-300 font-bold text-lg ${
                              dragOver === weekKey ? "bg-yellow-500/20" : ""
                            }`}
                            onDragOver={(e) => allowWeekDrop(e, weekKey)}
                            onDragLeave={() => setDragOver((k) => (k === weekKey ? null : k))}
                            onDrop={(e) => handleDropOnWeek(e, { year, month, weekNumber: week.weekNumber })}
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
                          </td>
                          {week.days.map((d) => {
                            const dateStr = toIsoDate(d.date);
                            const dayEntries = monthEntries.filter(
                              (e) => e.entryType === "day_event" && e.date === dateStr
                            );
                            const dayKey = `dy-${dateStr}`;
                            return (
                              <td
                                key={dateStr}
                                className={`px-2 py-3 align-top min-w-[110px] ${d.inMonth ? "" : "opacity-30"} ${
                                  dragOver === dayKey ? "bg-yellow-500/20" : ""
                                }`}
                                onDragOver={(e) => {
                                  if (d.inMonth) allowDayDrop(e, dayKey);
                                }}
                                onDragLeave={() => setDragOver((k) => (k === dayKey ? null : k))}
                                onDrop={(e) =>
                                  d.inMonth &&
                                  handleDropOnDay(e, {
                                    year,
                                    month,
                                    weekNumber: week.weekNumber,
                                    date: dateStr,
                                  })
                                }
                              >
                                <div className="text-yellow-100 text-xs mb-1">{d.date.getDate()}</div>
                                <div className="space-y-1">
                                  {dayEntries.map((entry) => {
                                    const cs = colorStyle(entry);
                                    return (
                                      <div
                                        key={entry.id}
                                        draggable={canEdit}
                                        onDragStart={(e) => handleDragStart(e, entry)}
                                        className={`text-xs rounded px-2 py-1 shadow-sm ${cs.className} ${
                                          canEdit ? "cursor-grab active:cursor-grabbing" : ""
                                        }`}
                                        style={cs.style}
                                        onClick={canEdit ? () => openEdit(entry) : undefined}
                                        title={entry.description ?? entry.title}
                                      >
                                        <div className="flex items-center gap-1 font-semibold">
                                          <CalendarIcon className="h-3 w-3" />
                                          <span className="truncate">{entry.title}</span>
                                        </div>
                                      </div>
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
                              </td>
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
                            const weekRowKey = `wkrow-${year}-${month}-${week.weekNumber}`;
                            return (
                              <div
                                key={`we-${week.weekNumber}`}
                                onDragOver={(e) => allowWeekDrop(e, weekRowKey)}
                                onDragLeave={() => setDragOver((k) => (k === weekRowKey ? null : k))}
                                onDrop={(e) => handleDropOnWeek(e, { year, month, weekNumber: week.weekNumber })}
                                className={`flex flex-wrap items-center gap-2 rounded px-1 py-0.5 ${
                                  dragOver === weekRowKey ? "bg-yellow-500/20 outline outline-2 outline-yellow-400" : ""
                                }`}
                              >
                                <span className="text-xs uppercase text-yellow-100 font-bold">
                                  {t.yearlyCalendar.week} {week.weekNumber}:
                                </span>
                                {weekEntries.map((entry) => {
                                  const cs = colorStyle(entry);
                                  return (
                                    <span
                                      key={entry.id}
                                      draggable={canEdit}
                                      onDragStart={(e) => handleDragStart(e, entry)}
                                      className={`text-xs rounded-full px-3 py-1 font-medium shadow ${cs.className} ${
                                        canEdit ? "cursor-grab active:cursor-grabbing" : ""
                                      }`}
                                      style={cs.style}
                                      onClick={canEdit ? () => openEdit(entry) : undefined}
                                      title={entry.description ?? entry.title}
                                    >
                                      {entry.entryType === "food" && (
                                        <Utensils className="inline h-3 w-3 mr-1" aria-hidden />
                                      )}
                                      {entry.title}
                                      {canEdit && <Pencil className="inline h-3 w-3 ml-1 opacity-70" />}
                                    </span>
                                  );
                                })}
                                {weekEntries.length === 0 && (
                                  <span className="text-xs text-white/40 italic">—</span>
                                )}
                              </div>
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
  );
}
