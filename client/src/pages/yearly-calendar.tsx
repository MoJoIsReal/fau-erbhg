import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Calendar as CalendarIcon, Utensils, Sticker, GripVertical, ChevronLeft, ChevronRight } from "lucide-react";
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

// Effective end week for an entry. If weekNumberEnd is null/missing, the
// entry only spans its own week.
function entryEndWeek(entry: YearlyCalendarEntry): number {
  return entry.weekNumberEnd && entry.weekNumberEnd > (entry.weekNumber ?? 0)
    ? entry.weekNumberEnd
    : (entry.weekNumber ?? 0);
}

function isMultiWeek(entry: YearlyCalendarEntry): boolean {
  return entryEndWeek(entry) > (entry.weekNumber ?? 0);
}

// Returns where a given week sits within an entry's span:
//   "single"   – entry only spans this single week
//   "start"    – first week of a multi-week entry
//   "middle"   – inner week of a multi-week entry
//   "end"      – last week of a multi-week entry
//   null       – entry does not cover this week
function spanPosition(
  entry: YearlyCalendarEntry,
  weekNumber: number
): "single" | "start" | "middle" | "end" | null {
  const start = entry.weekNumber ?? 0;
  const end = entryEndWeek(entry);
  if (weekNumber < start || weekNumber > end) return null;
  if (start === end) return "single";
  if (weekNumber === start) return "start";
  if (weekNumber === end) return "end";
  return "middle";
}

// Visual sort order: food first (so "ukens varmmat" is always on top of the
// week badges), then group entries with the same color together. Falls back
// to id for stable ordering.
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

type MonthTheme = {
  // CSS gradient classes for the month header (Tailwind)
  gradient: string;
  // Decorative emoji for the title icon
  titleIcon: string;
  // Larger decorative emoji placed in the corners
  cornerLeft: string;
  cornerRight: string;
  // Background floaters in the section body (low opacity, scattered)
  floaters: string[];
  // Optional accent ring color around the section card
  ring: string;
};

function monthTheme(month: number): MonthTheme {
  switch (month) {
    case 8: // August – sommer/butterflies
      return {
        gradient: "from-[#4A8C5F] via-[#5fa370] to-[#FFD27A]",
        titleIcon: "🦋",
        cornerLeft: "🦋",
        cornerRight: "☀️",
        floaters: ["🦋", "🌿"],
        ring: "border-[#FFD27A]/40",
      };
    case 9: // September – tidlig høst
      return {
        gradient: "from-[#4A8C5F] via-[#6f9b54] to-[#E18B3B]",
        titleIcon: "🍂",
        cornerLeft: "🍁",
        cornerRight: "🦋",
        floaters: ["🍂", "🍁", "🌰"],
        ring: "border-[#E18B3B]/40",
      };
    case 10: // Oktober – høst
      return {
        gradient: "from-[#5d6f24] via-[#8a5b1c] to-[#D9572C]",
        titleIcon: "🍁",
        cornerLeft: "🍁",
        cornerRight: "🍂",
        floaters: ["🍁", "🍂", "🎃"],
        ring: "border-[#D9572C]/40",
      };
    case 11: // November – sen høst
      return {
        gradient: "from-[#4A5C3F] via-[#6b5436] to-[#a04e2a]",
        titleIcon: "🍃",
        cornerLeft: "🍂",
        cornerRight: "❄️",
        floaters: ["🍂", "🌧️", "🕯️"],
        ring: "border-[#a04e2a]/40",
      };
    case 12: // Desember – jul
      return {
        gradient: "from-[#1f4f3a] via-[#2C5F41] to-[#7A2424]",
        titleIcon: "⭐",
        cornerLeft: "⭐",
        cornerRight: "🎄",
        floaters: ["⭐", "🎄", "❄️", "🎁"],
        ring: "border-[#FFD27A]/50",
      };
    case 1: // Januar – vinter
      return {
        gradient: "from-[#3b6f8f] via-[#5a8aab] to-[#b9d6e4]",
        titleIcon: "❄️",
        cornerLeft: "⛄",
        cornerRight: "❄️",
        floaters: ["❄️", "⛄", "✨"],
        ring: "border-[#b9d6e4]/50",
      };
    case 2: // Februar – vinter/snø
      return {
        gradient: "from-[#3b6f8f] via-[#6691ab] to-[#dfecf3]",
        titleIcon: "⛄",
        cornerLeft: "⛄",
        cornerRight: "❄️",
        floaters: ["❄️", "⛄", "⭐"],
        ring: "border-[#dfecf3]/50",
      };
    case 3: // Mars – tidlig vår
      return {
        gradient: "from-[#4A8C5F] via-[#7eb37d] to-[#d4e3c0]",
        titleIcon: "🌱",
        cornerLeft: "🌷",
        cornerRight: "🐣",
        floaters: ["🌱", "🌷", "🐦"],
        ring: "border-[#d4e3c0]/50",
      };
    case 4: // April – vår
      return {
        gradient: "from-[#4A8C5F] via-[#8bc18a] to-[#f5b8b8]",
        titleIcon: "🌸",
        cornerLeft: "🌷",
        cornerRight: "🐰",
        floaters: ["🌸", "🌷", "🐝", "🐜"],
        ring: "border-[#f5b8b8]/50",
      };
    case 5: // Mai – sen vår
      return {
        gradient: "from-[#4A8C5F] via-[#8bc18a] to-[#FFB347]",
        titleIcon: "🌷",
        cornerLeft: "🇳🇴",
        cornerRight: "🌷",
        floaters: ["🌷", "🌼", "🐝", "🦋"],
        ring: "border-[#FFB347]/50",
      };
    case 6: // Juni – tidlig sommer
      return {
        gradient: "from-[#4A8C5F] via-[#9CCB6E] to-[#FFD45E]",
        titleIcon: "☀️",
        cornerLeft: "☀️",
        cornerRight: "🌻",
        floaters: ["☀️", "🐞", "🍓", "🐜"],
        ring: "border-[#FFD45E]/50",
      };
    case 7: // Juli – sommer
      return {
        gradient: "from-[#4A8C5F] via-[#FFB347] to-[#FFD45E]",
        titleIcon: "🌞",
        cornerLeft: "🌻",
        cornerRight: "🍓",
        floaters: ["🌞", "🏖️", "🍦", "⛵"],
        ring: "border-[#FFD45E]/60",
      };
    default:
      return {
        gradient: "from-[#4A8C5F] to-[#2C5F41]",
        titleIcon: "",
        cornerLeft: "",
        cornerRight: "",
        floaters: [],
        ring: "border-[#4A8C5F]/40",
      };
  }
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
      // Preserve span length when moving a multi-week entry: shift start to
      // the drop target and shift end by the same delta.
      const span = isMultiWeek(entry) ? entryEndWeek(entry) - (entry.weekNumber ?? 0) : 0;
      moveMutation.mutate({
        entry,
        patch: {
          year: target.year,
          month: target.month,
          weekNumber: target.weekNumber,
          weekNumberEnd: span > 0 ? target.weekNumber + span : null,
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
            // Single-week notes stay in the sidebar; multi-week notes are
            // rendered as a chevron-banner across the week badges instead.
            // Notes with a weekNumber render as week banners; only "general"
            // notes without a week assignment stay in the sidebar.
            const noteEntries = sortByTypeAndColor(
              monthEntries.filter((e) => e.entryType === "note" && e.weekNumber == null)
            );

            const theme = monthTheme(month);
            return (
              <section
                key={`${year}-${month}`}
                className={`rounded-3xl bg-[#2C5F41]/95 dark:bg-neutral-900 text-white shadow-xl overflow-hidden border-4 ${theme.ring}`}
              >
                <div className={`relative px-6 py-5 bg-gradient-to-br ${theme.gradient} overflow-hidden`}>
                  <span
                    className="absolute -top-2 right-3 text-5xl opacity-40 select-none pointer-events-none"
                    aria-hidden
                  >
                    {theme.cornerRight}
                  </span>
                  <span
                    className="absolute -bottom-3 right-16 text-3xl opacity-25 select-none pointer-events-none"
                    aria-hidden
                  >
                    {theme.cornerLeft}
                  </span>
                  <span
                    className="absolute -left-2 -bottom-2 text-4xl opacity-25 select-none pointer-events-none"
                    aria-hidden
                  >
                    {theme.cornerLeft}
                  </span>
                  <h2 className="relative font-heading text-2xl sm:text-3xl font-extrabold tracking-wide uppercase text-[#FF6B35] drop-shadow-md flex items-center gap-2">
                    <span aria-hidden className="text-3xl sm:text-4xl">{theme.titleIcon}</span>
                    {monthName(month)} {year}
                  </h2>
                  <p className="relative text-yellow-100 italic text-sm mt-1 drop-shadow">
                    {t.yearlyCalendar.tagline}
                  </p>
                </div>

                <div className="relative">
                  {/* Decorative seasonal floaters – purely visual, do not interact */}
                  {theme.floaters.length > 0 && (
                    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
                      {theme.floaters.map((emoji, idx) => {
                        const positions = [
                          { top: "8%", left: "12%", size: "text-2xl", rot: "-rotate-12" },
                          { top: "30%", right: "6%", size: "text-3xl", rot: "rotate-6" },
                          { bottom: "12%", left: "8%", size: "text-2xl", rot: "rotate-12" },
                          { bottom: "20%", right: "12%", size: "text-2xl", rot: "-rotate-6" },
                        ];
                        const p = positions[idx % positions.length];
                        return (
                          <span
                            key={idx}
                            className={`absolute ${p.size} ${p.rot} opacity-15`}
                            style={{
                              top: p.top,
                              left: p.left,
                              right: p.right,
                              bottom: p.bottom,
                            }}
                          >
                            {emoji}
                          </span>
                        );
                      })}
                    </div>
                  )}
                <div className="relative grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-0">
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
                      const weekLevelEntries = sortByTypeAndColor(
                        monthEntries.filter((e) => {
                          if (spanPosition(e, week.weekNumber) === null) return false;
                          if (e.entryType === "week_event" || e.entryType === "food") return true;
                          // Notes attached to a week render as a week banner;
                          // weekless notes go to the sidebar instead.
                          if (e.entryType === "note" && e.weekNumber != null) return true;
                          return false;
                        })
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
                                const pos = spanPosition(entry, week.weekNumber)!;
                                const showLeftChevron = pos === "middle" || pos === "end";
                                const showRightChevron = pos === "start" || pos === "middle";
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
                                    {showLeftChevron && (
                                      <ChevronLeft className="inline h-3 w-3 mr-1" aria-hidden />
                                    )}
                                    {entry.entryType === "food" && (
                                      <Utensils className="inline h-3 w-3 mr-1" aria-hidden />
                                    )}
                                    {entry.title}
                                    {showRightChevron && (
                                      <ChevronRight className="inline h-3 w-3 ml-1" aria-hidden />
                                    )}
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
                              const dayEntries = sortByTypeAndColor(
                                monthEntries.filter(
                                  (e) => e.entryType === "day_event" && e.date === dateStr
                                )
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

                  {/* Desktop layout: card per week (week# + badges → horizontal day grid) */}
                  <div className="hidden lg:block p-3 space-y-3">
                    {weeks.map((week) => {
                      const weekRowId = `wkrow-${year}-${month}-${week.weekNumber}`;
                      const weekEntries = sortByTypeAndColor(
                        monthEntries.filter((e) => {
                          if (spanPosition(e, week.weekNumber) === null) return false;
                          if (e.entryType === "week_event" || e.entryType === "food") return true;
                          // Notes anchored to a week appear in the week banner;
                          // weekless notes remain in the sidebar.
                          if (e.entryType === "note" && e.weekNumber != null) return true;
                          return false;
                        })
                      );
                      const dFirst = week.days[0].date;
                      const dLast = week.days[4].date;
                      const range = `${dFirst.getDate()}.${dFirst.getMonth() + 1}–${dLast.getDate()}.${dLast.getMonth() + 1}`;
                      return (
                        <div
                          key={week.weekNumber}
                          className="rounded-lg bg-[#1f4530] border border-white/10 overflow-hidden"
                        >
                          {/* Week header: number + range + week-level badges */}
                          <DroppableRow
                            id={weekRowId}
                            data={{ kind: "week", year, month, weekNumber: week.weekNumber }}
                            disabled={!canEdit}
                            className="px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between mb-2">
                              <div className="flex items-baseline gap-2">
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="text-yellow-300 font-bold text-2xl leading-none hover:underline"
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
                                  <span className="text-yellow-300 font-bold text-2xl leading-none">
                                    {week.weekNumber}
                                  </span>
                                )}
                                <span className="text-yellow-100/80 text-xs uppercase">
                                  {t.yearlyCalendar.weekHeader}
                                </span>
                              </div>
                              <span className="text-yellow-100/60 text-xs">{range}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {weekEntries.map((entry) => {
                                const cs = colorStyle(entry);
                                const pos = spanPosition(entry, week.weekNumber)!;
                                const showLeftChevron = pos === "middle" || pos === "end";
                                const showRightChevron = pos === "start" || pos === "middle";
                                return (
                                  <DraggableEntry
                                    key={entry.id}
                                    entry={entry}
                                    canEdit={canEdit}
                                    onClick={canEdit ? () => openEdit(entry) : undefined}
                                    title={entry.description ?? entry.title}
                                    className={`text-xs rounded-full px-3 py-1 font-medium shadow inline-flex items-center max-w-full ${cs.className}`}
                                    style={cs.style}
                                  >
                                    {showLeftChevron && (
                                      <ChevronLeft className="inline h-3 w-3 mr-1 shrink-0" aria-hidden />
                                    )}
                                    {entry.entryType === "food" && (
                                      <Utensils className="inline h-3 w-3 mr-1 shrink-0" aria-hidden />
                                    )}
                                    <span className="break-words">{entry.title}</span>
                                    {showRightChevron && (
                                      <ChevronRight className="inline h-3 w-3 ml-1 shrink-0" aria-hidden />
                                    )}
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

                          {/* Days: 5-column horizontal grid (Mon–Fri) */}
                          <div className="grid grid-cols-5 divide-x divide-white/10 border-t border-white/10 bg-[#2C5F41]/40">
                            {week.days.map((d) => {
                              const dateStr = toIsoDate(d.date);
                              const dayEntries = sortByTypeAndColor(
                                monthEntries.filter(
                                  (e) => e.entryType === "day_event" && e.date === dateStr
                                )
                              );
                              const dayShort = weekdayLabels[week.days.indexOf(d)].slice(0, 3);
                              return (
                                <DroppableRow
                                  key={dateStr}
                                  id={`day-${dateStr}`}
                                  data={{ kind: "day", year, month, weekNumber: week.weekNumber, date: dateStr }}
                                  disabled={!canEdit || !d.inMonth}
                                  className={`px-2 py-2 min-h-[64px] ${d.inMonth ? "" : "opacity-40"}`}
                                >
                                  <div className="flex items-baseline gap-1.5 mb-1">
                                    <span className="text-yellow-100/70 text-[10px] uppercase">{dayShort}</span>
                                    <span className="text-yellow-200 font-bold text-base leading-none">
                                      {d.date.getDate()}
                                    </span>
                                  </div>
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
                                          className={`text-[11px] rounded px-1.5 py-1 shadow-sm flex items-start gap-1 ${cs.className}`}
                                          style={cs.style}
                                        >
                                          <CalendarIcon className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                                          <span className="break-words leading-snug font-medium min-w-0">{entry.title}</span>
                                        </DraggableEntry>
                                      );
                                    })}
                                    {canEdit && d.inMonth && dayEntries.length === 0 && (
                                      <button
                                        type="button"
                                        className="text-[10px] text-white/50 hover:text-white"
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
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
