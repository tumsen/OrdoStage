import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  addWeeks,
  addDays,
  format,
  getISOWeek,
  getISOWeekYear,
  getYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  parseISO,
  startOfDay,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Locale } from "date-fns";
import { da as localeDa, de as localeDe, enGB as localeEnGB } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type {
  TimeCategory,
  TimeReport,
  TimeReportPerson,
  TimeReportEntry,
  OrganizationLeavePolicy,
} from "@/contracts/backendTypes";
import { timeCategoryMessageId, isLeaveDayDisplayCategory } from "@/lib/timeCategoryI18n";
import {
  overtimeAgainstContract,
  resolveVacationYear,
  vacationYearFromStartYear,
  DEFAULT_VACATION_YEAR_POLICY,
  formatLeaveDaysFromMinutes,
} from "@/lib/leaveNorms";
import { isCountryFeatureEnabled } from "@/lib/countryFeatures";
import type { OrganizationCountryFeatures } from "@/lib/countryFeatures";
import {
  formatDurationHoursBoth,
  formatMinutesAsDurationBoth,
  formatSignedMinutesAsDurationBoth,
} from "@/lib/durationHours";
import { commaDecimalForLanguage } from "@/lib/timeGrid";
import { DurationHoursInput } from "@/components/time/DurationHoursInput";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM HH:mm");
  } catch {
    return iso;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  work: "#3b82f6",
  vacation: "#10b981",
  extra_vacation: "#14b8a6",
  comp_time: "#06b6d4",
  sick: "#f97316",
  holiday: "#a855f7",
  travelAllowance: "#d97706",
};

const CATEGORY_BG: Record<string, string> = {
  work: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  vacation: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  extra_vacation: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  comp_time: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  sick: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  holiday: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  travel_allowance: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

function today(): Date {
  return startOfDay(new Date());
}

type RangeMode = "all_time" | "week" | "month" | "year" | "vacation_year" | "custom";

const WEEK_STARTS_ON = 1 as const;

function WeekPickerButton({
  weekStart,
  onPick,
  locale,
  label,
  weekLabel,
}: {
  weekStart: Date;
  onPick: (d: Date) => void;
  locale: Locale;
  label: string;
  weekLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => weekStart);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON });

  useEffect(() => {
    setMonth(weekStart);
  }, [weekStart]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs text-white/85 whitespace-nowrap min-w-[16rem] hover:bg-white/[0.06]"
          aria-label={label}
          aria-expanded={open}
        >
          {weekLabel} · {format(weekStart, "d MMM", { locale })} –{" "}
          {format(weekEnd, "d MMM yyyy", { locale })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-white/10 bg-[#16161f] text-white shadow-xl" align="start">
        <Calendar
          mode="single"
          selected={weekStart}
          month={month}
          onMonthChange={setMonth}
          showWeekNumber
          weekStartsOn={WEEK_STARTS_ON}
          onSelect={(d) => {
            if (!d) return;
            onPick(startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }));
            setOpen(false);
          }}
          classNames={{
            months: "flex flex-col",
            month: "space-y-3 p-3",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-sm font-medium text-white",
            nav: "space-x-1 flex items-center",
            nav_button:
              "inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent p-0 text-white/70 hover:bg-white/10 hover:text-white",
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "w-full border-collapse space-y-1",
            head_row: "flex",
            head_cell: "w-9 font-normal text-[0.8rem] text-white/45",
            row: "flex w-full mt-2",
            cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
            day: "h-9 w-9 p-0 font-normal text-white/90 hover:bg-white/10 hover:text-white aria-selected:opacity-100",
            day_selected:
              "bg-red-900 text-white hover:bg-red-800 hover:text-white focus:bg-red-900 focus:text-white",
            day_today: "bg-white/10 text-white",
            day_outside: "text-white/30 opacity-50",
            day_disabled: "text-white/20 opacity-50",
            day_hidden: "invisible",
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function MonthPickerButton({
  month,
  onPick,
  locale,
  label,
}: {
  month: Date;
  onPick: (d: Date) => void;
  locale: Locale;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => month);

  useEffect(() => {
    setViewYear(month);
  }, [month]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs text-white/85 whitespace-nowrap min-w-[12rem] hover:bg-white/[0.06]"
          aria-label={label}
          aria-expanded={open}
        >
          {format(month, "MMMM yyyy", { locale })}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-white/10 bg-[#16161f] text-white shadow-xl" align="start">
        <div className="p-3 w-[18rem]">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setViewYear((m) => new Date(m.getFullYear() - 1, m.getMonth(), 1))}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-white">{viewYear.getFullYear()}</div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setViewYear((m) => new Date(m.getFullYear() + 1, m.getMonth(), 1))}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }).map((_, i) => {
              const year = viewYear.getFullYear();
              const d = new Date(year, i, 1);
              const isSelected = month.getFullYear() === year && month.getMonth() === i;
              return (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    "h-9 rounded-md border border-white/10 bg-white/[0.02] text-xs text-white/80 hover:bg-white/10",
                    isSelected && "bg-white/10 text-white border-white/20"
                  )}
                  onClick={() => {
                    onPick(d);
                    setOpen(false);
                  }}
                >
                  {format(d, "MMM", { locale })}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function YearPickerButton({
  year,
  onPick,
  label,
  displayLabel,
}: {
  year: number;
  onPick: (y: number) => void;
  label: string;
  displayLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [decadeStart, setDecadeStart] = useState(() => Math.floor(year / 10) * 10);

  useEffect(() => {
    setDecadeStart(Math.floor(year / 10) * 10);
  }, [year]);

  const years = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs text-white/85 whitespace-nowrap hover:bg-white/[0.06]",
            displayLabel ? "min-w-[18rem]" : "min-w-[8rem]"
          )}
          aria-label={label}
          aria-expanded={open}
        >
          {displayLabel ?? year}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-white/10 bg-[#16161f] text-white shadow-xl" align="start">
        <div className="p-3 w-[18rem]">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setDecadeStart((d) => d - 10)}
              aria-label="Previous decade"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-white">
              {decadeStart} – {decadeStart + 9}
            </div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setDecadeStart((d) => d + 10)}
              aria-label="Next decade"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {years.map((y) => {
              const outside = y < decadeStart || y > decadeStart + 9;
              const isSelected = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  className={cn(
                    "h-9 rounded-md border border-white/10 bg-white/[0.02] text-xs text-white/80 hover:bg-white/10",
                    outside && "text-white/35",
                    isSelected && "bg-white/10 text-white border-white/20"
                  )}
                  onClick={() => {
                    onPick(y);
                    setOpen(false);
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type TimePerson = { id: string; name: string; email: string | null; weeklyContractHours: number | null };
type TimeProjectOpt = { id: string; name: string; isArchived: boolean };

// ─── Multi-select filter ─────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const count = selected.length;
  const displayLabel = count === 0 ? label : `${label} (${count})`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "border-white/15 text-white/70 bg-transparent hover:bg-white/5 h-8 gap-1",
            count > 0 && "border-ordo-yellow/40 text-ordo-yellow"
          )}
        >
          {displayLabel}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-[#16161f] border-white/10 p-2 w-56" align="start">
        <div className="max-h-60 overflow-y-auto space-y-1">
          {options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...selected, opt.id] : selected.filter((x) => x !== opt.id))
                }
                className="border-white/30 data-[state=checked]:bg-ordo-yellow data-[state=checked]:border-ordo-yellow"
              />
              <span className="text-sm text-white/80 truncate">{opt.label}</span>
            </label>
          ))}
        </div>
        {count > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full mt-1 text-white/50 h-7 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-xl p-4">
      <p className="text-xs text-white/45 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", color ?? "text-white")}>{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Inline contract-hours editor ────────────────────────────────────────────

function ContractHoursCell({
  personId,
  value,
  onSaved,
}: {
  personId: string;
  value: number | null;
  onSaved: (personId: string, hours: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftHours, setDraftHours] = useState<number | null>(value);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { language } = useI18n();
  const commaDec = commaDecimalForLanguage(language);

  const save = useMutation({
    mutationFn: (hours: number | null) =>
      api.patch(`/api/time/person-contract/${personId}`, { weeklyContractHours: hours }),
    onSuccess: (_data, hours) => {
      onSaved(personId, hours);
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["time-people"] });
    },
    onError: () => toast({ title: "Failed to save contract hours", variant: "destructive" }),
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <DurationHoursInput
          valueHours={draftHours}
          onChangeHours={setDraftHours}
          allowEmpty
          inputClassName="h-7"
          placeholder="37:00"
        />
        <button
          onClick={() => save.mutate(draftHours)}
          className="text-emerald-400 hover:text-emerald-300"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraftHours(value);
        setEditing(true);
      }}
      className="flex items-center gap-1 text-white/60 hover:text-white/90 group"
    >
      <span className="tabular-nums text-left">
        {value !== null ? `${formatDurationHoursBoth(value, commaDec)}/wk` : "—"}
      </span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </button>
  );
}

// ─── Chart grouping ───────────────────────────────────────────────────────────

type ChartGroupMode = "day" | "week" | "month" | "year";

type ChartPoint = {
  key: string;
  tick?: string;
  label: string;
  work: number;
  vacation: number;
  extraVacation: number;
  sick: number;
  holiday: number;
  travelAllowance: number;
};

function emptyBuckets() {
  return { work: 0, vacation: 0, extraVacation: 0, sick: 0, holiday: 0, travelAllowance: 0 };
}

function toHours(minutes: number) {
  return +(minutes / 60).toFixed(2);
}

/** How often to show an X-axis label so ticks don't overlap. */
function xAxisLabelInterval(pointCount: number): number {
  if (pointCount <= 14) return 0;
  if (pointCount <= 31) return 1;
  if (pointCount <= 52) return 3;
  return Math.max(1, Math.ceil(pointCount / 12) - 1);
}

function groupChartData(
  byDay: TimeReport["byDay"],
  weekLabel: (week: number) => string,
  opts: {
    groupedBy: ChartGroupMode;
    range?: { from: string; to: string } | null;
  }
): { points: ChartPoint[]; groupedBy: ChartGroupMode } {
  if (opts.groupedBy === "day") {
    const days = new Map<
      string,
      { date: Date } & ReturnType<typeof emptyBuckets>
    >();

    const ensureDay = (date: Date) => {
      const mapKey = format(date, "yyyy-MM-dd");
      if (!days.has(mapKey)) {
        days.set(mapKey, { date: startOfDay(date), ...emptyBuckets() });
      }
      return days.get(mapKey)!;
    };

    if (opts.range?.from && opts.range?.to) {
      let cursor = startOfDay(parseISO(opts.range.from));
      const last = startOfDay(parseISO(opts.range.to));
      while (cursor.getTime() <= last.getTime()) {
        ensureDay(cursor);
        cursor = addDays(cursor, 1);
      }
    }

    for (const d of byDay) {
      const row = ensureDay(parseISO(d.date));
      row.work += d.workMinutes;
      row.vacation += d.vacationMinutes;
      row.extraVacation += d.extraVacationMinutes;
      row.sick += d.sickMinutes;
      row.holiday += d.holidayMinutes;
      row.travelAllowance += d.travelAllowanceMinutes;
    }

    return {
      groupedBy: "day",
      points: [...days.values()]
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((d) => ({
          key: format(d.date, "yyyy-MM-dd"),
          tick: format(d.date, "d"),
          label: format(d.date, "EEE d MMM yyyy"),
          work: toHours(d.work),
          vacation: toHours(d.vacation),
          extraVacation: toHours(d.extraVacation),
          sick: toHours(d.sick),
          holiday: toHours(d.holiday),
          travelAllowance: toHours(d.travelAllowance),
        })),
    };
  }

  if (opts.groupedBy === "month") {
    const months = new Map<
      string,
      { monthStart: Date } & ReturnType<typeof emptyBuckets>
    >();

    const ensureMonth = (date: Date) => {
      const monthStart = startOfMonth(date);
      const mapKey = format(monthStart, "yyyy-MM");
      if (!months.has(mapKey)) {
        months.set(mapKey, { monthStart, ...emptyBuckets() });
      }
      return months.get(mapKey)!;
    };

    if (opts.range?.from && opts.range?.to) {
      let cursor = startOfMonth(parseISO(opts.range.from));
      const last = startOfMonth(parseISO(opts.range.to));
      while (cursor.getTime() <= last.getTime()) {
        ensureMonth(cursor);
        cursor = addMonths(cursor, 1);
      }
    }

    for (const d of byDay) {
      const row = ensureMonth(parseISO(d.date));
      row.work += d.workMinutes;
      row.vacation += d.vacationMinutes;
      row.extraVacation += d.extraVacationMinutes;
      row.sick += d.sickMinutes;
      row.holiday += d.holidayMinutes;
      row.travelAllowance += d.travelAllowanceMinutes;
    }

    return {
      groupedBy: "month",
      points: [...months.values()]
        .sort((a, b) => a.monthStart.getTime() - b.monthStart.getTime())
        .map((m) => ({
          key: format(m.monthStart, "yyyy-MM"),
          tick: format(m.monthStart, "MMM"),
          label: format(m.monthStart, "MMMM yyyy"),
          work: toHours(m.work),
          vacation: toHours(m.vacation),
          extraVacation: toHours(m.extraVacation),
          sick: toHours(m.sick),
          holiday: toHours(m.holiday),
          travelAllowance: toHours(m.travelAllowance),
        })),
    };
  }

  if (opts.groupedBy === "year") {
    const years = new Map<number, ReturnType<typeof emptyBuckets>>();

    const ensureYear = (year: number) => {
      if (!years.has(year)) years.set(year, emptyBuckets());
      return years.get(year)!;
    };

    if (opts.range?.from && opts.range?.to) {
      let y = getYear(parseISO(opts.range.from));
      const last = getYear(parseISO(opts.range.to));
      while (y <= last) {
        ensureYear(y);
        y += 1;
      }
    }

    for (const d of byDay) {
      const row = ensureYear(getYear(parseISO(d.date)));
      row.work += d.workMinutes;
      row.vacation += d.vacationMinutes;
      row.extraVacation += d.extraVacationMinutes;
      row.sick += d.sickMinutes;
      row.holiday += d.holidayMinutes;
      row.travelAllowance += d.travelAllowanceMinutes;
    }

    // If no explicit range, still include years from data.
    if (!opts.range && byDay.length === 0) {
      return { groupedBy: "year", points: [] };
    }

    return {
      groupedBy: "year",
      points: [...years.entries()]
        .sort(([a], [b]) => a - b)
        .map(([year, row]) => ({
          key: String(year),
          tick: String(year),
          label: String(year),
          work: toHours(row.work),
          vacation: toHours(row.vacation),
          extraVacation: toHours(row.extraVacation),
          sick: toHours(row.sick),
          holiday: toHours(row.holiday),
          travelAllowance: toHours(row.travelAllowance),
        })),
    };
  }

  const weeks = new Map<
    string,
    { weekStart: Date } & ReturnType<typeof emptyBuckets>
  >();

  const ensureWeek = (weekStart: Date) => {
    const mapKey = format(weekStart, "yyyy-MM-dd");
    if (!weeks.has(mapKey)) {
      weeks.set(mapKey, { weekStart, ...emptyBuckets() });
    }
    return weeks.get(mapKey)!;
  };

  if (opts.range?.from && opts.range?.to) {
    let cursor = startOfWeek(parseISO(opts.range.from), { weekStartsOn: 1 });
    const last = startOfWeek(parseISO(opts.range.to), { weekStartsOn: 1 });
    while (cursor.getTime() <= last.getTime()) {
      ensureWeek(cursor);
      cursor = addWeeks(cursor, 1);
    }
  }

  for (const d of byDay) {
    const weekStart = startOfWeek(parseISO(d.date), { weekStartsOn: 1 });
    const w = ensureWeek(weekStart);
    w.work += d.workMinutes;
    w.vacation += d.vacationMinutes;
    w.extraVacation += d.extraVacationMinutes;
    w.sick += d.sickMinutes;
    w.holiday += d.holidayMinutes;
    w.travelAllowance += d.travelAllowanceMinutes;
  }

  return {
    groupedBy: "week",
    points: [...weeks.values()]
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .map((w) => {
        const weekEnd = endOfWeek(w.weekStart, { weekStartsOn: 1 });
        const isoWeek = getISOWeek(w.weekStart);
        const isoYear = getISOWeekYear(w.weekStart);
        return {
          key: `${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
          tick: weekLabel(isoWeek),
          label: `${weekLabel(isoWeek)} · ${format(w.weekStart, "d MMM")} – ${format(weekEnd, "d MMM yyyy")}`,
          work: toHours(w.work),
          vacation: toHours(w.vacation),
          extraVacation: toHours(w.extraVacation),
          sick: toHours(w.sick),
          holiday: toHours(w.holiday),
          travelAllowance: toHours(w.travelAllowance),
        };
      }),
  };
}

const CHART_GROUP_OPTIONS: { id: ChartGroupMode; labelKey: string }[] = [
  { id: "day", labelKey: "time.reportChartByDay" },
  { id: "week", labelKey: "time.reportChartByWeek" },
  { id: "month", labelKey: "time.reportChartByMonth" },
  { id: "year", labelKey: "time.reportChartByYear" },
];

function chartGroupOptionsForRange(rangeMode: RangeMode): ChartGroupMode[] {
  if (rangeMode === "week" || rangeMode === "month") return ["day", "week"];
  // year, vacation year, all time, custom
  return ["day", "week", "month"];
}

function defaultChartGroupMode(rangeMode: RangeMode): ChartGroupMode {
  return chartGroupOptionsForRange(rangeMode)[0] ?? "day";
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(entries: TimeReportEntry[]) {
  const header = ["Date", "Person", "Project", "Duration (min)", "Category", "Tags", "Note"];
  const rows = entries.map((e) => [
    format(parseISO(e.startsAt), "yyyy-MM-dd HH:mm"),
    e.personName,
    e.projectName ?? "",
    String(e.durationMinutes),
    e.category,
    e.tagNames.join("; "),
    (e.note ?? "").replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `time-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const RANGE_MODES: { id: RangeMode; labelKey: string; requiresLeave?: boolean }[] = [
  { id: "all_time", labelKey: "time.reportAllTime" },
  { id: "week", labelKey: "time.reportRangeWeek" },
  { id: "month", labelKey: "time.reportRangeMonth" },
  { id: "year", labelKey: "time.reportRangeYear" },
  { id: "vacation_year", labelKey: "time.reportRangeVacationYear", requiresLeave: true },
  { id: "custom", labelKey: "time.reportRangeCustom" },
];

export default function TimeReport() {
  const { t, language } = useI18n();
  const { canAction } = usePermissions();
  const canReadAll = canAction("time.read_all");
  const dfLocale = language === "da" ? localeDa : language === "de" ? localeDe : localeEnGB;
  const commaDec = commaDecimalForLanguage(language);
  const fmtMins = (minutes: number) => formatMinutesAsDurationBoth(minutes, commaDec);
  const fmtLeaveMins = (minutes: number, weeklyHours?: number | null) =>
    formatLeaveDaysFromMinutes(minutes, weeklyHours, commaDec);
  const fmtCompHhhMm = (minutes: number) => formatMinutesAsDurationBoth(minutes, commaDec);
  const fmtSignedMins = (minutes: number) => formatSignedMinutesAsDurationBoth(minutes, commaDec);

  const now = today();
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [anchorWeek, setAnchorWeek] = useState(() =>
    startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON })
  );
  const [anchorMonth, setAnchorMonth] = useState(() => startOfMonth(now));
  const [anchorYear, setAnchorYear] = useState(() => now.getFullYear());
  const [anchorVacationYearStart, setAnchorVacationYearStart] = useState(
    () => resolveVacationYear(now, DEFAULT_VACATION_YEAR_POLICY).start.getFullYear()
  );
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedParentCategoryIds, setSelectedParentCategoryIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [entryPage, setEntryPage] = useState(0);
  const ENTRIES_PER_PAGE = 50;
  const [sortPersonBy, setSortPersonBy] = useState<
    "name" | "total" | "overtime" | "compDelta" | "compBalance"
  >("name");
  const [sortPersonDir, setSortPersonDir] = useState<"asc" | "desc">("asc");
  const [contractOverrides, setContractOverrides] = useState<Map<string, number | null>>(new Map());
  const [chartGroupMode, setChartGroupMode] = useState<ChartGroupMode>("day");
  const allowedChartGroups = useMemo(() => chartGroupOptionsForRange(rangeMode), [rangeMode]);

  useEffect(() => {
    if (!allowedChartGroups.includes(chartGroupMode)) {
      setChartGroupMode(defaultChartGroupMode(rangeMode));
    }
  }, [rangeMode, allowedChartGroups, chartGroupMode]);

  const { data: orgFeatures } = useQuery<{ countryFeatures?: OrganizationCountryFeatures }>({
    queryKey: ["org"],
    queryFn: () => api.get<{ countryFeatures?: OrganizationCountryFeatures }>("/api/org"),
    enabled: canReadAll,
  });
  const leaveManagementEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "leaveManagement"
  );

  const { data: leavePolicy } = useQuery({
    queryKey: ["org-leave-policy"],
    queryFn: () => api.get<OrganizationLeavePolicy>("/api/org/leave-policy"),
    enabled: canReadAll && leaveManagementEnabled,
  });

  const vacationPolicy = useMemo(
    () =>
      leavePolicy
        ? {
            vacationYearStartMonth: leavePolicy.vacationYearStartMonth,
            vacationYearStartDay: leavePolicy.vacationYearStartDay,
          }
        : DEFAULT_VACATION_YEAR_POLICY,
    [leavePolicy]
  );

  const selectedVacationYear = useMemo(
    () => vacationYearFromStartYear(anchorVacationYearStart, vacationPolicy),
    [anchorVacationYearStart, vacationPolicy]
  );

  const visibleRangeModes = useMemo(
    () => RANGE_MODES.filter((m) => !m.requiresLeave || leaveManagementEnabled),
    [leaveManagementEnabled]
  );

  useEffect(() => {
    if (!leaveManagementEnabled && rangeMode === "vacation_year") {
      setRangeMode("year");
    }
  }, [leaveManagementEnabled, rangeMode]);

  const { from, to, allTime } = useMemo(() => {
    if (rangeMode === "all_time") {
      return { from: "", to: "", allTime: true as const };
    }
    if (rangeMode === "week") {
      const start = startOfWeek(anchorWeek, { weekStartsOn: WEEK_STARTS_ON });
      const end = endOfWeek(anchorWeek, { weekStartsOn: WEEK_STARTS_ON });
      return {
        from: format(start, "yyyy-MM-dd"),
        to: format(end, "yyyy-MM-dd"),
        allTime: false as const,
      };
    }
    if (rangeMode === "month") {
      return {
        from: format(startOfMonth(anchorMonth), "yyyy-MM-dd"),
        to: format(endOfMonth(anchorMonth), "yyyy-MM-dd"),
        allTime: false as const,
      };
    }
    if (rangeMode === "year") {
      const y = new Date(anchorYear, 0, 1);
      return {
        from: format(startOfYear(y), "yyyy-MM-dd"),
        to: format(endOfYear(y), "yyyy-MM-dd"),
        allTime: false as const,
      };
    }
    if (rangeMode === "vacation_year") {
      return {
        from: format(selectedVacationYear.start, "yyyy-MM-dd"),
        to: format(selectedVacationYear.end, "yyyy-MM-dd"),
        allTime: false as const,
      };
    }
    return { from: customFrom, to: customTo, allTime: false as const };
  }, [
    rangeMode,
    anchorWeek,
    anchorMonth,
    anchorYear,
    selectedVacationYear,
    customFrom,
    customTo,
  ]);

  const { data: people } = useQuery({
    queryKey: ["time-people"],
    queryFn: () => api.get<TimePerson[]>("/api/time/people"),
    enabled: canReadAll,
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<TimeProjectOpt[]>("/api/time/projects"),
    enabled: canReadAll,
  });

  const { data: parentCategories } = useQuery({
    queryKey: ["time-parent-categories"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/time/parent-categories"),
    enabled: canReadAll,
  });

  const personOptions = useMemo(
    () => (people ?? []).map((p) => ({ id: p.id, label: p.name })),
    [people]
  );
  const projectOptions = useMemo(
    () => [
      { id: "__none__", label: t("time.noProject") },
      ...(projects ?? [])
        .filter((p) => !p.isArchived)
        .map((p) => ({ id: p.id, label: p.name })),
    ],
    [projects, t]
  );
  const parentCategoryOptions = useMemo(
    () => [
      { id: "__none__", label: t("time.parentCategoryNone") },
      ...(parentCategories ?? []).map((c) => ({ id: c.id, label: c.name })),
    ],
    [parentCategories, t]
  );
  const categoryOptions = [
    { id: "work", label: t("time.categoryWork") },
    { id: "vacation", label: t("time.categoryVacation") },
    { id: "extra_vacation", label: t("time.categoryExtraVacation") },
    { id: "sick", label: t("time.categorySick") },
    { id: "holiday", label: t("time.categoryHoliday") },
    { id: "travel_allowance", label: t("time.categoryTravelAllowance") },
  ];

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (allTime) {
      params.set("all", "1");
    } else {
      params.set("from", from);
      params.set("to", to);
    }
    if (selectedPersonIds.length) params.set("personIds", selectedPersonIds.join(","));
    if (selectedProjectIds.length) params.set("projectIds", selectedProjectIds.join(","));
    if (selectedParentCategoryIds.length) {
      params.set("parentCategoryIds", selectedParentCategoryIds.join(","));
    }
    if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
    return params.toString();
  }, [
    allTime,
    from,
    to,
    selectedPersonIds,
    selectedProjectIds,
    selectedParentCategoryIds,
    selectedCategories,
  ]);

  const { data: report, isFetching, isError, error } = useQuery({
    queryKey: ["time-report", qs],
    queryFn: () => api.get<TimeReport>(`/api/time/report?${qs}`),
    enabled: canReadAll && (allTime || Boolean(from && to)),
    placeholderData: (prev) => prev,
  });

  const chart = useMemo(() => {
    if (!report) return { points: [], groupedBy: chartGroupMode };
    const range = !allTime && from && to ? { from, to } : null;
    return groupChartData(
      report.byDay,
      (week) => t("time.calendarWeekIso", { week }),
      { groupedBy: chartGroupMode, range }
    );
  }, [report, t, allTime, from, to, chartGroupMode]);
  const chartData = chart.points;
  const chartTickInterval = xAxisLabelInterval(chartData.length);

  const hasVacation = (report?.summary.vacationMinutes ?? 0) > 0;
  const hasExtraVacation = (report?.summary.extraVacationMinutes ?? 0) > 0;
  const hasSick = (report?.summary.sickMinutes ?? 0) > 0;
  const hasHoliday = (report?.summary.holidayMinutes ?? 0) > 0;
  const hasTravelAllowance = (report?.summary.travelAllowanceMinutes ?? 0) > 0;
  const showCompBalance = leaveManagementEnabled && !allTime;

  const compPeriodTotals = useMemo(() => {
    if (!report || !showCompBalance) return null;
    let delta = 0;
    let balance = 0;
    for (const p of report.byPerson) {
      delta += p.compTimePeriodDeltaMinutes ?? 0;
      balance += p.compTimeBalanceMinutes ?? 0;
    }
    return { delta: Math.round(delta), balance: Math.round(balance) };
  }, [report, showCompBalance]);

  const sortedPersons = useMemo((): TimeReportPerson[] => {
    if (!report) return [];
    const rows = report.byPerson.map((p) => {
      const contractHours = contractOverrides.has(p.personId)
        ? contractOverrides.get(p.personId)
        : p.weeklyContractHours;
      const contractMinutes =
        contractHours != null
          ? ((p.contractRangeDays ?? report.summary.rangeDays) / 7) * contractHours * 60
          : null;
      return {
        ...p,
        weeklyContractHours: contractHours ?? null,
        contractMinutes,
        overtimeMinutes: overtimeAgainstContract(
          {
            workMinutes: p.workMinutes,
            vacationMinutes: p.vacationMinutes,
            extraVacationMinutes: p.extraVacationMinutes,
            holidayMinutes: p.holidayMinutes,
          },
          contractMinutes,
          { includeLeaveInNorm: leaveManagementEnabled }
        ),
      };
    });
    return rows.sort((a, b) => {
      let cmp = 0;
      if (sortPersonBy === "name") cmp = a.personName.localeCompare(b.personName);
      else if (sortPersonBy === "total") cmp = a.totalMinutes - b.totalMinutes;
      else if (sortPersonBy === "overtime")
        cmp = (a.overtimeMinutes ?? -Infinity) - (b.overtimeMinutes ?? -Infinity);
      else if (sortPersonBy === "compDelta")
        cmp =
          (a.compTimePeriodDeltaMinutes ?? -Infinity) -
          (b.compTimePeriodDeltaMinutes ?? -Infinity);
      else if (sortPersonBy === "compBalance")
        cmp =
          (a.compTimeBalanceMinutes ?? -Infinity) - (b.compTimeBalanceMinutes ?? -Infinity);
      return sortPersonDir === "asc" ? cmp : -cmp;
    });
  }, [report, sortPersonBy, sortPersonDir, contractOverrides, leaveManagementEnabled]);

  const handleContractSaved = useCallback((personId: string, hours: number | null) => {
    setContractOverrides((prev) => new Map(prev).set(personId, hours));
  }, []);

  function togglePersonSort(col: "name" | "total" | "overtime" | "compDelta" | "compBalance") {
    if (sortPersonBy === col) setSortPersonDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortPersonBy(col);
      setSortPersonDir(col === "name" ? "asc" : "desc");
    }
  }

  const SortIcon = ({ col }: { col: string }) =>
    sortPersonBy === col ? (
      sortPersonDir === "asc" ? (
        <ChevronUp className="h-3 w-3 inline ml-0.5" />
      ) : (
        <ChevronDown className="h-3 w-3 inline ml-0.5" />
      )
    ) : null;

  const pagedEntries = useMemo(() => {
    if (!report) return [];
    const sorted = [...report.entries].sort(
      (a, b) => b.startsAt.localeCompare(a.startsAt)
    );
    return sorted.slice(entryPage * ENTRIES_PER_PAGE, (entryPage + 1) * ENTRIES_PER_PAGE);
  }, [report, entryPage]);

  const totalEntryPages = Math.ceil((report?.entries.length ?? 0) / ENTRIES_PER_PAGE);

  if (!canReadAll) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        {t("time.reportsNoAccess")}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col min-h-0 gap-2 p-2 sm:p-3 md:p-4 text-white">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/time" className="text-white/40 hover:text-white/70 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-white">{t("time.reportsTitle")}</h1>
            <p className="text-sm text-white/45 mt-0.5">{t("time.reportsSubtitle")}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-white/15 text-white/70 hover:bg-white/5 gap-2"
          disabled={!report?.entries.length}
          onClick={() => report && exportCsv(report.entries)}
        >
          <Download className="h-4 w-4" />
          {t("time.exportCsv")}
        </Button>
      </div>

      {/* Date range bar */}
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 shrink-0">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
            {visibleRangeModes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setRangeMode(m.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  rangeMode === m.id ? "bg-white/10 text-white" : "text-white/55"
                )}
              >
                {t(m.labelKey as "time.reportAllTime")}
              </button>
            ))}
          </div>

          {rangeMode === "week" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() =>
                  setAnchorWeek((d) => startOfWeek(subWeeks(d, 1), { weekStartsOn: WEEK_STARTS_ON }))
                }
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <WeekPickerButton
                weekStart={anchorWeek}
                onPick={(d) => setAnchorWeek(startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }))}
                locale={dfLocale}
                label={t("time.reportRangeWeek")}
                weekLabel={t("time.calendarWeekIso", { week: getISOWeek(anchorWeek) })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() =>
                  setAnchorWeek((d) => startOfWeek(addWeeks(d, 1), { weekStartsOn: WEEK_STARTS_ON }))
                }
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {rangeMode === "month" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorMonth((d) => startOfMonth(subMonths(d, 1)))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <MonthPickerButton
                month={anchorMonth}
                onPick={(d) => setAnchorMonth(startOfMonth(d))}
                locale={dfLocale}
                label={t("time.reportRangeMonth")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorMonth((d) => startOfMonth(addMonths(d, 1)))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {rangeMode === "year" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorYear((y) => y - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <YearPickerButton
                year={anchorYear}
                onPick={setAnchorYear}
                label={t("time.reportRangeYear")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorYear((y) => y + 1)}
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {rangeMode === "vacation_year" ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorVacationYearStart((y) => y - 1)}
                aria-label="Previous vacation year"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <YearPickerButton
                year={anchorVacationYearStart}
                onPick={setAnchorVacationYearStart}
                label={t("time.reportRangeVacationYear")}
                displayLabel={`${selectedVacationYear.key} · ${format(selectedVacationYear.start, "d MMM", { locale: dfLocale })} – ${format(selectedVacationYear.end, "d MMM yyyy", { locale: dfLocale })}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 border-white/15 text-white"
                onClick={() => setAnchorVacationYearStart((y) => y + 1)}
                aria-label="Next vacation year"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {rangeMode === "custom" ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 w-36 bg-white/5 border-white/15 text-white text-sm px-2"
              />
              <span className="text-white/40 text-sm">–</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 w-36 bg-white/5 border-white/15 text-white text-sm px-2"
              />
            </div>
          ) : null}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center mt-3 pt-3 border-t border-white/8">
          <span className="text-xs text-white/35 uppercase tracking-wider mr-1">Filter</span>
          <MultiSelect
            label="People"
            options={personOptions}
            selected={selectedPersonIds}
            onChange={setSelectedPersonIds}
          />
          <MultiSelect
            label="Projects"
            options={projectOptions}
            selected={selectedProjectIds}
            onChange={setSelectedProjectIds}
          />
          <MultiSelect
            label={t("time.reportFilterParentCategories")}
            options={parentCategoryOptions}
            selected={selectedParentCategoryIds}
            onChange={setSelectedParentCategoryIds}
          />
          <MultiSelect
            label="Category"
            options={categoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          {(selectedPersonIds.length +
            selectedProjectIds.length +
            selectedParentCategoryIds.length +
            selectedCategories.length >
            0) && (
            <button
              onClick={() => {
                setSelectedPersonIds([]);
                setSelectedProjectIds([]);
                setSelectedParentCategoryIds([]);
                setSelectedCategories([]);
              }}
              className="text-xs text-white/40 hover:text-white/70 underline"
            >
              Clear all
            </button>
          )}
          {isFetching && (
            <span className="text-xs text-white/30 ml-auto animate-pulse">Loading…</span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard
            label={t("time.reportTotalHours")}
            value={fmtMins(report.summary.totalMinutes)}
            sub={`${report.summary.entryCount} entries`}
          />
          <SummaryCard
            label={t("time.categoryWork")}
            value={fmtMins(report.summary.workMinutes)}
            color="text-blue-300"
          />
          {hasVacation && (
            <SummaryCard
              label={t("time.categoryVacation")}
              value={fmtLeaveMins(report.summary.vacationMinutes)}
              color="text-emerald-300"
            />
          )}
          {hasExtraVacation && (
            <SummaryCard
              label={t("time.categoryExtraVacation")}
              value={fmtLeaveMins(report.summary.extraVacationMinutes)}
              color="text-teal-300"
            />
          )}
          {hasSick && (
            <SummaryCard
              label={t("time.categorySick")}
              value={fmtLeaveMins(report.summary.sickMinutes)}
              color="text-orange-300"
            />
          )}
          {hasHoliday && (
            <SummaryCard
              label={t("time.categoryHoliday")}
              value={fmtLeaveMins(report.summary.holidayMinutes)}
              color="text-purple-300"
            />
          )}
          {hasTravelAllowance && (
            <SummaryCard
              label={t("time.categoryTravelAllowance")}
              value={fmtMins(report.summary.travelAllowanceMinutes)}
              color="text-amber-300"
            />
          )}
          {showCompBalance && compPeriodTotals && (
            <>
              <SummaryCard
                label={t("time.reportColCompPeriod")}
                value={fmtSignedMins(compPeriodTotals.delta)}
                color={
                  compPeriodTotals.delta > 0
                    ? "text-cyan-300"
                    : compPeriodTotals.delta < 0
                      ? "text-orange-300"
                      : "text-white/50"
                }
                sub={t("time.reportCompPeriodHint")}
              />
              <SummaryCard
                label={t("time.reportColCompBalance")}
                value={fmtCompHhhMm(compPeriodTotals.balance)}
                color="text-cyan-300"
                sub={t("time.reportCompBalanceHint")}
              />
            </>
          )}
          <SummaryCard
            label={t("time.reportPersonCount")}
            value={String(report.byPerson.length)}
            sub={`${report.summary.rangeDays} days`}
          />
        </div>
      )}

      {/* Chart */}
      {report && chartData.length > 0 && (
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs text-white/45">{t("time.reportChartShowBy")}</span>
            <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
              {CHART_GROUP_OPTIONS.filter((m) => allowedChartGroups.includes(m.id)).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setChartGroupMode(m.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs",
                    chartGroupMode === m.id ? "bg-white/10 text-white" : "text-white/55"
                  )}
                >
                  {t(m.labelKey as "time.reportChartByDay")}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="25%" barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={chartTickInterval}
                minTickGap={28}
                tickFormatter={(value) => {
                  const point = chartData.find((p) => p.key === value);
                  return point?.tick ?? value;
                }}
              />
              <YAxis
                unit="h"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  background: "#16161f",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: 12,
                }}
                labelFormatter={(_label, payload) => {
                  const point = payload?.[0]?.payload as { label?: string } | undefined;
                  return point?.label ?? _label;
                }}
                formatter={(value: number, name: string) => {
                  const map: Record<string, string> = {
                    work: t("time.categoryWork"),
                    vacation: t("time.categoryVacation"),
                    extraVacation: t("time.categoryExtraVacation"),
                    sick: t("time.categorySick"),
                    holiday: t("time.categoryHoliday"),
                    travelAllowance: t("time.categoryTravelAllowance"),
                  };
                  return [`${value}h`, map[name] ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.5)", paddingTop: 8 }}
                formatter={(v) => {
                  const map: Record<string, string> = {
                    work: t("time.categoryWork"),
                    vacation: t("time.categoryVacation"),
                    extraVacation: t("time.categoryExtraVacation"),
                    sick: t("time.categorySick"),
                    holiday: t("time.categoryHoliday"),
                    travelAllowance: t("time.categoryTravelAllowance"),
                  };
                  return map[v] ?? v;
                }}
              />
              <Bar dataKey="work" stackId="a" fill={CATEGORY_COLORS.work} radius={[0, 0, 0, 0]} />
              <Bar dataKey="vacation" stackId="a" fill={CATEGORY_COLORS.vacation} />
              <Bar dataKey="extraVacation" stackId="a" fill={CATEGORY_COLORS.extra_vacation} />
              <Bar dataKey="sick" stackId="a" fill={CATEGORY_COLORS.sick} />
              <Bar dataKey="travelAllowance" stackId="a" fill={CATEGORY_COLORS.travelAllowance} />
              <Bar dataKey="holiday" stackId="a" fill={CATEGORY_COLORS.holiday} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Main tabs */}
      {isError ? (
        <div className="text-center py-16 text-red-300 text-sm">
          {(error as Error)?.message || t("time.reportNoData")}
        </div>
      ) : report ? (
        <Tabs defaultValue="persons" className="space-y-4 min-w-0">
          <TabsList className="bg-white/[0.04] border border-white/8 h-9">
            <TabsTrigger value="persons" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabPersons")} ({report.byPerson.length})
            </TabsTrigger>
            <TabsTrigger value="projects" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabProjects")} ({report.byProject.length})
            </TabsTrigger>
            <TabsTrigger value="parentCategories" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabParentCategories")} ({report.byParentCategory.length})
            </TabsTrigger>
            <TabsTrigger value="entries" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabEntries")} ({report.entries.length})
            </TabsTrigger>
          </TabsList>

          {/* By Person */}
          <TabsContent value="persons">
            {sortedPersons.length === 0 ? (
              <div className="text-center py-16 text-white/35">{t("time.reportNoData")}</div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/[0.02]">
                        <th
                          className="text-left px-4 py-3 font-medium text-white/50 cursor-pointer hover:text-white/70 select-none"
                          onClick={() => togglePersonSort("name")}
                        >
                          {t("time.reportColPerson")} <SortIcon col="name" />
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-blue-400/70">
                          {t("time.categoryWork")}
                        </th>
                        {hasVacation && (
                          <th className="text-right px-4 py-3 font-medium text-emerald-400/70">
                            {t("time.categoryVacation")}
                          </th>
                        )}
                        {hasExtraVacation && (
                          <th className="text-right px-4 py-3 font-medium text-teal-400/70">
                            {t("time.categoryExtraVacation")}
                          </th>
                        )}
                        {hasSick && (
                          <th className="text-right px-4 py-3 font-medium text-orange-400/70">
                            {t("time.categorySick")}
                          </th>
                        )}
                        {hasHoliday && (
                          <th className="text-right px-4 py-3 font-medium text-purple-400/70">
                            {t("time.categoryHoliday")}
                          </th>
                        )}
                        {hasTravelAllowance && (
                          <th className="text-right px-4 py-3 font-medium text-amber-400/70">
                            {t("time.categoryTravelAllowance")}
                          </th>
                        )}
                        <th
                          className="text-right px-4 py-3 font-medium text-white/50 cursor-pointer hover:text-white/70 select-none"
                          onClick={() => togglePersonSort("total")}
                        >
                          {t("time.reportColTotal")} <SortIcon col="total" />
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-white/35 text-xs">
                          {t("time.reportColContract")}
                        </th>
                        <th
                          className="text-right px-4 py-3 font-medium text-white/50 cursor-pointer hover:text-white/70 select-none"
                          onClick={() => togglePersonSort("overtime")}
                        >
                          {t("time.reportColOvertime")} <SortIcon col="overtime" />
                        </th>
                        {showCompBalance && (
                          <>
                            <th
                              className="text-right px-4 py-3 font-medium text-cyan-400/70 text-xs whitespace-nowrap cursor-pointer hover:text-cyan-300/90 select-none"
                              onClick={() => togglePersonSort("compDelta")}
                            >
                              {t("time.reportColCompPeriod")} <SortIcon col="compDelta" />
                            </th>
                            <th
                              className="text-right px-4 py-3 font-medium text-cyan-400/70 text-xs whitespace-nowrap cursor-pointer hover:text-cyan-300/90 select-none"
                              onClick={() => togglePersonSort("compBalance")}
                            >
                              {t("time.reportColCompBalance")} <SortIcon col="compBalance" />
                            </th>
                          </>
                        )}
                        <th className="text-right px-4 py-3 font-medium text-emerald-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColVacUsed")}
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-emerald-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColVacLeft")}
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-teal-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColExtraUsed")}
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-teal-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColExtraLeft")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPersons.map((p, i) => (
                        <tr
                          key={p.personId}
                          className={cn(
                            "border-b border-white/5 hover:bg-white/[0.03] transition-colors",
                            i % 2 === 0 ? "" : "bg-white/[0.015]"
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-white/90">{p.personName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-300/80">
                            {fmtMins(p.workMinutes)}
                          </td>
                          {hasVacation && (
                            <td className="px-4 py-3 text-right tabular-nums text-emerald-300/80">
                              {p.vacationMinutes > 0
                                ? fmtLeaveMins(p.vacationMinutes, p.weeklyContractHours)
                                : "—"}
                            </td>
                          )}
                          {hasExtraVacation && (
                            <td className="px-4 py-3 text-right tabular-nums text-teal-300/80">
                              {p.extraVacationMinutes > 0
                                ? fmtLeaveMins(p.extraVacationMinutes, p.weeklyContractHours)
                                : "—"}
                            </td>
                          )}
                          {hasSick && (
                            <td className="px-4 py-3 text-right tabular-nums text-orange-300/80">
                              {p.sickMinutes > 0
                                ? fmtLeaveMins(p.sickMinutes, p.weeklyContractHours)
                                : "—"}
                            </td>
                          )}
                          {hasHoliday && (
                            <td className="px-4 py-3 text-right tabular-nums text-purple-300/80">
                              {p.holidayMinutes > 0
                                ? fmtLeaveMins(p.holidayMinutes, p.weeklyContractHours)
                                : "—"}
                            </td>
                          )}
                          {hasTravelAllowance && (
                            <td className="px-4 py-3 text-right tabular-nums text-amber-300/80">
                              {p.travelAllowanceMinutes > 0 ? fmtMins(p.travelAllowanceMinutes) : "—"}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                            {fmtMins(p.totalMinutes)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ContractHoursCell
                              personId={p.personId}
                              value={p.weeklyContractHours}
                              onSaved={handleContractSaved}
                            />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {p.overtimeMinutes !== null ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  p.overtimeMinutes > 0
                                    ? "text-orange-300"
                                    : p.overtimeMinutes < 0
                                    ? "text-blue-300"
                                    : "text-white/40"
                                )}
                              >
                                {p.overtimeMinutes > 0 ? "+" : ""}
                                {fmtMins(p.overtimeMinutes)}
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          {showCompBalance && (
                            <>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {p.compTimePeriodDeltaMinutes != null ? (
                                  <span
                                    className={cn(
                                      "font-medium",
                                      p.compTimePeriodDeltaMinutes > 0
                                        ? "text-cyan-300"
                                        : p.compTimePeriodDeltaMinutes < 0
                                          ? "text-orange-300"
                                          : "text-white/40"
                                    )}
                                    title={
                                      p.compTimeEarnedMinutes != null
                                        ? `${t("time.payrollColCompEarned")}: ${fmtMins(p.compTimeEarnedMinutes)} · ${t("time.categoryUnavailable")}: ${fmtMins(p.compTimeMinutes)}`
                                        : undefined
                                    }
                                  >
                                    {fmtSignedMins(p.compTimePeriodDeltaMinutes)}
                                  </span>
                                ) : (
                                  <span className="text-white/20">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap min-w-[6.5rem]">
                                {p.compTimeBalanceMinutes != null ? (
                                  <span
                                    className={cn(
                                      "font-medium",
                                      p.compTimeBalanceMinutes < 0
                                        ? "text-red-300"
                                        : "text-cyan-300/90"
                                    )}
                                  >
                                    {fmtCompHhhMm(p.compTimeBalanceMinutes)}
                                  </span>
                                ) : (
                                  <span className="text-white/20">—</span>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-300/70">
                            {p.vacationDaysUsed != null ? (
                              `${p.vacationDaysUsed}d`
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {p.vacationDaysRemaining != null ? (
                              <span className={cn(
                                "font-medium",
                                p.vacationDaysRemaining < 0 ? "text-red-300" : "text-emerald-300/80"
                              )}>
                                {p.vacationDaysRemaining}d
                              </span>
                            ) : p.vacationDaysPerYear != null ? (
                              <span className="text-emerald-300/60">{p.vacationDaysPerYear}d</span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-teal-300/70">
                            {p.extraVacationDaysUsed != null ? (
                              `${p.extraVacationDaysUsed}d`
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {p.extraVacationDaysRemaining != null ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  p.extraVacationDaysRemaining < 0 ? "text-red-300" : "text-teal-300/80"
                                )}
                              >
                                {p.extraVacationDaysRemaining}d
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/15 bg-white/[0.04]">
                        <td className="px-4 py-3 font-semibold text-white/70">Total</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-300">
                          {fmtMins(report.summary.workMinutes)}
                        </td>
                        {hasVacation && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-300">
                            {fmtLeaveMins(report.summary.vacationMinutes)}
                          </td>
                        )}
                        {hasExtraVacation && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-teal-300">
                            {fmtLeaveMins(report.summary.extraVacationMinutes)}
                          </td>
                        )}
                        {hasSick && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-300">
                            {fmtLeaveMins(report.summary.sickMinutes)}
                          </td>
                        )}
                        {hasHoliday && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-300">
                            {fmtLeaveMins(report.summary.holidayMinutes)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-white">
                          {fmtMins(report.summary.totalMinutes)}
                        </td>
                        <td />
                        <td />
                        {showCompBalance && (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-cyan-300">
                              {compPeriodTotals ? fmtSignedMins(compPeriodTotals.delta) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-cyan-300/80 whitespace-nowrap min-w-[6.5rem]">
                              {compPeriodTotals ? fmtCompHhhMm(compPeriodTotals.balance) : "—"}
                            </td>
                          </>
                        )}
                        <td />
                        <td />
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-white/30 border-t border-white/5">
                  {t(leaveManagementEnabled ? "time.reportContractHintDk" : "time.reportContractHint")}
                </p>
              </div>
            )}
          </TabsContent>

          {/* By Project */}
          <TabsContent value="projects">
            {report.byProject.length === 0 ? (
              <div className="text-center py-16 text-white/35">{t("time.reportNoData")}</div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/[0.02]">
                      <th className="text-left px-4 py-3 font-medium text-white/50">{t("time.reportColProject")}</th>
                      <th className="text-right px-4 py-3 font-medium text-white/50">{t("time.reportColTotal")}</th>
                      <th className="text-right px-4 py-3 font-medium text-white/35 text-xs">{t("time.reportColShare")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.byProject.map((p, i) => {
                      const pct =
                        report.summary.totalMinutes > 0
                          ? (p.totalMinutes / report.summary.totalMinutes) * 100
                          : 0;
                      return (
                        <tr
                          key={p.projectId ?? "__none__"}
                          className={cn(
                            "border-b border-white/5 hover:bg-white/[0.03]",
                            i % 2 === 0 ? "" : "bg-white/[0.015]"
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-white/90">
                            {p.projectId ? (
                              p.projectName
                            ) : (
                              <span className="text-white/40 italic">{t("time.noProject")}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                            {fmtMins(p.totalMinutes)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 w-32">
                            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-ordo-yellow/60 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* By Parent Category */}
          <TabsContent value="parentCategories">
            {report.byParentCategory.length === 0 ? (
              <div className="text-center py-16 text-white/35">{t("time.reportNoData")}</div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/[0.02]">
                      <th className="text-left px-4 py-3 font-medium text-white/50">
                        {t("time.parentCategoryLabel")}
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-white/50">{t("time.reportColTotal")}</th>
                      <th className="text-right px-4 py-3 font-medium text-white/35 text-xs">{t("time.reportColShare")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.byParentCategory.map((row, i) => {
                      const pct =
                        report.summary.totalMinutes > 0
                          ? (row.totalMinutes / report.summary.totalMinutes) * 100
                          : 0;
                      return (
                        <tr
                          key={row.parentCategoryId ?? "__none__"}
                          className={cn(
                            "border-b border-white/5 hover:bg-white/[0.03]",
                            i % 2 === 0 ? "" : "bg-white/[0.015]"
                          )}
                        >
                          <td className="px-4 py-3 font-medium text-white/90">
                            {row.parentCategoryName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-white">
                            {fmtMins(row.totalMinutes)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white/40 text-xs">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 w-32">
                            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-400/60 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Entries list */}
          <TabsContent value="entries">
            {report.entries.length === 0 ? (
              <div className="text-center py-16 text-white/35">{t("time.reportNoData")}</div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/[0.02]">
                          <th className="text-left px-4 py-3 font-medium text-white/50">Date</th>
                          <th className="text-left px-4 py-3 font-medium text-white/50">{t("time.reportColPerson")}</th>
                          <th className="text-left px-4 py-3 font-medium text-white/50">Project</th>
                          <th className="text-right px-4 py-3 font-medium text-white/50">Duration</th>
                          <th className="text-left px-4 py-3 font-medium text-white/50">Category</th>
                          <th className="text-left px-4 py-3 font-medium text-white/50">Tags</th>
                          <th className="text-left px-4 py-3 font-medium text-white/50">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedEntries.map((e, i) => (
                          <tr
                            key={e.id}
                            className={cn(
                              "border-b border-white/5 hover:bg-white/[0.03] transition-colors",
                              i % 2 === 0 ? "" : "bg-white/[0.015]"
                            )}
                          >
                            <td className="px-4 py-2.5 tabular-nums text-white/70 whitespace-nowrap">
                              {fmtDate(e.startsAt)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-white/90">{e.personName}</td>
                            <td className="px-4 py-2.5 text-white/60">
                              {e.projectName ?? <span className="text-white/25 italic">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-white">
                              {isLeaveDayDisplayCategory(e.category)
                                ? fmtLeaveMins(
                                    e.durationMinutes,
                                    report.byPerson.find((p) => p.personId === e.personId)
                                      ?.weeklyContractHours
                                  )
                                : fmtMins(e.durationMinutes)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded px-1.5 py-0.5 text-xs border",
                                CATEGORY_BG[e.category] ?? "bg-white/5 text-white/50"
                              )}
                              >
                                {t(timeCategoryMessageId(e.category as TimeCategory) as never)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {e.tagNames.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="border-white/15 text-white/55 text-xs px-1.5 py-0"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-white/50 max-w-xs truncate">
                              {e.note ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {totalEntryPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-white/60 hover:bg-white/5 h-8"
                      disabled={entryPage === 0}
                      onClick={() => setEntryPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-white/40">
                      {entryPage + 1} / {totalEntryPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-white/60 hover:bg-white/5 h-8"
                      disabled={entryPage >= totalEntryPages - 1}
                      onClick={() => setEntryPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : !isFetching ? (
        <div className="text-center py-20 text-white/35">{t("time.reportNoData")}</div>
      ) : null}
    </div>
  );
}
