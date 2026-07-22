import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getISOWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Locale } from "date-fns";
import { da as localeDa, de as localeDe, enGB as localeEnGB } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { isCountryFeatureEnabled } from "@/lib/countryFeatures";
import type { OrganizationCountryFeatures } from "@/lib/countryFeatures";
import {
  resolveVacationYear,
  vacationYearFromStartYear,
  DEFAULT_VACATION_YEAR_POLICY,
} from "@/lib/leaveNorms";
import type { OrganizationLeavePolicy, PayrollExport } from "@/contracts/backendTypes";
import { formatDurationHoursBoth, formatMinutesAsDurationBoth } from "@/lib/durationHours";
import { commaDecimalForLanguage } from "@/lib/timeGrid";

type RangeMode = "week" | "month" | "year" | "vacation_year" | "custom";

const WEEK_STARTS_ON = 1 as const;

const RANGE_MODES: { id: RangeMode; labelKey: string }[] = [
  { id: "week", labelKey: "time.payrollRangeWeek" },
  { id: "month", labelKey: "time.payrollRangeMonth" },
  { id: "year", labelKey: "time.payrollRangeYear" },
  { id: "vacation_year", labelKey: "time.payrollRangeVacationYear" },
  { id: "custom", labelKey: "time.payrollRangeCustom" },
];

function fmtMins(minutes: number, commaDecimal = false): string {
  return formatMinutesAsDurationBoth(minutes, commaDecimal);
}

/** Comp balances as dual duration formats. */
function fmtCompHhhMm(minutes: number, commaDecimal = false): string {
  return formatMinutesAsDurationBoth(minutes, commaDecimal);
}

function fmtDays(days: number): string {
  return `${days.toFixed(2).replace(/\.?0+$/, "")}d`;
}

function today(): Date {
  return startOfDay(new Date());
}

function buildCsv(data: PayrollExport, lang: string): string {
  const da = lang === "da";
  const commaDec = commaDecimalForLanguage(lang === "da" || lang === "de" ? lang : "en");
  const headers = da
    ? [
        "Navn",
        "Ugentlig norm",
        "Arbejdstimer",
        "Overarbejde",
        "Optjent ferie (periode)",
        "Afholdt ferie (periode)",
        "Restferie (saldo)",
        "Feriefridag brugt (periode)",
        "Feriefridag rest",
        "Afspadsering optjent",
        "Afspadsering brugt",
        "Afspadsering rest",
        "Sygedage (periode)",
        "Godkendt",
      ]
    : [
        "Name",
        "Weekly norm",
        "Work hours",
        "Overtime",
        "Vacation earned (period)",
        "Vacation used (period)",
        "Vacation remaining (balance)",
        "Extra vacation used (period)",
        "Extra vacation remaining",
        "Comp time earned",
        "Comp time used",
        "Comp time remaining",
        "Sick days (period)",
        "Approved",
      ];

  const rows = data.people.map((p) => [
    p.personName,
    p.weeklyContractHours != null ? formatDurationHoursBoth(p.weeklyContractHours, commaDec) : "",
    fmtMins(p.workMinutes, commaDec),
    p.overtimeMinutes != null ? fmtMins(p.overtimeMinutes, commaDec) : "",
    fmtDays(p.vacationEarnedDays),
    fmtDays(p.vacationUsedDays),
    fmtDays(p.vacationRemainingDays),
    fmtDays(p.extraVacationUsedDays),
    fmtDays(p.extraVacationRemainingDays),
    fmtMins(p.compTimeEarnedMinutes, commaDec),
    fmtMins(p.compTimeUsedMinutes, commaDec),
    fmtCompHhhMm(p.compTimeRemainingMinutes, commaDec),
    fmtDays(p.sickDays),
    p.timesheetApproved ? (da ? "Ja" : "Yes") : da ? "Nej" : "No",
  ]);

  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

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

export default function TimePayroll() {
  const { t, language } = useI18n();
  const { canAction } = usePermissions();
  const readAll = canAction("time.read_all");

  const dfLocale = language === "da" ? localeDa : language === "de" ? localeDe : localeEnGB;
  const commaDec = commaDecimalForLanguage(language);
  const fmtM = (minutes: number) => formatMinutesAsDurationBoth(minutes, commaDec);
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
  const [approvedOnly, setApprovedOnly] = useState(false);

  const { data: orgFeatures } = useQuery<{ countryFeatures?: OrganizationCountryFeatures }>({
    queryKey: ["org"],
    queryFn: () => api.get<{ countryFeatures?: OrganizationCountryFeatures }>("/api/org"),
    enabled: readAll,
  });
  const leaveManagementEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "leaveManagement"
  );

  const { data: leavePolicy } = useQuery({
    queryKey: ["org-leave-policy"],
    queryFn: () => api.get<OrganizationLeavePolicy>("/api/org/leave-policy"),
    enabled: readAll && leaveManagementEnabled,
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

  const { from, to } = useMemo(() => {
    if (rangeMode === "week") {
      const start = startOfWeek(anchorWeek, { weekStartsOn: WEEK_STARTS_ON });
      const end = endOfWeek(anchorWeek, { weekStartsOn: WEEK_STARTS_ON });
      return {
        from: format(start, "yyyy-MM-dd"),
        to: format(end, "yyyy-MM-dd"),
      };
    }
    if (rangeMode === "month") {
      return {
        from: format(startOfMonth(anchorMonth), "yyyy-MM-dd"),
        to: format(endOfMonth(anchorMonth), "yyyy-MM-dd"),
      };
    }
    if (rangeMode === "year") {
      const y = new Date(anchorYear, 0, 1);
      return {
        from: format(startOfYear(y), "yyyy-MM-dd"),
        to: format(endOfYear(y), "yyyy-MM-dd"),
      };
    }
    if (rangeMode === "vacation_year") {
      return {
        from: format(selectedVacationYear.start, "yyyy-MM-dd"),
        to: format(selectedVacationYear.end, "yyyy-MM-dd"),
      };
    }
    return { from: customFrom, to: customTo };
  }, [
    rangeMode,
    anchorWeek,
    anchorMonth,
    anchorYear,
    selectedVacationYear,
    customFrom,
    customTo,
  ]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["time-payroll-export", from, to, approvedOnly],
    queryFn: () =>
      api.get<PayrollExport>(
        `/api/time/payroll-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&approvedOnly=${approvedOnly ? "1" : "0"}`
      ),
    enabled: readAll && leaveManagementEnabled && Boolean(from) && Boolean(to),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(data, language);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${data.from}-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = useMemo(() => data?.people ?? [], [data]);

  if (!readAll) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm text-white/55">{t("time.reportsNoAccess")}</p>
      </div>
    );
  }

  if (orgFeatures && !leaveManagementEnabled) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm text-white/55">{t("time.payrollFeatureDisabled")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/time"
            className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("time.backToTime")}
          </Link>
          <h1 className="text-xl font-semibold text-white">{t("time.payrollTitle")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("time.payrollSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 text-white/70 gap-1.5"
          disabled={!data || rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="h-4 w-4" />
          {t("time.exportCsv")}
        </Button>
      </div>

      <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 shrink-0">
        <div className="flex flex-wrap gap-3 items-end">
        <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
          {RANGE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setRangeMode(m.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                rangeMode === m.id ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              {t(m.labelKey as "time.payrollRangeMonth")}
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
              label={t("time.payrollRangeWeek")}
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
              label={t("time.payrollRangeMonth")}
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
              label={t("time.payrollRangeYear")}
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
              label={t("time.payrollRangeVacationYear")}
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

        <label className="flex items-center gap-2 text-sm text-white/60 pb-1">
          <Checkbox checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
          {t("time.payrollApprovedOnly")}
        </label>
        {data?.vacationYearKey ? (
          <p className="text-xs text-white/40 pb-1 ml-auto">
            {t("time.payrollVacationYear")}: <span className="text-white/70">{data.vacationYearKey}</span>
          </p>
        ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-300">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40">{t("time.payrollNoData")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm text-left min-w-[1280px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
                <th className="px-3 py-2.5 font-medium">{t("time.reportColPerson")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColNorm")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColWork")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColOvertime")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacEarned")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacUsed")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacLeft")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColExtraUsed")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColExtraLeft")}</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap min-w-[6.5rem]">
                  {t("time.payrollColCompLeft")}
                </th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColSick")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColApproved")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.personId} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white">{p.personName}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">
                    {p.weeklyContractHours != null
                      ? formatDurationHoursBoth(p.weeklyContractHours, commaDec)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtM(p.workMinutes)}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">
                    {p.overtimeMinutes != null ? fmtM(p.overtimeMinutes) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-emerald-300/80">{fmtDays(p.vacationEarnedDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtDays(p.vacationUsedDays)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      p.vacationRemainingDays < 0 ? "text-red-300" : "text-emerald-300/80"
                    )}
                  >
                    {fmtDays(p.vacationRemainingDays)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtDays(p.extraVacationUsedDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-teal-300/80">{fmtDays(p.extraVacationRemainingDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-cyan-300/80 whitespace-nowrap min-w-[6.5rem]">
                    {fmtM(p.compTimeRemainingMinutes)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-orange-300/80">{fmtDays(p.sickDays)}</td>
                  <td className="px-3 py-2 text-white/50">{p.timesheetApproved ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
