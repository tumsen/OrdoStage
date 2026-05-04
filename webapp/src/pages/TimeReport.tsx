import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  startOfYear,
  endOfYear,
  parseISO,
  startOfDay,
} from "date-fns";
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
import { cn } from "@/lib/utils";
import type {
  TimeReport,
  TimeReportPerson,
  TimeReportEntry,
} from "@/contracts/backendTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMins(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  const sign = minutes < 0 ? "-" : "";
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

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
  sick: "#f97316",
  holiday: "#a855f7",
};

const CATEGORY_BG: Record<string, string> = {
  work: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  vacation: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  sick: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  holiday: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function today(): Date {
  return startOfDay(new Date());
}

type DatePreset = "this_week" | "last_week" | "this_month" | "last_month" | "last_3_months" | "this_year" | "custom";

function presetRange(preset: DatePreset): { from: Date; to: Date } {
  const now = today();
  switch (preset) {
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const lw = subWeeks(now, 1);
      return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "last_3_months":
      return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
    case "this_year":
      return { from: startOfYear(now), to: endOfYear(now) };
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
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
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

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
        <Input
          autoFocus
          type="number"
          min="0"
          max="168"
          step="0.5"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = draft.trim() === "" ? null : parseFloat(draft);
              if (n !== null && isNaN(n)) return;
              save.mutate(n);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-20 bg-white/5 border-white/15 text-white text-xs px-2"
          placeholder="37.5"
        />
        <button
          onClick={() => {
            const n = draft.trim() === "" ? null : parseFloat(draft);
            if (n !== null && isNaN(n)) return;
            save.mutate(n);
          }}
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
        setDraft(value !== null ? String(value) : "");
        setEditing(true);
      }}
      className="flex items-center gap-1 text-white/60 hover:text-white/90 group"
    >
      <span className="tabular-nums">{value !== null ? `${value}h/wk` : "—"}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ─── Chart grouping ───────────────────────────────────────────────────────────

function groupChartData(
  byDay: TimeReport["byDay"],
  rangeDays: number
): { key: string; work: number; vacation: number; sick: number; holiday: number }[] {
  if (rangeDays <= 31) {
    return byDay.map((d) => ({
      key: format(parseISO(d.date), "d MMM"),
      work: +(d.workMinutes / 60).toFixed(2),
      vacation: +(d.vacationMinutes / 60).toFixed(2),
      sick: +(d.sickMinutes / 60).toFixed(2),
      holiday: +(d.holidayMinutes / 60).toFixed(2),
    }));
  }
  // group by week
  const weeks = new Map<
    string,
    { work: number; vacation: number; sick: number; holiday: number }
  >();
  for (const d of byDay) {
    const wk = format(startOfWeek(parseISO(d.date), { weekStartsOn: 1 }), "d MMM");
    if (!weeks.has(wk)) weeks.set(wk, { work: 0, vacation: 0, sick: 0, holiday: 0 });
    const w = weeks.get(wk)!;
    w.work += d.workMinutes;
    w.vacation += d.vacationMinutes;
    w.sick += d.sickMinutes;
    w.holiday += d.holidayMinutes;
  }
  return [...weeks.entries()].map(([key, w]) => ({
    key,
    work: +(w.work / 60).toFixed(2),
    vacation: +(w.vacation / 60).toFixed(2),
    sick: +(w.sick / 60).toFixed(2),
    holiday: +(w.holiday / 60).toFixed(2),
  }));
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

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_year", label: "This year" },
];

export default function TimeReport() {
  const { t } = useI18n();
  const { canAction } = usePermissions();
  const canReadAll = canAction("time.read_all");

  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [entryPage, setEntryPage] = useState(0);
  const ENTRIES_PER_PAGE = 50;
  const [sortPersonBy, setSortPersonBy] = useState<"name" | "total" | "overtime">("name");
  const [sortPersonDir, setSortPersonDir] = useState<"asc" | "desc">("asc");
  const [contractOverrides, setContractOverrides] = useState<Map<string, number | null>>(new Map());

  const { from, to } = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    const r = presetRange(preset);
    return { from: format(r.from, "yyyy-MM-dd"), to: format(r.to, "yyyy-MM-dd") };
  }, [preset, customFrom, customTo]);

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

  const personOptions = useMemo(
    () => (people ?? []).map((p) => ({ id: p.id, label: p.name })),
    [people]
  );
  const projectOptions = useMemo(
    () =>
      (projects ?? [])
        .filter((p) => !p.isArchived)
        .map((p) => ({ id: p.id, label: p.name })),
    [projects]
  );
  const categoryOptions = [
    { id: "work", label: t("time.categoryWork") },
    { id: "vacation", label: t("time.categoryVacation") },
    { id: "sick", label: t("time.categorySick") },
    { id: "holiday", label: t("time.categoryHoliday") },
  ];

  const qs = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (selectedPersonIds.length) params.set("personIds", selectedPersonIds.join(","));
    if (selectedProjectIds.length) params.set("projectIds", selectedProjectIds.join(","));
    if (selectedCategories.length) params.set("categories", selectedCategories.join(","));
    return params.toString();
  }, [from, to, selectedPersonIds, selectedProjectIds, selectedCategories]);

  const { data: report, isFetching } = useQuery({
    queryKey: ["time-report", qs],
    queryFn: () => api.get<TimeReport>(`/api/time/report?${qs}`),
    enabled: canReadAll && Boolean(from && to),
    placeholderData: (prev) => prev,
  });

  const chartData = useMemo(
    () => report ? groupChartData(report.byDay, report.summary.rangeDays) : [],
    [report]
  );

  const hasVacation = (report?.summary.vacationMinutes ?? 0) > 0;
  const hasSick = (report?.summary.sickMinutes ?? 0) > 0;
  const hasHoliday = (report?.summary.holidayMinutes ?? 0) > 0;

  const sortedPersons = useMemo((): TimeReportPerson[] => {
    if (!report) return [];
    const rows = report.byPerson.map((p) => {
      const contractHours = contractOverrides.has(p.personId)
        ? contractOverrides.get(p.personId)
        : p.weeklyContractHours;
      const contractMinutes =
        contractHours != null ? (report.summary.rangeDays / 7) * contractHours * 60 : null;
      return {
        ...p,
        weeklyContractHours: contractHours ?? null,
        contractMinutes,
        overtimeMinutes: contractMinutes != null ? p.workMinutes - contractMinutes : null,
      };
    });
    return rows.sort((a, b) => {
      let cmp = 0;
      if (sortPersonBy === "name") cmp = a.personName.localeCompare(b.personName);
      else if (sortPersonBy === "total") cmp = a.totalMinutes - b.totalMinutes;
      else if (sortPersonBy === "overtime")
        cmp = (a.overtimeMinutes ?? -Infinity) - (b.overtimeMinutes ?? -Infinity);
      return sortPersonDir === "asc" ? cmp : -cmp;
    });
  }, [report, sortPersonBy, sortPersonDir, contractOverrides]);

  const handleContractSaved = useCallback((personId: string, hours: number | null) => {
    setContractOverrides((prev) => new Map(prev).set(personId, hours));
  }, []);

  function togglePersonSort(col: "name" | "total" | "overtime") {
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
    <div className="min-h-screen bg-[#0d0d14] text-white px-4 md:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                preset === p.id
                  ? "bg-ordo-yellow text-[#0d0d14] font-medium"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPreset("custom")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-colors",
              preset === "custom"
                ? "bg-ordo-yellow text-[#0d0d14] font-medium"
                : "text-white/60 hover:text-white hover:bg-white/8"
            )}
          >
            Custom
          </button>
          {preset === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-36 bg-white/5 border-white/15 text-white text-sm px-2"
              />
              <span className="text-white/40 text-sm">–</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-36 bg-white/5 border-white/15 text-white text-sm px-2"
              />
            </div>
          )}
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
            label="Category"
            options={categoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          {(selectedPersonIds.length + selectedProjectIds.length + selectedCategories.length > 0) && (
            <button
              onClick={() => {
                setSelectedPersonIds([]);
                setSelectedProjectIds([]);
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
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
              value={fmtMins(report.summary.vacationMinutes)}
              color="text-emerald-300"
            />
          )}
          {hasSick && (
            <SummaryCard
              label={t("time.categorySick")}
              value={fmtMins(report.summary.sickMinutes)}
              color="text-orange-300"
            />
          )}
          {hasHoliday && (
            <SummaryCard
              label={t("time.categoryHoliday")}
              value={fmtMins(report.summary.holidayMinutes)}
              color="text-purple-300"
            />
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
        <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-medium text-white/70 mb-4">{t("time.reportChartTitle")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="25%" barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
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
                formatter={(value: number, name: string) => [
                  `${value}h`,
                  name.charAt(0).toUpperCase() + name.slice(1),
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.5)", paddingTop: 8 }}
                formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              />
              <Bar dataKey="work" stackId="a" fill={CATEGORY_COLORS.work} radius={[0, 0, 0, 0]} />
              <Bar dataKey="vacation" stackId="a" fill={CATEGORY_COLORS.vacation} />
              <Bar dataKey="sick" stackId="a" fill={CATEGORY_COLORS.sick} />
              <Bar dataKey="holiday" stackId="a" fill={CATEGORY_COLORS.holiday} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Main tabs */}
      {report ? (
        <Tabs defaultValue="persons" className="space-y-4">
          <TabsList className="bg-white/[0.04] border border-white/8 h-9">
            <TabsTrigger value="persons" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabPersons")} ({report.byPerson.length})
            </TabsTrigger>
            <TabsTrigger value="projects" className="text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">
              {t("time.reportTabProjects")} ({report.byProject.length})
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
                        <th className="text-right px-4 py-3 font-medium text-emerald-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColVacUsed")}
                        </th>
                        <th className="text-right px-4 py-3 font-medium text-emerald-400/60 text-xs whitespace-nowrap">
                          {t("time.reportColVacLeft")}
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
                              {p.vacationMinutes > 0 ? fmtMins(p.vacationMinutes) : "—"}
                            </td>
                          )}
                          {hasSick && (
                            <td className="px-4 py-3 text-right tabular-nums text-orange-300/80">
                              {p.sickMinutes > 0 ? fmtMins(p.sickMinutes) : "—"}
                            </td>
                          )}
                          {hasHoliday && (
                            <td className="px-4 py-3 text-right tabular-nums text-purple-300/80">
                              {p.holidayMinutes > 0 ? fmtMins(p.holidayMinutes) : "—"}
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
                            {fmtMins(report.summary.vacationMinutes)}
                          </td>
                        )}
                        {hasSick && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-300">
                            {fmtMins(report.summary.sickMinutes)}
                          </td>
                        )}
                        {hasHoliday && (
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-300">
                            {fmtMins(report.summary.holidayMinutes)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-white">
                          {fmtMins(report.summary.totalMinutes)}
                        </td>
                        <td />
                        <td />
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="px-4 py-2 text-xs text-white/30 border-t border-white/5">
                  {t("time.reportContractHint")}
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
                              {fmtMins(e.durationMinutes)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded px-1.5 py-0.5 text-xs border",
                                  CATEGORY_BG[e.category] ?? "bg-white/5 text-white/50"
                                )}
                              >
                                {t(`time.category${e.category.charAt(0).toUpperCase()}${e.category.slice(1)}` as never)}
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
