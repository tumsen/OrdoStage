import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { Link } from "react-router-dom";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Locale } from "date-fns";
import { da as localeDa, de as localeDe, enGB as localeEnGB } from "date-fns/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  BarChart2,
  ArrowRightLeft,
  FolderKanban,
  FileSpreadsheet,
  Upload,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreferences } from "@/hooks/usePreferences";
import { useI18n } from "@/lib/i18n";
import { toast, useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { timeCategoryMessageId, isDayOffCategory, isLeaveAutoProjectCategory } from "@/lib/timeCategoryI18n";
import { displayHex, hexToRgba } from "@/lib/timeCatalogColors";
import { TimeEntryEditSheet } from "@/components/time/TimeEntryEditSheet";
import { TimeCatalogSettings } from "@/components/time/TimeCatalogSettings";
import { TravelClaimsPanel } from "@/components/time/TravelClaimsPanel";
import { MileageClaimsPanel } from "@/components/time/MileageClaimsPanel";
import { LeaveLedgerMenu } from "@/components/time/LeaveLedgerPanel";
import { isCountryFeatureEnabled } from "@/lib/countryFeatures";
import type { OrganizationCountryFeatures } from "@/lib/countryFeatures";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { CalendarGrid } from "@/components/schedule/CalendarGrid";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";
import { internalBookingDisplayTitle } from "@/components/schedule/scheduleUtils";
import type {
  TimeCategory,
  TimeEntry,
  TimeProject,
  TimeTag,
  TimeTrackingJob,
  TimesheetApproval,
  LeaveBalanceSummary,
} from "@/contracts/backendTypes";
import type { Language, TimeFormat } from "@/lib/preferences";
import { calendarDateKeyFromJobDate } from "@/lib/showTiming";
import { addMinutesToUtcIso, wallClockYmdHhMmToUtcIso } from "@/lib/browserUserTime";
import {
  formatWorkDayDuration,
  workDayDurationMinutes,
} from "@/lib/leaveNorms";
import {
  MINUTES_PER_DAY,
  TIME_SNAP_MINUTES,
  bottomBoundaryLabel,
  clampMinutesToDay,
  columnDayYmdForInstant,
  commaDecimalForLanguage,
  dateFromColumnAndWindowMinutes,
  formatHourLabel,
  formatOneDecimalHour,
  formatTotalMinutesAsHHMM,
  minutesFromWindowStart,
  layoutTimeEntryBlocks,
  rangeMetricsInColumn,
  rangeOverlapsColumnWindow,
  rawWindowMinutesFromY,
  snapWindowMinutes,
} from "@/lib/timeGrid";
import {
  CALENDAR_GRID_SCROLLER_CLASS,
  CALENDAR_PANEL_FLEX_COLUMN_CLASS,
  CALENDAR_PANEL_SHELL_CLASS,
  CALENDAR_PX_PER_HOUR,
  CALENDAR_STICKY_HEADER_CHROME,
  CALENDAR_TIME_GRID_TOP_PAD_PX,
  findColumnIndexAtX,
  WEEK_GRID_MIN_DRAG_PX,
} from "@/lib/weekGridColumns";

const WEEK_STARTS_ON = 1 as const;
const PX_PER_HOUR = CALENDAR_PX_PER_HOUR;
/** Matches backend `tourPlanJobId` / `TimeTrackingJob.id` for tour roster rows. */
const TOUR_PLAN_JOB_PREFIX = "tourshow:";
const TOUR_EVENT_PREFIX = "tourevent:";
const EVT_STAFF_PREFIX = "evtstaff:";
const IBOOKP_PREFIX = "ibookp:";

function plannedJobKeyFromEntry(e: TimeEntry): string | null {
  if (e.eventShowJobId) return e.eventShowJobId;
  if (e.tourScheduleEventId) return `${TOUR_EVENT_PREFIX}${e.tourScheduleEventId}`;
  if (e.tourShowId) return `${TOUR_PLAN_JOB_PREFIX}${e.tourShowId}`;
  if (e.eventShowStaffingId) return `${EVT_STAFF_PREFIX}${e.eventShowStaffingId}`;
  if (e.internalBookingPersonId && e.internalBookingDayKey) {
    return `${IBOOKP_PREFIX}${e.internalBookingPersonId}:${e.internalBookingDayKey}`;
  }
  return null;
}

/** Fill/border strength: stacked layers behind the top entry are more transparent (venue-booking style). */
function timeEntryBlockSurfaceClass(
  cat: TimeCategory,
  isJob: boolean,
  stackIndex: number,
  stackCount: number
): string {
  const behind = stackCount > 1 && stackIndex < stackCount - 1;
  if (cat === "vacation") {
    return behind
      ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-50/85"
      : "border-emerald-400/60 bg-emerald-500/30 text-emerald-50";
  }
  if (cat === "sick") {
    return behind
      ? "border-orange-400/30 bg-orange-500/12 text-orange-50/85"
      : "border-orange-400/60 bg-orange-500/30 text-orange-50";
  }
  if (cat === "holiday") {
    return behind
      ? "border-purple-400/30 bg-purple-500/12 text-purple-50/85"
      : "border-purple-400/60 bg-purple-500/30 text-purple-50";
  }
  if (cat === "extra_vacation") {
    return behind
      ? "border-teal-400/30 bg-teal-500/12 text-teal-50/85"
      : "border-teal-400/60 bg-teal-500/30 text-teal-50";
  }
  if (cat === "comp_time") {
    return behind
      ? "border-cyan-400/30 bg-cyan-500/12 text-cyan-50/85"
      : "border-cyan-400/60 bg-cyan-500/30 text-cyan-50";
  }
  if (cat === "travel_allowance") {
    return behind
      ? "border-amber-400/30 bg-amber-500/10 text-amber-50/85"
      : "border-amber-400/60 bg-amber-500/25 text-amber-50";
  }
  if (isJob) {
    return behind
      ? "border-emerald-400/35 bg-emerald-500/12 text-emerald-50/85"
      : "border-emerald-400/50 bg-emerald-500/25 text-emerald-50";
  }
  return behind
    ? "border-sky-400/35 bg-sky-500/12 text-sky-50/85"
    : "border-sky-400/50 bg-sky-500/25 text-sky-50";
}

/**
 * Tour jobs from the API encode `startTime` as wall-clock on the tour calendar day; the grid uses
 * local `windowStartForColumnDay`. Rebuild start/end as local Date (same idea as tour calendar items).
 */
function tourPlannedRangeLocal(job: TimeTrackingJob): { start: Date; end: Date } | null {
  if (job.source !== "tour") return null;
  const dayKey = calendarDateKeyFromJobDate(
    job.jobDate,
    typeof job.showDate === "string" ? job.showDate.slice(0, 10) : ""
  );
  const [y, mo, d] = dayKey.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const tm = /^(\d{1,2}):(\d{2})/.exec(job.startTime.trim());
  if (!tm) return null;
  let hh = Number.parseInt(tm[1], 10);
  let mm = Number.parseInt(tm[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  const start = new Date(y, mo - 1, d, hh, mm, 0, 0);
  const end = new Date(start.getTime() + Math.max(1, job.durationMinutes) * 60_000);
  return { start, end };
}

function plannedJobDisplayRange(job: TimeTrackingJob): { start: Date; end: Date } {
  const t = tourPlannedRangeLocal(job);
  if (t) return t;
  return { start: parseISO(job.plannedStartsAt), end: parseISO(job.plannedEndsAt) };
}

/** Tour schedule-event planned rows (`tourScheduleEventId`): hide dashed slot when a tour entry overlaps this window (legacy rows without `tourScheduleEventId`). */
function tourPlannedSlotOverlapsTourEntry(job: TimeTrackingJob, entries: TimeEntry[] | undefined): boolean {
  if (!job.tourShowId) return false;
  const range = tourPlannedRangeLocal(job);
  if (!range) return false;
  const js = range.start;
  const je = range.end;
  for (const e of entries ?? []) {
    if (e.tourShowId !== job.tourShowId) continue;
    const es = parseISO(e.startsAt);
    const en = parseISO(e.endsAt);
    if (es < je && en > js) return true;
  }
  return false;
}

function plannedJobIsLogged(
  job: TimeTrackingJob,
  entryByJobId: Map<string, TimeEntry>,
  entries: TimeEntry[] | undefined
): boolean {
  const isTourScheduleRow =
    job.source === "tour" &&
    job.tourShowId &&
    (Boolean(job.tourScheduleEventId) || job.id.startsWith(TOUR_EVENT_PREFIX));
  if (isTourScheduleRow) {
    if (entryByJobId.has(job.id)) return true;
    return tourPlannedSlotOverlapsTourEntry(job, entries);
  }
  return entryByJobId.has(job.id);
}
const COLUMN_HEIGHT_PX = (MINUTES_PER_DAY / 60) * PX_PER_HOUR;
/** Same height for corner spacer and day headers so the hour grid lines up with columns. */
const WEEK_GRID_HEADER_CLASS =
  "min-h-[6.75rem] shrink-0 border-b border-white/10 box-border flex flex-col items-stretch justify-center gap-0.5 px-1.5 py-2";

function dateFnsLocale(language: Language): Locale {
  if (language === "da") return localeDa;
  if (language === "de") return localeDe;
  return localeEnGB;
}

function dateFromISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

const DISPLAY_START_STORAGE_KEY = "timeGrid.displayStartHour";
const TIME_TRACKING_VIEW_MODES = ["week", "month"] as const;

function readDisplayStartHour(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(DISPLAY_START_STORAGE_KEY);
  const n = v !== null ? Number.parseInt(v, 10) : 0;
  if (!Number.isFinite(n) || n < 0 || n > 23) return 0;
  return n;
}

type EntryDragRef = {
  entryId: string;
  kind: "move" | "resizeEnd" | "resizeStart";
  origStartWinMin: number;
  origEndWinMin: number;
  dayYmd: string;
  startDayIndex: number;
  origStartsAtIso: string;
  origEndsAtIso: string;
  durationMin: number;
  /** Keep leave-day length exact while dragging (end = start + duration). */
  preserveExactDuration?: boolean;
  moveStartClientX?: number;
  moveStartClientY?: number;
  moveThresholdPassed?: boolean;
};

type CreateDragRef = {
  startDayIndex: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  currentDayIndex: number;
  thresholdPassed: boolean;
};

function formatDurationShort(totalMin: number, exact = false): string {
  const m = exact
    ? Math.round(totalMin)
    : Math.round(totalMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  if (!Number.isFinite(m) || m <= 0) return "0 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

function dayOffHeaderLabel(
  startsAt: string,
  endsAt: string,
  timeFormat: TimeFormat
): { range: string; duration: string } {
  const s = parseISO(startsAt);
  const e = parseISO(endsAt);
  const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
  const durMin = Math.round((e.getTime() - s.getTime()) / 60000);
  return {
    range: `${format(s, tf)} – ${format(e, tf)}`,
    duration: formatDurationShort(durMin, true),
  };
}

/** Snap local wall-clock to grid for on-block labels. */
function snapLocalClockToGrid(d: Date): Date {
  const x = new Date(d.getTime());
  let mins = x.getHours() * 60 + x.getMinutes();
  mins = Math.round(mins / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  mins = Math.min(mins, MINUTES_PER_DAY);
  x.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return x;
}

export default function TimeTracking() {
  const { t, language } = useI18n();
  const dfLocale = useMemo(() => dateFnsLocale(language), [language]);
  const commaDec = useMemo(() => commaDecimalForLanguage(language), [language]);
  const queryClient = useQueryClient();
  const { effective } = usePreferences();
  const timeFormat: TimeFormat = effective?.timeFormat ?? "24h";
  const { canView, canAction } = usePermissions();
  const canUsePage = canView("time");
  const canEdit = canAction("time.write");
  const readAll = canAction("time.read_all");
  const canManageTimeCatalog = canAction("time.manage_catalog");

  const { data: orgFeatures } = useQuery<{ countryFeatures?: OrganizationCountryFeatures }>({
    queryKey: ["org", "features"],
    queryFn: () => api.get<{ countryFeatures?: OrganizationCountryFeatures }>("/api/org"),
    enabled: canUsePage,
    staleTime: 60_000,
  });
  const travelAllowanceEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "travelAllowance"
  );
  const mileageAllowanceEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "mileageAllowance"
  );
  const leaveManagementEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "leaveManagement"
  );

  const [mode, setMode] = usePersistedViewMode(
    "ordo.viewMode.timeTracking",
    TIME_TRACKING_VIEW_MODES,
    "week",
  );
  const [section, setSection] = useState<"time" | "travel" | "mileage">("time");
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    if (!travelAllowanceEnabled && section === "travel") {
      setSection("time");
    }
    if (!mileageAllowanceEnabled && section === "mileage") {
      setSection("time");
    }
  }, [travelAllowanceEnabled, mileageAllowanceEnabled, section]);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(true);
  /** Collapsed by default so the week grid matches Schedule height (upcoming + catalog live here). */
  const [weekBottomOpen, setWeekBottomOpen] = useState(false);
  const [displayStartHour, setDisplayStartHour] = useState(readDisplayStartHour);
  const displayStartHourRef = useRef(displayStartHour);
  const isMobile = useIsMobile();
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_START_STORAGE_KEY, String(displayStartHour));
  }, [displayStartHour]);

  useEffect(() => {
    displayStartHourRef.current = displayStartHour;
  }, [displayStartHour]);

  const weekStart = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );
  const weekDayYmds = useMemo(
    () => weekDays.map((d) => format(d, "yyyy-MM-dd")),
    [weekDays]
  );
  const weekStartKey = format(weekStart, "yyyy-MM-dd");
  useEffect(() => {
    const todayYmd = format(new Date(), "yyyy-MM-dd");
    const idx = weekDayYmds.indexOf(todayYmd);
    setSelectedDayIndex(idx >= 0 ? idx : 0);
  }, [weekStartKey, weekDayYmds]);

  const mobileDaySchedule = isMobile && section === "time" && mode === "week";
  const mobileTimeGridTopPad = 4;

  const [mobilePxPerHour, setMobilePxPerHour] = useState(10);
  const [mobileGridAreaPx, setMobileGridAreaPx] = useState(0);
  const mobileCalendarPanelRef = useRef<HTMLDivElement>(null);
  const mobileDayHeaderRef = useRef<HTMLDivElement>(null);
  const columnHeightPxRef = useRef(COLUMN_HEIGHT_PX);

  const effectiveTopPad = mobileDaySchedule ? mobileTimeGridTopPad : CALENDAR_TIME_GRID_TOP_PAD_PX;
  const effectivePxPerHour = mobileDaySchedule ? mobilePxPerHour : PX_PER_HOUR;
  const effectiveColumnHeightPx = (MINUTES_PER_DAY / 60) * effectivePxPerHour;
  const effectiveColumnFrameHeightPx =
    mobileDaySchedule && mobileGridAreaPx > 0
      ? mobileGridAreaPx
      : effectiveColumnHeightPx + effectiveTopPad;

  columnHeightPxRef.current = effectiveColumnHeightPx;

  const { dismiss: dismissToasts } = useToast();

  const timeNotify = useCallback(
    (props: Parameters<typeof toast>[0]) => {
      if (mobileDaySchedule && props.variant !== "destructive") return;
      toast(props);
    },
    [mobileDaySchedule]
  );

  useEffect(() => {
    if (mobileDaySchedule) dismissToasts();
  }, [mobileDaySchedule]); // eslint-disable-line react-hooks/exhaustive-deps -- dismiss once when entering mobile day view

  useLayoutEffect(() => {
    if (!mobileDaySchedule) return;
    const panel = mobileCalendarPanelRef.current;
    if (!panel) return;
    const measure = () => {
      const headerH = mobileDayHeaderRef.current?.offsetHeight ?? 0;
      const gridArea = panel.clientHeight - headerH;
      const available = gridArea - mobileTimeGridTopPad;
      if (available > 0 && gridArea > 0) {
        setMobilePxPerHour(Math.max(4, Math.floor(available / 24)));
        setMobileGridAreaPx(gridArea);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [mobileDaySchedule, anchor, mobileTimeGridTopPad]);

  const shiftMobileDay = useCallback((delta: number) => {
    setAnchor((d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), delta));
  }, []);

  const gridDays = useMemo(() => {
    if (mobileDaySchedule) {
      return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
    }
    if (isMobile && mode === "week") {
      const day = weekDays[selectedDayIndex];
      return day ? [day] : weekDays.length > 0 ? [weekDays[0]!] : [];
    }
    return weekDays;
  }, [mobileDaySchedule, anchor, isMobile, mode, weekDays, selectedDayIndex]);

  const weekGridTemplateColumns = useMemo(
    () => `56px repeat(${gridDays.length}, minmax(0, 1fr))`,
    [gridDays.length]
  );

  const gridWeekIndex = useCallback(
    (gridIdx: number) => {
      if (mobileDaySchedule) {
        const ymd = format(gridDays[gridIdx]!, "yyyy-MM-dd");
        const idx = weekDayYmds.indexOf(ymd);
        return idx >= 0 ? idx : 0;
      }
      if (isMobile && mode === "week") return selectedDayIndex;
      return gridIdx;
    },
    [mobileDaySchedule, gridDays, weekDayYmds, isMobile, mode, selectedDayIndex]
  );

  /** Mobile day view renders one grid column at index 0; drag code must not use week day index. */
  const columnIndexForDayYmd = useCallback(
    (dayYmd: string) => {
      if (mobileDaySchedule) return 0;
      return weekDayYmds.indexOf(dayYmd);
    },
    [mobileDaySchedule, weekDayYmds]
  );

  const dayYmdForColumnIndex = useCallback(
    (colIdx: number) => {
      if (mobileDaySchedule) {
        return gridDays[0] ? format(gridDays[0], "yyyy-MM-dd") : undefined;
      }
      return weekDayYmds[colIdx];
    },
    [mobileDaySchedule, gridDays, weekDayYmds]
  );

  const findGridColumnIndexAtX = useCallback(
    (clientX: number, fallbackIndex: number) => {
      if (mobileDaySchedule) return 0;
      return findColumnIndexAtX(weekColumnRefs.current, clientX, fallbackIndex);
    },
    [mobileDaySchedule]
  );

  const rangeFrom = format(mode === "week" ? weekStart : startOfMonth(anchor), "yyyy-MM-dd");
  const rangeTo = format(mode === "week" ? weekEnd : endOfMonth(anchor), "yyyy-MM-dd");
  const approvalPeriodStart = useMemo(() => {
    const d = new Date(weekStart);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekStart]);
  const approvalPeriodEnd = useMemo(() => addDays(approvalPeriodStart, 7), [approvalPeriodStart]);

  const { data: peopleForFilter } = useQuery({
    queryKey: ["time-people"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          name: string;
          email: string | null;
          weeklyContractHours?: number | null;
        }>
      >("/api/time/people"),
    enabled: readAll,
  });

  type MePerson = { id: string; weeklyContractHours?: number | null; vacationDaysPerYear?: number | null };
  const { data: mePerson } = useQuery({
    queryKey: ["people", "me"],
    queryFn: () => api.get<MePerson | null>("/api/people/me"),
  });

  const balancePersonId = readAll && selectedPersonId ? selectedPersonId : mePerson?.id ?? null;

  const { data: leaveBalances } = useQuery({
    queryKey: ["time-leave-balances", balancePersonId],
    queryFn: () => api.get<LeaveBalanceSummary>(`/api/time/leave-balances/${balancePersonId}`),
    enabled: leaveManagementEnabled && Boolean(balancePersonId),
    staleTime: 30_000,
  });

  const personQs =
    readAll && selectedPersonId
      ? `&personId=${encodeURIComponent(selectedPersonId)}`
      : "";

  const upcomingQs =
    readAll && selectedPersonId
      ? `?personId=${encodeURIComponent(selectedPersonId)}&limit=80`
      : "?limit=80";

  const { data: jobs } = useQuery({
    queryKey: ["time-jobs", rangeFrom, rangeTo, readAll, selectedPersonId],
    queryFn: () =>
      api.get<TimeTrackingJob[]>(`/api/time/jobs?from=${rangeFrom}&to=${rangeTo}${personQs}`),
    enabled: canUsePage && Boolean(mePerson?.id),
  });

  const { data: upcomingJobs } = useQuery({
    queryKey: ["time-jobs-upcoming", readAll, selectedPersonId],
    queryFn: () => api.get<TimeTrackingJob[]>(`/api/time/jobs/upcoming${upcomingQs}`),
    enabled: canUsePage && Boolean(mePerson?.id) && mode === "week",
  });

  const { data: entries } = useQuery({
    queryKey: ["time-entries", rangeFrom, rangeTo, readAll, selectedPersonId],
    queryFn: () =>
      api.get<TimeEntry[]>(`/api/time/entries?from=${rangeFrom}&to=${rangeTo}${personQs}`),
    enabled: canUsePage && Boolean(mePerson?.id),
  });

  const { data: approvals } = useQuery({
    queryKey: ["time-approvals", rangeFrom, rangeTo, readAll, selectedPersonId],
    queryFn: () =>
      api.get<TimesheetApproval[]>(`/api/time/approvals?from=${rangeFrom}&to=${rangeTo}${personQs}`),
    enabled: canUsePage && Boolean(mePerson?.id),
  });

  const { data: tags } = useQuery({
    queryKey: ["time-tags"],
    queryFn: () => api.get<TimeTag[]>("/api/time/tags"),
    enabled: canUsePage,
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<TimeProject[]>("/api/time/projects"),
    enabled: canUsePage,
  });

  const tagById = useMemo(() => new Map((tags ?? []).map((x) => [x.id, x])), [tags]);
  const projectById = useMemo(() => new Map((projects ?? []).map((x) => [x.id, x])), [projects]);

  const approvedTimesheet = useMemo(
    () =>
      (approvals ?? []).find(
        (a) =>
          a.status === "approved" &&
          new Date(a.periodStart).getTime() < approvalPeriodEnd.getTime() &&
          new Date(a.periodEnd).getTime() > approvalPeriodStart.getTime()
      ) ?? null,
    [approvals, approvalPeriodStart, approvalPeriodEnd]
  );
  const isApprovedWeek = mode === "week" && Boolean(approvedTimesheet);
  const canEditVisiblePeriod = canEdit && !isApprovedWeek;

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const updateEntry = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<{
        startsAt: string;
        endsAt: string;
        note: string | null;
        timeProjectId: string | null;
        tagIds: string[];
        category: string;
        isLocked: boolean;
      }>;
    }) => api.patch<TimeEntry>(`/api/time/entries/${id}`, body),
    onMutate: (variables) => {
      const previous = queryClient.getQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] });
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old) return old;
        const target = old.find((x) => x.id === variables.id);
        const groupId = target?.segmentGroupId ?? null;
        const b = variables.body;
        const metaPatch = {
          ...(b.note !== undefined ? { note: b.note } : {}),
          ...(b.timeProjectId !== undefined ? { timeProjectId: b.timeProjectId } : {}),
          ...(b.tagIds !== undefined ? { tagIds: b.tagIds } : {}),
          ...(b.category !== undefined
            ? { category: b.category as TimeEntry["category"] }
            : {}),
          ...(b.isLocked !== undefined ? { isLocked: b.isLocked } : {}),
        };
        return old.map((x) => {
          if (groupId && x.segmentGroupId === groupId) {
            return {
              ...x,
              ...(x.id === variables.id && b.startsAt !== undefined ? { startsAt: b.startsAt } : {}),
              ...(x.id === variables.id && b.endsAt !== undefined ? { endsAt: b.endsAt } : {}),
              ...metaPatch,
            };
          }
          if (x.id !== variables.id) return x;
          return {
            ...x,
            ...(b.startsAt !== undefined ? { startsAt: b.startsAt } : {}),
            ...(b.endsAt !== undefined ? { endsAt: b.endsAt } : {}),
            ...metaPatch,
          };
        });
      });
      void queryClient.cancelQueries({ queryKey: ["time-entries"] });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast({ title: t("time.saveError"), variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["time-leave-balances"] });
    },
  });

  const createEntry = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TimeEntry>("/api/time/entries", body),
    onMutate: async (body) => {
      const tempId = `optimistic-${Date.now()}`;
      const kind = body.kind === "job" ? "job" : "custom";
      const optimistic: TimeEntry = {
        id: tempId,
        organizationId: "",
        userId: "",
        personId: "",
        startsAt: body.startsAt as string,
        endsAt: body.endsAt as string,
        kind,
        category: "work",
        eventShowJobId: kind === "job" ? (body.eventShowJobId as string | null) ?? null : null,
        tourShowId: kind === "job" ? (body.tourShowId as string | null) ?? null : null,
        tourScheduleEventId:
          kind === "job" ? (body.tourScheduleEventId as string | null) ?? null : null,
        eventShowStaffingId: kind === "job" ? (body.eventShowStaffingId as string | null) ?? null : null,
        internalBookingPersonId:
          kind === "job" ? (body.internalBookingPersonId as string | null) ?? null : null,
        internalBookingDayKey:
          kind === "job" ? (body.internalBookingDayKey as string | null) ?? null : null,
        eventId: body.eventId != null ? (body.eventId as string) : null,
        timeProjectId: body.timeProjectId != null ? (body.timeProjectId as string) : null,
        note: body.note != null ? (body.note as string) : null,
        isLocked: body.isLocked === true,
        segmentGroupId: null,
        tagIds: Array.isArray(body.tagIds) ? (body.tagIds as string[]) : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await queryClient.cancelQueries({ queryKey: ["time-entries"] });
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old) return [optimistic];
        return [...old, optimistic].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      });
      return { tempId };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.tempId) {
        queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) =>
          old ? old.filter((e) => e.id !== ctx.tempId) : old
        );
      }
      toast({ title: t("time.saveError"), variant: "destructive" });
    },
    onSuccess: (data, _vars, ctx) => {
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old) return [data];
        const rest = ctx?.tempId ? old.filter((e) => e.id !== ctx.tempId) : old;
        return [...rest, data].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["time-jobs-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["time-leave-balances"] });
      timeNotify({ title: t("time.entryCreated") });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["time-jobs-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["time-leave-balances"] });
      timeNotify({ title: t("time.entryDeleted") });
      setEditingEntryId(null);
    },
    onError: () => toast({ title: t("time.deleteError"), variant: "destructive" }),
  });

  const approveTimesheet = useMutation({
    mutationFn: () =>
      api.post<TimesheetApproval>("/api/time/approvals", {
        personId: readAll && selectedPersonId ? selectedPersonId : undefined,
        periodStart: approvalPeriodStart.toISOString(),
        periodEnd: approvalPeriodEnd.toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-approvals"] });
      timeNotify({ title: "Timesheet approved" });
    },
    onError: () => toast({ title: "Could not approve timesheet", variant: "destructive" }),
  });

  const reopenTimesheet = useMutation({
    mutationFn: (id: string) => api.post<TimesheetApproval>(`/api/time/approvals/${id}/reopen`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-approvals"] });
      timeNotify({ title: "Timesheet reopened" });
    },
    onError: () => toast({ title: "Could not reopen timesheet", variant: "destructive" }),
  });

  /** Live drag preview: absolute range (same shape as booking grid drag updates). */
  const [dragOverride, setDragOverride] = useState<{
    entryId: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);

  const entryDragRef = useRef<EntryDragRef | null>(null);
  const createDragRef = useRef<CreateDragRef | null>(null);
  const activeColElRef = useRef<HTMLElement | null>(null);
  const createOverlayEls = useRef<Record<string, HTMLDivElement | null>>({});
  /** One HTMLElement per week column — same pattern as `OutlookTimeGrid` column refs. */
  const weekColumnRefs = useRef<(HTMLElement | null)[]>([]);

  const registerDayColumnRef = useCallback(
    (colEl: Element | null, dayYmd: string) => {
      const colIdx = columnIndexForDayYmd(dayYmd);
      if (colEl instanceof HTMLElement) {
        weekColumnRefs.current[colIdx] = colEl;
        activeColElRef.current = colEl;
      } else {
        activeColElRef.current = null;
      }
    },
    [columnIndexForDayYmd]
  );

  const editingEntry = useMemo(
    () => (entries ?? []).find((x) => x.id === editingEntryId) ?? null,
    [entries, editingEntryId]
  );

  const editingEntryJobSummary = useMemo(() => {
    if (!editingEntry || editingEntry.kind !== "job") return null;
    const jk = plannedJobKeyFromEntry(editingEntry);
    const fromId = jk ? (jobs ?? []).find((j) => j.id === jk)?.title : undefined;
    const fromUp = jk ? (upcomingJobs ?? []).find((j) => j.id === jk)?.title : undefined;
    const fromTourShow =
      editingEntry.tourShowId &&
      (jobs ?? []).find((j) => j.source === "tour" && j.tourShowId === editingEntry.tourShowId)?.title;
    return fromId ?? fromUp ?? fromTourShow ?? null;
  }, [editingEntry, jobs, upcomingJobs]);

  /** Live ISO range while dragging the entry open in the sheet (matches grid labels). */
  const entryLiveDragRange = useMemo(() => {
    if (!dragOverride || !editingEntryId || dragOverride.entryId !== editingEntryId) return null;
    return {
      startsAt: dragOverride.startsAt,
      endsAt: dragOverride.endsAt,
    };
  }, [dragOverride, editingEntryId]);

  const minutesFromY = useCallback((clientY: number, colEl: HTMLElement | null) => {
    if (!colEl) return null;
    const rect = colEl.getBoundingClientRect();
    const raw = rawWindowMinutesFromY(clientY, rect.top, columnHeightPxRef.current);
    return snapWindowMinutes(raw);
  }, []);

  const hideCreateOverlay = useCallback((dayYmd: string) => {
    const el = createOverlayEls.current[dayYmd];
    if (el) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }
  }, []);

  const hideAllCreateOverlays = useCallback(() => {
    for (const ymd of weekDayYmds) {
      hideCreateOverlay(ymd);
    }
  }, [weekDayYmds, hideCreateOverlay]);

  const syncCreateDragPreview = useCallback(
    (absLo: Date, absHi: Date) => {
      const lo = absLo.getTime() <= absHi.getTime() ? absLo : absHi;
      const hi = absLo.getTime() <= absHi.getTime() ? absHi : absLo;
      const durMin = Math.max((hi.getTime() - lo.getTime()) / 60000, TIME_SNAP_MINUTES);
      const sh = displayStartHourRef.current;
      const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
      let labelIdx = -1;
      for (let i = 0; i < weekDayYmds.length; i += 1) {
        const ymd = weekDayYmds[i]!;
        if (rangeMetricsInColumn(lo, hi, ymd, sh)) {
          labelIdx = i;
          break;
        }
      }
      weekDayYmds.forEach((ymd, i) => {
        const el = createOverlayEls.current[ymd];
        if (!el) return;
        const metrics = rangeMetricsInColumn(lo, hi, ymd, sh);
        if (!metrics) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          return;
        }
        el.style.opacity = "1";
        el.style.top = `${metrics.topPct}%`;
        el.style.height = `${Math.max(metrics.heightPct, 0.35)}%`;
        const lineEl = el.querySelector("[data-create-line]");
        const durEl = el.querySelector("[data-create-dur]");
        if (i === labelIdx) {
          if (lineEl) lineEl.textContent = `${format(lo, tf)} – ${format(hi, tf)}`;
          if (durEl) durEl.textContent = formatDurationShort(durMin);
        } else {
          if (lineEl) lineEl.textContent = "";
          if (durEl) durEl.textContent = "";
        }
      });
    },
    [weekDayYmds, timeFormat]
  );

  useEffect(() => {
    if (editingEntryId && !editingEntry) setEditingEntryId(null);
  }, [editingEntryId, editingEntry]);

  const attachCreateDragListeners = useCallback(
    (dayYmd: string, startClientX: number, startClientY: number) => {
      const startDayIndex = columnIndexForDayYmd(dayYmd);
      if (startDayIndex < 0) return;

      createDragRef.current = {
        startDayIndex,
        startClientX,
        startClientY,
        currentClientX: startClientX,
        currentClientY: startClientY,
        currentDayIndex: startDayIndex,
        thresholdPassed: false,
      };

      let createRafPending = false;

      const applyPreviewFromRefs = () => {
        const c = createDragRef.current;
        if (!c) return;
        const startCol = weekColumnRefs.current[c.startDayIndex];
        const endCol = weekColumnRefs.current[c.currentDayIndex];
        if (!startCol || !endCol) return;
        const winA = snapWindowMinutes(
          rawWindowMinutesFromY(
            c.startClientY,
            startCol.getBoundingClientRect().top,
            columnHeightPxRef.current
          )
        );
        const winB = snapWindowMinutes(
          rawWindowMinutesFromY(
            c.currentClientY,
            endCol.getBoundingClientRect().top,
            columnHeightPxRef.current
          )
        );
        const dayA = dayYmdForColumnIndex(c.startDayIndex);
        const dayB = dayYmdForColumnIndex(c.currentDayIndex);
        if (!dayA || !dayB) return;
        const sh = displayStartHourRef.current;
        const dtA = dateFromColumnAndWindowMinutes(dayA, winA, sh);
        const dtB = dateFromColumnAndWindowMinutes(dayB, winB, sh);
        const lo = dtA < dtB ? dtA : dtB;
        const hi = dtA < dtB ? dtB : dtA;
        syncCreateDragPreview(lo, hi);
      };

      const onMove = (ev: PointerEvent) => {
        const c = createDragRef.current;
        if (!c) return;
        c.currentClientX = ev.clientX;
        c.currentClientY = ev.clientY;
        c.currentDayIndex = findGridColumnIndexAtX(ev.clientX, c.currentDayIndex);
        const dx = ev.clientX - c.startClientX;
        const dy = ev.clientY - c.startClientY;
        if (!c.thresholdPassed && Math.hypot(dx, dy) < WEEK_GRID_MIN_DRAG_PX) return;
        c.thresholdPassed = true;
        if (createRafPending) return;
        createRafPending = true;
        requestAnimationFrame(() => {
          createRafPending = false;
          applyPreviewFromRefs();
        });
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        const c = createDragRef.current;
        createDragRef.current = null;
        if (!c) return;

        c.currentClientX = ev.clientX;
        c.currentClientY = ev.clientY;
        c.currentDayIndex = findGridColumnIndexAtX(ev.clientX, c.currentDayIndex);

        const startCol = weekColumnRefs.current[c.startDayIndex];
        const endCol = weekColumnRefs.current[c.currentDayIndex];
        const dx = ev.clientX - c.startClientX;
        const dy = ev.clientY - c.startClientY;
        if (!c.thresholdPassed || Math.hypot(dx, dy) < WEEK_GRID_MIN_DRAG_PX) {
          if (c.thresholdPassed) hideAllCreateOverlays();
          return;
        }
        if (!startCol || !endCol) {
          hideAllCreateOverlays();
          return;
        }

        const winA = snapWindowMinutes(
          rawWindowMinutesFromY(
            c.startClientY,
            startCol.getBoundingClientRect().top,
            columnHeightPxRef.current
          )
        );
        const winB = snapWindowMinutes(
          rawWindowMinutesFromY(
            c.currentClientY,
            endCol.getBoundingClientRect().top,
            columnHeightPxRef.current
          )
        );
        const dayA = dayYmdForColumnIndex(c.startDayIndex);
        const dayB = dayYmdForColumnIndex(c.currentDayIndex);
        if (!dayA || !dayB) {
          hideAllCreateOverlays();
          return;
        }
        const sh = displayStartHourRef.current;
        const dtA = dateFromColumnAndWindowMinutes(dayA, winA, sh);
        const dtB = dateFromColumnAndWindowMinutes(dayB, winB, sh);
        const absStart = dtA < dtB ? dtA : dtB;
        const absEnd = dtA < dtB ? dtB : dtA;

        const minMs = TIME_SNAP_MINUTES * 60 * 1000;
        if (absEnd.getTime() - absStart.getTime() < minMs) {
          hideAllCreateOverlays();
          return;
        }

        createEntry.mutate(
          {
            kind: "custom",
            startsAt: absStart.toISOString(),
            endsAt: absEnd.toISOString(),
          },
          {
            onSuccess: (created) => {
              setEditingEntryId(created.id);
            },
            onSettled: () => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => hideAllCreateOverlays());
              });
            },
          }
        );
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [
      createEntry,
      hideAllCreateOverlays,
      setEditingEntryId,
      syncCreateDragPreview,
      columnIndexForDayYmd,
      dayYmdForColumnIndex,
      findGridColumnIndexAtX,
    ]
  );

  const attachEntryDragListeners = useCallback(() => {
    const onMove = (ev: PointerEvent) => {
      const cur = entryDragRef.current;
      if (!cur) return;
      const idx = findGridColumnIndexAtX(ev.clientX, cur.startDayIndex);
      const col = weekColumnRefs.current[idx] ?? activeColElRef.current;
      if (!col) return;
      activeColElRef.current = col;
      const mSnap = minutesFromY(ev.clientY, col);
      if (mSnap === null) return;
      const sh = displayStartHourRef.current;
      const ymd = dayYmdForColumnIndex(idx);
      if (!ymd) return;

      if (cur.kind === "move") {
        if (!cur.moveThresholdPassed) {
          const sx = cur.moveStartClientX ?? ev.clientX;
          const sy = cur.moveStartClientY ?? ev.clientY;
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;
          if (dx * dx + dy * dy < WEEK_GRID_MIN_DRAG_PX * WEEK_GRID_MIN_DRAG_PX) return;
          cur.moveThresholdPassed = true;
        }
        const dur = cur.preserveExactDuration
          ? Math.max(1, Math.round(cur.durationMin))
          : Math.max(
              TIME_SNAP_MINUTES,
              Math.round(cur.durationMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES
            );
        const newStartWin = clampMinutesToDay(Math.max(0, Math.min(MINUTES_PER_DAY - dur, mSnap)));
        const newStart = dateFromColumnAndWindowMinutes(ymd, newStartWin, sh);
        const newEnd = new Date(newStart.getTime() + dur * 60000);
        setDragOverride({
          entryId: cur.entryId,
          startsAt: newStart.toISOString(),
          endsAt: newEnd.toISOString(),
        });
        return;
      }

      if (cur.kind === "resizeEnd") {
        const newEnd = dateFromColumnAndWindowMinutes(ymd, mSnap, sh);
        const start = parseISO(cur.origStartsAtIso);
        const minEnd = new Date(start.getTime() + TIME_SNAP_MINUTES * 60000);
        const endsAt = newEnd.getTime() < minEnd.getTime() ? minEnd : newEnd;
        setDragOverride({
          entryId: cur.entryId,
          startsAt: cur.origStartsAtIso,
          endsAt: endsAt.toISOString(),
        });
        return;
      }

      if (cur.kind === "resizeStart") {
        const newStart = dateFromColumnAndWindowMinutes(ymd, mSnap, sh);
        const end = parseISO(cur.origEndsAtIso);
        const maxStart = new Date(end.getTime() - TIME_SNAP_MINUTES * 60000);
        const startsAt = newStart.getTime() > maxStart.getTime() ? maxStart : newStart;
        setDragOverride({
          entryId: cur.entryId,
          startsAt: startsAt.toISOString(),
          endsAt: cur.origEndsAtIso,
        });
      }
    };

    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const d = entryDragRef.current;
      entryDragRef.current = null;
      activeColElRef.current = null;
      const sh = displayStartHourRef.current;

      if (!d) {
        setDragOverride(null);
        return;
      }

      const idx = findGridColumnIndexAtX(ev.clientX, d.startDayIndex);
      const col = weekColumnRefs.current[idx] ?? activeColElRef.current;
      const ymd = dayYmdForColumnIndex(idx);
      const m = col ? minutesFromY(ev.clientY, col) : null;

      if (d.kind === "move" && !d.moveThresholdPassed) {
        setEditingEntryId(d.entryId);
        setDragOverride(null);
        return;
      }

      if (m === null || !ymd) {
        setDragOverride(null);
        return;
      }

      if (d.kind === "resizeEnd") {
        const newEnd = dateFromColumnAndWindowMinutes(ymd, m, sh);
        const start = parseISO(d.origStartsAtIso);
        const minEnd = new Date(start.getTime() + TIME_SNAP_MINUTES * 60000);
        const endsAt = newEnd.getTime() < minEnd.getTime() ? minEnd : newEnd;
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: d.origStartsAtIso,
            endsAt: endsAt.toISOString(),
          },
        });
        setDragOverride(null);
        return;
      }

      if (d.kind === "resizeStart") {
        const newStart = dateFromColumnAndWindowMinutes(ymd, m, sh);
        const end = parseISO(d.origEndsAtIso);
        const maxStart = new Date(end.getTime() - TIME_SNAP_MINUTES * 60000);
        const startsAt = newStart.getTime() > maxStart.getTime() ? maxStart : newStart;
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: startsAt.toISOString(),
            endsAt: d.origEndsAtIso,
          },
        });
        setDragOverride(null);
        return;
      }

      const dur = d.preserveExactDuration
        ? Math.max(1, Math.round(d.durationMin))
        : Math.max(
            TIME_SNAP_MINUTES,
            Math.round(d.durationMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES
          );
      const newStartWin = clampMinutesToDay(Math.max(0, Math.min(MINUTES_PER_DAY - dur, m)));
      const newStart = dateFromColumnAndWindowMinutes(ymd, newStartWin, sh);
      const newEnd = new Date(newStart.getTime() + dur * 60000);
      updateEntry.mutate({
        id: d.entryId,
        body: {
          startsAt: newStart.toISOString(),
          endsAt: newEnd.toISOString(),
        },
      });
      setDragOverride(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [minutesFromY, updateEntry, setEditingEntryId, dayYmdForColumnIndex, findGridColumnIndexAtX]);

  const entryByJobId = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of entries ?? []) {
      const k = plannedJobKeyFromEntry(e);
      if (k) m.set(k, e);
    }
    return m;
  }, [entries]);

  const totalsByDay = useMemo(() => {
    const acc = new Map<string, number>();
    for (const e of entries ?? []) {
      const k = format(parseISO(e.startsAt), "yyyy-MM-dd");
      const mins =
        (parseISO(e.endsAt).getTime() - parseISO(e.startsAt).getTime()) / 60_000;
      acc.set(k, (acc.get(k) ?? 0) + mins);
    }
    return acc;
  }, [entries]);

  const monthCalendarItems = useMemo<CalendarItem[]>(() => {
    if (mode !== "month") return [];
    return Array.from(totalsByDay.entries())
      .filter(([, mins]) => mins > 0)
      .map(([day, mins]) => ({
        id: `time-total:${day}`,
        title: `${Math.round((mins / 60) * 10) / 10}h`,
        kind: "summary",
        startDate: day,
        endDate: null,
        raw: {} as CalendarItem["raw"],
      }));
  }, [mode, totalsByDay]);

  const totalsByColumnDay = useMemo(() => {
    const acc = new Map<string, number>();
    for (const e of entries ?? []) {
      const start = parseISO(e.startsAt);
      const end = parseISO(e.endsAt);
      const mins = Math.max(0, (end.getTime() - start.getTime()) / 60_000);
      const dayKey = columnDayYmdForInstant(start, displayStartHour);
      acc.set(dayKey, (acc.get(dayKey) ?? 0) + mins);
    }
    return acc;
  }, [entries, displayStartHour]);

  const weekTotalMinutes = useMemo(() => {
    return weekDays.reduce((sum, d) => {
      const k = format(d, "yyyy-MM-dd");
      return sum + (totalsByColumnDay.get(k) ?? 0);
    }, 0);
  }, [weekDays, totalsByColumnDay]);

  /** Cumulative minutes Mon → this column (same order as `weekDays`). */
  const weekRunningTotalMinutes = useMemo(() => {
    let sum = 0;
    return weekDays.map((d) => {
      const k = format(d, "yyyy-MM-dd");
      sum += totalsByColumnDay.get(k) ?? 0;
      return sum;
    });
  }, [weekDays, totalsByColumnDay]);

  const periodWeek = getISOWeek(anchor);
  // Note: month/year label is formatted inline where used (depends on view mode).

  const activePersonWeeklyHours = useMemo(() => {
    const targetId = readAll && selectedPersonId ? selectedPersonId : mePerson?.id;
    if (!targetId) return mePerson?.weeklyContractHours ?? null;
    if (targetId === mePerson?.id) return mePerson.weeklyContractHours ?? null;
    return peopleForFilter?.find((p) => p.id === targetId)?.weeklyContractHours ?? null;
  }, [readAll, selectedPersonId, mePerson, peopleForFilter]);

  const workDayMinutes = workDayDurationMinutes(activePersonWeeklyHours);
  const workDayDurationLabel = formatWorkDayDuration(workDayMinutes);

  function jumpToJobWeek(job: TimeTrackingJob) {
    const { start } = plannedJobDisplayRange(job);
    if (Number.isFinite(start.getTime())) setAnchor(start);
    setMode("week");
  }

  function addJobToTime(job: TimeTrackingJob) {
    const tourShowId =
      job.tourShowId ??
      (job.id.startsWith(TOUR_PLAN_JOB_PREFIX) ? job.id.slice(TOUR_PLAN_JOB_PREFIX.length) : null);
    const isTourJob =
      job.source === "tour" ||
      (tourShowId != null &&
        (job.id.startsWith(TOUR_PLAN_JOB_PREFIX) || job.id.startsWith(TOUR_EVENT_PREFIX)));

    const eventStaffingId =
      job.eventShowStaffingId ??
      (job.id.startsWith(EVT_STAFF_PREFIX) ? job.id.slice(EVT_STAFF_PREFIX.length) : null);

    let internalPersonId = job.internalBookingPersonId ?? null;
    let internalDayKey = job.internalBookingDayKey ?? null;
    if (!internalPersonId && job.id.startsWith(IBOOKP_PREFIX)) {
      const rest = job.id.slice(IBOOKP_PREFIX.length);
      const c = rest.indexOf(":");
      if (c !== -1) {
        internalPersonId = rest.slice(0, c);
        internalDayKey = rest.slice(c + 1);
      }
    }

    if (isTourJob && tourShowId) {
      const tr = tourPlannedRangeLocal(job);
      const tourScheduleEventId =
        job.tourScheduleEventId ??
        (job.id.startsWith(TOUR_EVENT_PREFIX) ? job.id.slice(TOUR_EVENT_PREFIX.length) : null);
      createEntry.mutate({
        startsAt: tr ? tr.start.toISOString() : job.plannedStartsAt,
        endsAt: tr ? tr.end.toISOString() : job.plannedEndsAt,
        kind: "job",
        tourShowId,
        ...(tourScheduleEventId ? { tourScheduleEventId } : {}),
        ...(job.timeProjectId ? { timeProjectId: job.timeProjectId } : {}),
      });
    } else if (
      eventStaffingId &&
      (job.source === "event_staffing" || job.id.startsWith(EVT_STAFF_PREFIX))
    ) {
      createEntry.mutate({
        startsAt: job.plannedStartsAt,
        endsAt: job.plannedEndsAt,
        kind: "job",
        eventShowStaffingId: eventStaffingId,
        eventId: job.eventId,
        ...(job.timeProjectId ? { timeProjectId: job.timeProjectId } : {}),
      });
    } else if (
      internalPersonId &&
      internalDayKey &&
      (job.source === "internal_booking" || job.id.startsWith(IBOOKP_PREFIX))
    ) {
      createEntry.mutate({
        startsAt: job.plannedStartsAt,
        endsAt: job.plannedEndsAt,
        kind: "job",
        internalBookingPersonId: internalPersonId,
        internalBookingDayKey: internalDayKey,
        ...(job.timeProjectId ? { timeProjectId: job.timeProjectId } : {}),
      });
    } else {
      createEntry.mutate({
        startsAt: job.plannedStartsAt,
        endsAt: job.plannedEndsAt,
        kind: "job",
        eventShowJobId: job.id,
        eventId: job.eventId,
      });
    }
    jumpToJobWeek(job);
  }

  function jobWindowMetrics(job: TimeTrackingJob, columnDayYmd: string) {
    const { start, end } = plannedJobDisplayRange(job);
    const m = rangeMetricsInColumn(start, end, columnDayYmd, displayStartHour);
    if (!m) return { topPct: 0, heightPct: 0 };
    return { topPct: m.topPct, heightPct: Math.max(m.heightPct, 3) };
  }

  if (!canUsePage) {
    return (
      <div className="p-6">
        <p className="text-white/60">{t("time.noAccess")}</p>
      </div>
    );
  }

  if (!mePerson?.id) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm text-white/55">{t("time.needPersonLink")}</p>
      </div>
    );
  }

  const weekJobIds = new Set((jobs ?? []).map((j) => j.id));
  const hasUpcomingUnlogged =
    mode === "week" &&
    (upcomingJobs ?? []).some((j) => !plannedJobIsLogged(j, entryByJobId, entries));

  const mobileScheduleDay = mobileDaySchedule && gridDays[0] ? gridDays[0] : null;
  const mobileScheduleDayYmd = mobileScheduleDay ? format(mobileScheduleDay, "yyyy-MM-dd") : "";
  const mobileScheduleDayTotalMinutes = totalsByColumnDay.get(mobileScheduleDayYmd) ?? 0;
  const mobileScheduleRunningMinutes = mobileScheduleDay
    ? (weekRunningTotalMinutes[gridWeekIndex(0)] ?? mobileScheduleDayTotalMinutes)
    : 0;
  const isTimeSection = section === "time";

  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col min-h-0 md:h-full md:overflow-hidden",
        mobileDaySchedule
          ? "h-full overflow-hidden gap-0 p-0"
          : "max-md:h-auto max-md:overflow-visible",
        !mobileDaySchedule && "gap-2 p-2 sm:p-3 md:p-4"
      )}
    >
      {!mobileDaySchedule ? (
      <div className="relative z-20 shrink-0 bg-[#0a0a0f] pb-0">
        <div className="flex flex-col gap-2 w-full">
          {/* Desktop: fixed slots so controls never shift position */}
          <div className="hidden sm:grid grid-cols-[auto_auto_auto_auto_1fr_auto_auto_auto] items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => setSection("time")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                section === "time" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              Time
            </button>
            {travelAllowanceEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setSection("travel");
                  setMode("week");
                }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  section === "travel" ? "bg-white/10 text-white" : "text-white/55"
                )}
              >
                Travel
              </button>
            ) : null}
            {mileageAllowanceEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setSection("mileage");
                  setMode("week");
                }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm",
                  section === "mileage" ? "bg-white/10 text-white" : "text-white/55"
                )}
              >
                Mileage
              </button>
            ) : null}
          </div>
          {isTimeSection ? (
          <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode("week");
                setSection("time");
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                mode === "week" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              {t("time.week")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("month");
                setSection("time");
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                mode === "month" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              {t("time.month")}
            </button>
          </div>
          ) : null}
          {isTimeSection ? (
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
            <Label className="text-[10px] uppercase tracking-wide text-white/45 whitespace-nowrap">
              {t("time.gridStartsAt")}
            </Label>
            <Select
              value={String(displayStartHour)}
              onValueChange={(v) => setDisplayStartHour(Number.parseInt(v, 10))}
            >
              <SelectTrigger className="h-8 w-[5.5rem] bg-white/5 border-white/10 text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                {Array.from({ length: 24 }).map((_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {formatHourLabel(h, timeFormat === "24h" ? "24h" : "12h")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          ) : null}
          {/* Date nav slot */}
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-white/15 text-white"
            onClick={() =>
              setAnchor((d) => (mode === "week" ? subWeeks(d, 1) : subMonths(d, 1)))
            }
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <DateInputWithWeekday
            value={format(anchor, "yyyy-MM-dd")}
            onChange={(value) => {
              const next = dateFromISODate(value);
              if (next) setAnchor(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-white/15 text-white"
            onClick={() =>
              setAnchor((d) => (mode === "week" ? addWeeks(d, 1) : addMonths(d, 1)))
            }
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/40 hover:text-white/70 hover:bg-white/5"
            onClick={() => {
              const today = new Date();
              setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
            }}
          >
            Today
          </Button>
          </div>
          {/* Period label slot (fixed width) */}
          <div className="w-[260px] text-xs text-white/50 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
            {mode === "week"
              ? `W${periodWeek} · ${format(weekStart, "d MMM", { locale: dfLocale })} – ${format(
                  weekEnd,
                  "d MMM yyyy",
                  { locale: dfLocale }
                )}`
              : format(anchor, "MMMM yyyy", { locale: dfLocale })}
          </div>
          {/* Week total slot (reserved space, only visible in week mode + time section) */}
          <div className={cn("w-[260px] text-xs tabular-nums whitespace-nowrap", isTimeSection && mode === "week" ? "text-white/60" : "text-white/0 select-none")} aria-hidden={!(isTimeSection && mode === "week")}>
            Week total {formatOneDecimalHour(weekTotalMinutes / 60, commaDec)}
            <span className={cn("text-white/35", !(isTimeSection && mode === "week") && "text-white/0")}> · </span>
            {formatTotalMinutesAsHHMM(weekTotalMinutes)}
          </div>
          {/* Approve slot (reserved space) */}
          <div className={cn("w-[190px]", isTimeSection && mode === "week" ? "" : "invisible pointer-events-none")} aria-hidden={!(isTimeSection && mode === "week")}>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              {approvedTimesheet ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                    <Lock className="h-3 w-3" />
                    Approved
                  </span>
                  {readAll ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-white/55 hover:text-white"
                      onClick={() => reopenTimesheet.mutate(approvedTimesheet.id)}
                      disabled={reopenTimesheet.isPending || !(isTimeSection && mode === "week")}
                    >
                      Reopen
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-white/65 hover:text-white"
                  onClick={() => approveTimesheet.mutate()}
                  disabled={!canEdit || approveTimesheet.isPending || !(isTimeSection && mode === "week")}
                >
                  Approve week
                </Button>
              )}
            </div>
          </div>
          {/* Person selector slot (fixed width) */}
          <div className="w-[220px]">
            {readAll && peopleForFilter && peopleForFilter.length > 0 ? (
              <Select
                value={selectedPersonId ?? mePerson.id}
                onValueChange={(v) => setSelectedPersonId(v === mePerson.id ? null : v)}
              >
                <SelectTrigger className="w-[220px] bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder={t("time.personFilter")} />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value={mePerson.id}>{t("time.me")}</SelectItem>
                  {peopleForFilter
                    .filter((p) => p.id !== mePerson.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="h-8" />
            )}
          </div>
          </div>

          {/* Desktop row 2: secondary links */}
          <div className="hidden sm:flex flex-nowrap items-center gap-2 min-w-0 overflow-x-auto">
            {readAll ? (
              <Link to="/time/reports" className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/60 hover:bg-white/5 gap-1.5"
                >
                  <BarChart2 className="h-4 w-4" />
                  {t("time.reportsLink")}
                </Button>
              </Link>
            ) : null}
            {readAll && leaveManagementEnabled ? (
              <Link to="/time/payroll" className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/60 hover:bg-white/5 gap-1.5"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("time.payrollLink")}
                </Button>
              </Link>
            ) : null}
            {canManageTimeCatalog ? (
              <Link to="/time/catalog" className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/60 hover:bg-white/5 gap-1.5"
                >
                  <FolderKanban className="h-4 w-4" />
                  {t("time.parentCategoryCatalogLink")}
                </Button>
              </Link>
            ) : null}
            {readAll ? (
              <Link to="/time/import" className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/60 hover:bg-white/5 gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  {t("time.importLink")}
                </Button>
              </Link>
            ) : null}
            {canManageTimeCatalog ? (
              <Link to="/time/bulk" className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/60 hover:bg-white/5 gap-1.5"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  {t("time.bulkToolsLink")}
                </Button>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 min-h-9 min-w-9 border-white/15 text-white"
            onClick={() =>
              setAnchor((d) => (mode === "week" ? subWeeks(d, 1) : subMonths(d, 1)))
            }
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <DateInputWithWeekday
            value={format(anchor, "yyyy-MM-dd")}
            onChange={(value) => {
              const next = dateFromISODate(value);
              if (next) setAnchor(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 min-h-9 min-w-9 border-white/15 text-white"
            onClick={() =>
              setAnchor((d) => (mode === "week" ? addWeeks(d, 1) : addMonths(d, 1)))
            }
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-white/40 hover:text-white/70 hover:bg-white/5"
            onClick={() => {
              const today = new Date();
              setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
            }}
          >
            Today
          </Button>
          {isTimeSection && mode === "week" ? (
            <span className="text-xs text-white/60 tabular-nums">
              Week total {formatOneDecimalHour(weekTotalMinutes / 60, commaDec)}
              <span className="text-white/35"> · </span>
              {formatTotalMinutesAsHHMM(weekTotalMinutes)}
            </span>
          ) : null}
          </div>
          {isMobile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 min-h-9 min-w-9 border-white/15 text-white shrink-0"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#16161f] border-white/10 text-white w-56">
                {isTimeSection ? (
                  <>
                <DropdownMenuLabel className="text-white/50">{t("time.gridStartsAt")}</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <Select
                    value={String(displayStartHour)}
                    onValueChange={(v) => setDisplayStartHour(Number.parseInt(v, 10))}
                  >
                    <SelectTrigger className="h-9 w-full bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                      {Array.from({ length: 24 }).map((_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {formatHourLabel(h, timeFormat === "24h" ? "24h" : "12h")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mode === "week" ? (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    {approvedTimesheet ? (
                      <DropdownMenuItem
                        className="text-emerald-300 focus:bg-white/10 focus:text-emerald-200"
                        onClick={() => readAll && reopenTimesheet.mutate(approvedTimesheet.id)}
                        disabled={!readAll || reopenTimesheet.isPending}
                      >
                        Reopen approved week
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="focus:bg-white/10"
                        onClick={() => approveTimesheet.mutate()}
                        disabled={!canEdit || approveTimesheet.isPending}
                      >
                        Approve week
                      </DropdownMenuItem>
                    )}
                  </>
                ) : null}
                  </>
                ) : null}
                {readAll && peopleForFilter && peopleForFilter.length > 0 ? (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuLabel className="text-white/50">{t("time.personFilter")}</DropdownMenuLabel>
                    <div className="px-2 pb-2">
                      <Select
                        value={selectedPersonId ?? mePerson.id}
                        onValueChange={(v) => setSelectedPersonId(v === mePerson.id ? null : v)}
                      >
                        <SelectTrigger className="h-9 w-full bg-white/5 border-white/10 text-white text-sm">
                          <SelectValue placeholder={t("time.personFilter")} />
                        </SelectTrigger>
                        <SelectContent className="bg-[#16161f] border-white/10 text-white">
                          <SelectItem value={mePerson.id}>{t("time.me")}</SelectItem>
                          {peopleForFilter
                            .filter((p) => p.id !== mePerson.id)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
                {readAll ? (
                  <>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem asChild className="focus:bg-white/10">
                      <Link to="/time/reports">{t("time.reportsLink")}</Link>
                    </DropdownMenuItem>
                    {leaveManagementEnabled ? (
                      <DropdownMenuItem asChild className="focus:bg-white/10">
                        <Link to="/time/payroll">{t("time.payrollLink")}</Link>
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
      ) : null}

      {leaveManagementEnabled && leaveBalances && isTimeSection ? (
        <div className="shrink-0">
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-white/40 font-medium">{t("time.leaveBalancesTitle")}</span>
            <span>
              {t("time.leaveVacationRemaining")}:{" "}
              <span
                className={cn(
                  "tabular-nums font-medium",
                  leaveBalances.vacationRemainingDays < 0 ? "text-red-300" : "text-emerald-300"
                )}
              >
                {leaveBalances.vacationRemainingDays.toFixed(1)}d
              </span>
            </span>
            <span>
              {t("time.leaveExtraRemaining")}:{" "}
              <span className="tabular-nums text-teal-300 font-medium">
                {leaveBalances.extraVacationRemainingDays.toFixed(1)}d
              </span>
            </span>
            <span>
              {t("time.leaveCompRemaining")}:{" "}
              <span className="tabular-nums text-cyan-300 font-medium">
                {Math.floor(leaveBalances.compTimeRemainingMinutes / 60)}h{" "}
                {leaveBalances.compTimeRemainingMinutes % 60}m
              </span>
            </span>
            <span className="text-white/35">({leaveBalances.vacationYearKey})</span>
            {balancePersonId ? (
              <span className="ml-auto">
                <LeaveLedgerMenu
                  personId={balancePersonId}
                  vacationYearKey={leaveBalances.vacationYearKey}
                  leave={leaveBalances}
                  canAdjust={readAll}
                  variant="compact"
                />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
      {section === "travel" && travelAllowanceEnabled ? (
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <TravelClaimsPanel
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            personQuery={personQs}
            canEdit={canEditVisiblePeriod}
            projects={projects ?? []}
          />
        </div>
      ) : section === "mileage" && mileageAllowanceEnabled ? (
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <MileageClaimsPanel
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            personQuery={personQs}
            canEdit={canEditVisiblePeriod}
            projects={projects ?? []}
          />
        </div>
      ) : mode === "month" ? (
        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <CalendarGrid
              year={anchor.getFullYear()}
              month={anchor.getMonth()}
              items={monthCalendarItems}
              onItemClick={(item) => {
                const day = dateFromISODate(item.startDate);
                if (!day) return;
                setAnchor(day);
                setMode("week");
              }}
              onDateClick={(day) => {
                setAnchor(day);
                setMode("week");
              }}
            />
          </div>
        </div>
      ) : (
        <div className={cn("relative z-0 flex min-h-0 flex-1 flex-col pr-0.5", mobileDaySchedule ? "gap-0" : "gap-2")}>
          <div
            className={cn(
              CALENDAR_PANEL_SHELL_CLASS,
              mobileDaySchedule && "min-h-0 flex-1 rounded-none p-0"
            )}
          >
            <div className={CALENDAR_PANEL_FLEX_COLUMN_CLASS}>
              <div
                ref={mobileDaySchedule ? mobileCalendarPanelRef : undefined}
                className={cn(
                  mobileDaySchedule
                    ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-t-0 border-b border-white/10 bg-white/[0.02]"
                    : CALENDAR_GRID_SCROLLER_CLASS
                )}
              >
            <div className={cn(!isMobile && "min-w-[720px]", mobileDaySchedule && "flex min-h-0 flex-1 flex-col")}>
              {isMobile && mode === "week" && !mobileDaySchedule ? (
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 min-h-9 min-w-9 border-white/15 text-white shrink-0"
                    disabled={selectedDayIndex <= 0}
                    onClick={() => setSelectedDayIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="text-sm font-semibold text-white truncate">
                      {weekDays[selectedDayIndex]
                        ? format(weekDays[selectedDayIndex]!, "EEEE d MMM", { locale: dfLocale })
                        : ""}
                    </div>
                    <div className="mt-1 flex justify-center gap-1">
                      {weekDays.map((day, i) => {
                        const ymd = format(day, "yyyy-MM-dd");
                        const hasTime = (totalsByColumnDay.get(ymd) ?? 0) > 0;
                        return (
                          <button
                            key={ymd}
                            type="button"
                            onClick={() => setSelectedDayIndex(i)}
                            className={cn(
                              "h-2 w-2 rounded-full transition-colors",
                              i === selectedDayIndex
                                ? "bg-ordo-yellow"
                                : hasTime
                                  ? "bg-white/45"
                                  : "bg-white/15"
                            )}
                            aria-label={format(day, "EEEE", { locale: dfLocale })}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 min-h-9 min-w-9 border-white/15 text-white shrink-0"
                    disabled={selectedDayIndex >= weekDays.length - 1}
                    onClick={() => setSelectedDayIndex((i) => Math.min(weekDays.length - 1, i + 1))}
                    aria-label="Next day"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
              {mobileScheduleDay ? (
                <div
                  ref={mobileDayHeaderRef}
                  className="shrink-0 border-b border-white/10 bg-white/[0.07] px-1 py-1.5"
                >
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 min-h-8 min-w-8 shrink-0 border-white/15 text-white"
                      onClick={() => shiftMobileDay(-1)}
                      aria-label="Previous day"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <p className="min-w-0 flex-1 text-center text-[11px] font-medium leading-tight text-white">
                      {format(mobileScheduleDay, "EEEE d MMMM yyyy", { locale: dfLocale })} week{" "}
                      {getISOWeek(mobileScheduleDay)}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 min-h-8 min-w-8 shrink-0 border-white/15 text-white"
                      onClick={() => shiftMobileDay(1)}
                      aria-label="Next day"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-0.5 text-center text-[10px] leading-tight tabular-nums text-white/55">
                    <span className="text-white/40">{t("time.weekColumnDayHours")}</span>{" "}
                    {formatOneDecimalHour(mobileScheduleDayTotalMinutes / 60, commaDec)}{" "}
                    {formatTotalMinutesAsHHMM(mobileScheduleDayTotalMinutes)}
                    <span className="mx-1.5 text-white/20">·</span>
                    <span className="text-white/40">{t("time.weekColumnRunningHours")}</span>{" "}
                    {formatOneDecimalHour(mobileScheduleRunningMinutes / 60, commaDec)}{" "}
                    {formatTotalMinutesAsHHMM(mobileScheduleRunningMinutes)}
                  </p>
                </div>
              ) : null}
                {!mobileDaySchedule ? (
                <div className={cn(CALENDAR_STICKY_HEADER_CHROME, "border-b border-white/10")}>
                  <div
                    className="grid min-w-0"
                    style={{ gridTemplateColumns: weekGridTemplateColumns }}
                  >
                    <div className={cn(WEEK_GRID_HEADER_CLASS, "w-full border-b-0 border-r border-white/10 bg-white/[0.02]")} aria-hidden />
                    {gridDays.map((day, gridIdx) => {
                      const dayIdx = gridWeekIndex(gridIdx);
                      const dayYmd = format(day, "yyyy-MM-dd");
                      const dayTotalMinutes = totalsByColumnDay.get(dayYmd) ?? 0;
                      const runningMinutes = weekRunningTotalMinutes[dayIdx] ?? dayTotalMinutes;
                      const dayOffEntry = (entries ?? []).find(
                        (e) =>
                          isDayOffCategory(e.category ?? "work") &&
                          columnDayYmdForInstant(parseISO(e.startsAt), displayStartHour) === dayYmd
                      );
                      const dayOffCategory = dayOffEntry?.category ?? null;
                      const dayOffColors: Record<string, { bg: string; text: string; border: string }> = {
                        vacation: {
                          bg: "bg-emerald-500/8",
                          text: "text-emerald-300",
                          border: "border-emerald-500/25",
                        },
                        extra_vacation: {
                          bg: "bg-teal-500/8",
                          text: "text-teal-300",
                          border: "border-teal-500/25",
                        },
                        comp_time: {
                          bg: "bg-cyan-500/8",
                          text: "text-cyan-300",
                          border: "border-cyan-500/25",
                        },
                        sick: {
                          bg: "bg-orange-500/8",
                          text: "text-orange-300",
                          border: "border-orange-500/25",
                        },
                        holiday: {
                          bg: "bg-purple-500/8",
                          text: "text-purple-300",
                          border: "border-purple-500/25",
                        },
                      };
                      const col = dayOffCategory ? dayOffColors[dayOffCategory] : null;

                      const addDayOff = (category: "vacation" | "sick" | "extra_vacation" | "comp_time") => {
                        if (!canEditVisiblePeriod) return;
                        const startsAt = wallClockYmdHhMmToUtcIso(dayYmd, "08:00");
                        const endsAt = addMinutesToUtcIso(startsAt, workDayMinutes);
                        if (!endsAt) return;
                        createEntry.mutate({
                          startsAt,
                          endsAt,
                          kind: "custom",
                          category,
                        });
                      };

                      return (
                        <div
                          key={dayYmd}
                          className={cn(
                            "group",
                            WEEK_GRID_HEADER_CLASS,
                            "min-w-0 text-xs text-white/70",
                            gridIdx > 0 && "border-l border-white/10",
                            col?.bg,
                            col ? `border-b ${col.border}` : "border-b border-white/10"
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1 text-left">
                              <div
                                className={cn(
                                  "text-[11px] font-semibold leading-tight",
                                  col ? col.text : "text-white"
                                )}
                              >
                                {format(day, "EEEE", { locale: dfLocale })}
                              </div>
                              <div className="mt-1 text-[10px] text-white/60 leading-snug">
                                {format(day, "d MMMM yyyy", { locale: dfLocale })}
                              </div>
                              <div className="mt-0.5 text-[10px] text-white/45 leading-snug tabular-nums">
                                {t("time.calendarWeekIso", { week: getISOWeek(day) })}
                              </div>
                              <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug tabular-nums">
                                <div className="text-white/40">
                                  <span className="text-white/35">{t("time.weekColumnDayHours")}</span>{" "}
                                  <span className="text-white/55">
                                    {formatOneDecimalHour(dayTotalMinutes / 60, commaDec)}
                                    <span className="text-white/25"> · </span>
                                    {formatTotalMinutesAsHHMM(dayTotalMinutes)}
                                  </span>
                                </div>
                                <div className="text-white/40">
                                  <span className="text-white/35">{t("time.weekColumnRunningHours")}</span>{" "}
                                  <span className="text-white/70">
                                    {formatOneDecimalHour(runningMinutes / 60, commaDec)}
                                    <span className="text-white/25"> · </span>
                                    {formatTotalMinutesAsHHMM(runningMinutes)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {canEditVisiblePeriod && !dayOffEntry ? (
                              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  title={`${t("time.addVacationDay")} (${workDayDurationLabel})`}
                                  onClick={() => addDayOff("vacation")}
                                  className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold leading-none text-emerald-300/70 hover:bg-emerald-500/30 hover:text-emerald-200"
                                >
                                  V
                                </button>
                                {leaveManagementEnabled ? (
                                  <>
                                    <button
                                      type="button"
                                      title={`${t("time.addExtraVacationDay")} (${workDayDurationLabel})`}
                                      onClick={() => addDayOff("extra_vacation")}
                                      className="rounded bg-teal-500/15 px-1 py-0.5 text-[9px] font-bold leading-none text-teal-300/70 hover:bg-teal-500/30 hover:text-teal-200"
                                    >
                                      FF
                                    </button>
                                    <button
                                      type="button"
                                      title={`${t("time.addCompTimeDay")} (${workDayDurationLabel})`}
                                      onClick={() => addDayOff("comp_time")}
                                      className="rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] font-bold leading-none text-cyan-300/70 hover:bg-cyan-500/30 hover:text-cyan-200"
                                    >
                                      A
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  title={`${t("time.addSickDay")} (${workDayDurationLabel})`}
                                  onClick={() => addDayOff("sick")}
                                  className="rounded bg-orange-500/15 px-1 py-0.5 text-[9px] font-bold leading-none text-orange-300/70 hover:bg-orange-500/30 hover:text-orange-200"
                                >
                                  S
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {dayOffEntry ? (
                            <button
                              type="button"
                              disabled={!canEditVisiblePeriod}
                              onClick={() => setEditingEntryId(dayOffEntry.id)}
                              className={cn(
                                "mt-1 text-[9px] font-medium text-left",
                                col?.text,
                                canEditVisiblePeriod && "hover:underline cursor-pointer"
                              )}
                            >
                              {t(timeCategoryMessageId(dayOffEntry.category as TimeCategory) as never)}
                              {(() => {
                                const parts = dayOffHeaderLabel(
                                  dayOffEntry.startsAt,
                                  dayOffEntry.endsAt,
                                  timeFormat
                                );
                                return (
                                  <>
                                    {" · "}
                                    {parts.range}
                                    {" · "}
                                    {parts.duration}
                                  </>
                                );
                              })()}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                ) : null}

                <div
                  className={cn(
                    "grid min-w-0",
                    mobileDaySchedule && "min-h-0 flex-1 shrink overflow-hidden"
                  )}
                  style={{
                    gridTemplateColumns: weekGridTemplateColumns,
                    ...(mobileDaySchedule && mobileGridAreaPx > 0
                      ? { height: mobileGridAreaPx, maxHeight: mobileGridAreaPx }
                      : {}),
                  }}
                >
                  <div
                    className="relative box-border"
                    style={{ height: effectiveColumnFrameHeightPx }}
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 border-r border-white/10"
                      style={{
                        top: effectiveTopPad,
                        height: effectiveColumnHeightPx,
                      }}
                    >
                      {Array.from({ length: 24 }).map((_, h) => {
                        const hour24 = (displayStartHour + h) % 24;
                        return (
                          <div
                            key={h}
                            className={cn(
                              "pointer-events-none absolute left-0 right-1 z-[1] flex items-end justify-end text-right text-white/50 tabular-nums",
                              mobileDaySchedule
                                ? "text-[8px] leading-[9px]"
                                : "-translate-y-1/2 text-[9px] leading-[10px]"
                            )}
                            style={{ top: h * effectivePxPerHour }}
                          >
                            {formatHourLabel(hour24, timeFormat === "24h" ? "24h" : "12h")}
                          </div>
                        );
                      })}
                      {!mobileDaySchedule ? (
                        <span className="pointer-events-none absolute bottom-0 left-0 right-1 z-[1] flex translate-y-1 items-end justify-end text-right text-[9px] leading-[10px] text-white/50 tabular-nums">
                          {bottomBoundaryLabel(displayStartHour, timeFormat === "24h" ? "24h" : "12h")}
                        </span>
                      ) : null}
                    </div>
                  </div>
            {gridDays.map((day, gridIdx) => {
              const dayYmd = format(day, "yyyy-MM-dd");
              const dayOffEntry = (entries ?? []).find(
                (e) =>
                  isDayOffCategory(e.category ?? "work") &&
                  columnDayYmdForInstant(parseISO(e.startsAt), displayStartHour) === dayYmd
              );
              const dayOffCategory = dayOffEntry?.category ?? null;
              const dayOffColors: Record<string, { bg: string; text: string; border: string }> = {
                vacation: { bg: "bg-emerald-500/8", text: "text-emerald-300", border: "border-emerald-500/25" },
                extra_vacation: { bg: "bg-teal-500/8", text: "text-teal-300", border: "border-teal-500/25" },
                comp_time: { bg: "bg-cyan-500/8", text: "text-cyan-300", border: "border-cyan-500/25" },
                sick: { bg: "bg-orange-500/8", text: "text-orange-300", border: "border-orange-500/25" },
                holiday: { bg: "bg-purple-500/8", text: "text-purple-300", border: "border-purple-500/25" },
              };
              const col = dayOffCategory ? dayOffColors[dayOffCategory] : null;

              return (
                <div
                  key={dayYmd}
                  className="group relative min-h-0 min-w-0"
                >
                  <div
                    className="relative box-border"
                    style={{ height: effectiveColumnFrameHeightPx }}
                  >
                  <div
                    ref={(el) => {
                      weekColumnRefs.current[gridIdx] = el;
                    }}
                    data-day-col={dayYmd}
                    className={cn(
                      "absolute inset-x-0 touch-none select-none",
                      gridIdx > 0 && "border-l border-white/10",
                      col?.bg
                    )}
                    style={{
                      top: effectiveTopPad,
                      height: effectiveColumnHeightPx,
                    }}
                  >
                    {col && (
                      <div className={cn("absolute inset-0 z-0 pointer-events-none", col.bg)} />
                    )}
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute left-0 right-0 z-0 border-t border-white/[0.1]"
                        style={{ top: h * effectivePxPerHour }}
                      />
                    ))}
                    {!mobileDaySchedule ? (
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 border-t border-white/[0.1]" />
                    ) : null}
                    {canEditVisiblePeriod ? (
                      <>
                        <div
                          className="absolute inset-0 z-[1] cursor-crosshair touch-none"
                          onPointerDown={(ev) => {
                            ev.preventDefault();
                            registerDayColumnRef(
                              (ev.currentTarget as HTMLElement).closest("[data-day-col]"),
                              dayYmd
                            );
                            attachCreateDragListeners(dayYmd, ev.clientX, ev.clientY);
                          }}
                        />
                        <div
                          ref={(el) => {
                            createOverlayEls.current[dayYmd] = el;
                          }}
                          className="absolute left-0.5 right-0.5 z-[1] rounded-md border-2 border-sky-400/70 bg-sky-500/25 pointer-events-none flex flex-col justify-start px-1 py-0.5 overflow-hidden opacity-0"
                          style={{ top: 0, height: 0 }}
                        >
                          <div
                            data-create-line
                            className="text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                          />
                          <div
                            data-create-dur
                            className="text-[9px] text-white/90 leading-tight mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                          />
                        </div>
                      </>
                    ) : null}
                    {(jobs ?? [])
                      .filter((j) => {
                        const { start, end } = plannedJobDisplayRange(j);
                        return rangeOverlapsColumnWindow(start, end, dayYmd, displayStartHour);
                      })
                      .filter((j) => !plannedJobIsLogged(j, entryByJobId, entries))
                      .map((j) => {
                        const { topPct, heightPct } = jobWindowMetrics(j, dayYmd);
                        return (
                          <div
                            key={`plan-${j.id}`}
                            className="absolute left-0.5 right-0.5 z-[2] flex flex-col rounded border border-dashed border-white/25 bg-white/[0.04] px-1 py-0.5 text-[10px] text-white/50 overflow-hidden select-none"
                            style={{
                              top: `${Math.max(0, topPct)}%`,
                              height: `${Math.max(3, heightPct)}%`,
                            }}
                            title={
                              j.source === "tour"
                                ? `${internalBookingDisplayTitle(j.eventTitle)} (tour)`
                                : internalBookingDisplayTitle(j.eventTitle)
                            }
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                            }}
                          >
                            <div className="min-h-0 flex-1 overflow-hidden leading-tight">
                              <div className="font-medium text-white/65 truncate">
                                {internalBookingDisplayTitle(j.title)}
                              </div>
                              <span className="block text-[9px] text-white/35">{t("time.planned")}</span>
                            </div>
                            {canEditVisiblePeriod ? (
                              <button
                                type="button"
                                className="mt-0.5 w-full shrink-0 rounded border border-emerald-400/40 bg-emerald-500/20 px-0.5 py-0.5 text-[9px] font-semibold leading-tight text-emerald-100 hover:bg-emerald-500/35"
                                disabled={createEntry.isPending}
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                }}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  addJobToTime(j);
                                }}
                              >
                                {t("time.addToTime")}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    {layoutTimeEntryBlocks(
                      (entries ?? [])
                        .filter((e) =>
                          rangeOverlapsColumnWindow(
                            parseISO(e.startsAt),
                            parseISO(e.endsAt),
                            dayYmd,
                            displayStartHour
                          )
                        )
                        .map((e) => {
                          const preview =
                            dragOverride?.entryId === e.id
                              ? {
                                  start: parseISO(dragOverride.startsAt),
                                  end: parseISO(dragOverride.endsAt),
                                }
                              : null;
                          const spanStart = preview?.start ?? parseISO(e.startsAt);
                          const spanEnd = preview?.end ?? parseISO(e.endsAt);
                          const segment = rangeMetricsInColumn(
                            spanStart,
                            spanEnd,
                            dayYmd,
                            displayStartHour
                          );
                          if (!segment) return null;
                          return {
                            id: e.id,
                            timeProjectId: e.timeProjectId,
                            start: spanStart,
                            end: spanEnd,
                            topPct: segment.topPct,
                            heightPct: Math.max(segment.heightPct, 0.35),
                            data: e,
                          };
                        })
                        .filter((row): row is NonNullable<typeof row> => row != null)
                    ).map((layout) => {
                        const e = layout.data;
                        const preview =
                          dragOverride?.entryId === e.id
                            ? {
                                start: parseISO(dragOverride.startsAt),
                                end: parseISO(dragOverride.endsAt),
                              }
                            : null;
                        const spanStart = preview?.start ?? layout.start;
                        const spanEnd = preview?.end ?? layout.end;
                        const topPct = layout.topPct;
                        const heightPct = layout.heightPct;
                        const start = parseISO(e.startsAt);
                        const end = parseISO(e.endsAt);
                        const entryDurMin = (end.getTime() - start.getTime()) / 60000;
                        const durMin = (spanEnd.getTime() - spanStart.getTime()) / 60000;
                        const isJob = e.kind === "job";
                        const isLocked = e.isLocked === true;
                        const cat = (e.category ?? "work") as TimeCategory;
                        const isDayOff = isDayOffCategory(cat);
                        const jobKey = plannedJobKeyFromEntry(e);
                        const tourJobTitle =
                          isJob && e.tourShowId
                            ? (jobs ?? []).find((j) => j.source === "tour" && j.tourShowId === e.tourShowId)
                                ?.title
                            : undefined;
                        const label =
                          isDayOff || cat === "travel_allowance"
                            ? t(timeCategoryMessageId(cat) as never)
                            : isJob && (jobKey || e.tourShowId)
                              ? (jobKey
                                  ? (jobs ?? []).find((j) => j.id === jobKey)?.title ??
                                    (upcomingJobs ?? []).find((j) => j.id === jobKey)?.title
                                  : undefined) ??
                                tourJobTitle ??
                                t("time.job")
                              : "";
                        const projEntity =
                          !isLeaveAutoProjectCategory(cat) && e.timeProjectId
                            ? projectById.get(e.timeProjectId)
                            : undefined;
                        const projStripe = projEntity
                          ? displayHex(projEntity.color, projEntity.id)
                          : null;
                        const proj = projEntity?.name ?? null;
                        const timeTf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
                        const startDisp = snapLocalClockToGrid(spanStart);
                        const endDisp = snapLocalClockToGrid(spanEnd);
                        const startTimeLabel = format(startDisp, timeTf);
                        const endTimeLabel = format(endDisp, timeTf);
                        const durForLabel = isDayOff
                          ? Math.round(durMin)
                          : Math.max(
                              TIME_SNAP_MINUTES,
                              Math.round(durMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES
                            );
                        const durationLabel = formatDurationShort(durForLabel, isDayOff);
                        const gapPx = 2;
                        const leftPct = (layout.colIndex / layout.totalCols) * 100;
                        const widthPct = (1 / layout.totalCols) * 100;
                        return (
                          <div
                            key={`${e.id}-${dayYmd}-${layout.colIndex}-${layout.stackIndex}`}
                            className={cn(
                              "absolute rounded border px-1 pt-1 pb-2 text-[10px] overflow-hidden shadow-sm select-none",
                              timeEntryBlockSurfaceClass(cat, isJob, layout.stackIndex, layout.stackCount),
                              isLocked ? "opacity-90" : "",
                              canEditVisiblePeriod && !isLocked ? "cursor-grab active:cursor-grabbing" : ""
                            )}
                            data-entry-block={e.id}
                            style={{
                              top: `${Math.max(0, topPct)}%`,
                              height: `${Math.max(4, heightPct)}%`,
                              left: `calc(${leftPct}% + ${gapPx}px)`,
                              width: `calc(${widthPct}% - ${gapPx * 2}px)`,
                              zIndex: 2 + layout.stackIndex,
                              ...(projStripe
                                ? { boxShadow: `inset 4px 0 0 0 ${projStripe}` }
                                : {}),
                            }}
                            onPointerDown={(ev) => {
                              if (!canEditVisiblePeriod) return;
                              if (isLocked) return;
                              if ((ev.target as HTMLElement).closest("[data-handle]")) return;
                              ev.preventDefault();
                              registerDayColumnRef(
                                (ev.currentTarget as HTMLElement).closest("[data-day-col]"),
                                dayYmd
                              );
                              const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                              entryDragRef.current = {
                                entryId: e.id,
                                kind: "move",
                                origStartWinMin: sWin,
                                origEndWinMin: sWin + entryDurMin,
                                dayYmd,
                                startDayIndex: columnIndexForDayYmd(dayYmd),
                                origStartsAtIso: e.startsAt,
                                origEndsAtIso: e.endsAt,
                                durationMin: entryDurMin,
                                preserveExactDuration: isDayOff,
                                moveStartClientX: ev.clientX,
                                moveStartClientY: ev.clientY,
                                moveThresholdPassed: false,
                              };
                              attachEntryDragListeners();
                            }}
                          >
                            {canEditVisiblePeriod ? (
                              <>
                                <button
                                  type="button"
                                  className="absolute top-0 right-0 z-[3] flex h-5 w-5 items-center justify-center rounded-sm text-white/70 hover:bg-white/15 hover:text-white"
                                  data-handle="edit"
                                  aria-label={t("time.editEntry")}
                                  onPointerDown={(ev) => {
                                    ev.stopPropagation();
                                  }}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setEditingEntryId(e.id);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="absolute top-5 right-0 z-[4] flex h-5 w-5 items-center justify-center rounded-sm text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-40"
                                  data-handle="lock"
                                  aria-label={isLocked ? t("time.unlockEntry") : t("time.lockEntry")}
                                  disabled={updateEntry.isPending}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    updateEntry.mutate(
                                      { id: e.id, body: { isLocked: !isLocked } },
                                      {
                                        onSuccess: () => {
                                          timeNotify({
                                            title: !isLocked
                                              ? t("time.entryLocked")
                                              : t("time.entryUnlocked"),
                                          });
                                        },
                                      }
                                    );
                                  }}
                                >
                                  {isLocked ? (
                                    <Lock className="h-3 w-3" />
                                  ) : (
                                    <LockOpen className="h-3 w-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="absolute bottom-0.5 right-0 z-[4] flex h-5 w-5 items-center justify-center rounded-sm text-white/70 hover:bg-red-500/25 hover:text-red-200 disabled:opacity-40"
                                  data-handle="delete"
                                  aria-label={t("time.deleteEntry")}
                                  disabled={deleteEntry.isPending || isLocked}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    deleteEntry.mutate(e.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                {isLocked ? (
                                  <span
                                    className="absolute bottom-0.5 left-0.5 z-[3] inline-flex items-center gap-1 rounded bg-black/35 px-1 py-0.5 text-[9px] text-white/80"
                                    title={t("time.lockedEntryHint")}
                                  >
                                    <Lock className="h-2.5 w-2.5" />
                                    {t("time.lockedShort")}
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                            {label ? <div className="font-medium truncate pr-4">{label}</div> : null}
                            <div className="text-[9px] tabular-nums text-white/90 leading-tight pr-4">
                              {startTimeLabel} – {endTimeLabel} · {durationLabel}
                            </div>
                            {proj ? (
                              <div
                                className="text-[9px] font-medium truncate pr-4"
                                style={projStripe ? { color: projStripe } : undefined}
                              >
                                {proj}
                              </div>
                            ) : null}
                            {e.tagIds.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5 mt-0.5 pr-4">
                                {e.tagIds.map((tid) => {
                                  const tag = tagById.get(tid);
                                  if (!tag) return null;
                                  const col = displayHex(tag.color, tag.id);
                                  return (
                                    <span
                                      key={tid}
                                      className="max-w-full truncate rounded px-1 py-px text-[8px] font-semibold leading-tight text-white shadow-sm"
                                      style={{
                                        backgroundColor: hexToRgba(col, 0.55),
                                        boxShadow: `inset 0 0 0 1px ${hexToRgba(col, 0.35)}`,
                                      }}
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                            {e.note && !isDayOff ? (
                              <div className="mt-0.5 pr-4 text-[9px] leading-snug text-white/85 whitespace-pre-wrap break-words">
                                {e.note}
                              </div>
                            ) : null}
                            {canEditVisiblePeriod && !isDayOff ? (
                              <>
                                <button
                                  type="button"
                                  data-handle="resizeStart"
                                  className="absolute top-0 left-0 right-6 h-1.5 cursor-ns-resize bg-white/15 hover:bg-white/30 rounded-t-sm"
                                  aria-hidden
                                  onPointerDown={(ev) => {
                                    if (isLocked) return;
                                    ev.stopPropagation();
                                    registerDayColumnRef(
                                      (ev.currentTarget as HTMLElement).closest("[data-day-col]"),
                                      dayYmd
                                    );
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    entryDragRef.current = {
                                      entryId: e.id,
                                      kind: "resizeStart",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + entryDurMin,
                                      dayYmd,
                                      startDayIndex: columnIndexForDayYmd(dayYmd),
                                      origStartsAtIso: e.startsAt,
                                      origEndsAtIso: e.endsAt,
                                      durationMin: entryDurMin,
                                    };
                                    attachEntryDragListeners();
                                  }}
                                />
                                <button
                                  type="button"
                                  data-handle="resizeEnd"
                                  className="absolute bottom-0 left-0 right-6 h-1.5 cursor-ns-resize bg-white/20 hover:bg-white/35 rounded-b-sm"
                                  aria-hidden
                                  onPointerDown={(ev) => {
                                    if (isLocked) return;
                                    ev.stopPropagation();
                                    registerDayColumnRef(
                                      (ev.currentTarget as HTMLElement).closest("[data-day-col]"),
                                      dayYmd
                                    );
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    entryDragRef.current = {
                                      entryId: e.id,
                                      kind: "resizeEnd",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + entryDurMin,
                                      dayYmd,
                                      startDayIndex: columnIndexForDayYmd(dayYmd),
                                      origStartsAtIso: e.startsAt,
                                      origEndsAtIso: e.endsAt,
                                      durationMin: entryDurMin,
                                    };
                                    attachEntryDragListeners();
                                  }}
                                />
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                  </div>
                </div>
              );
            })}
                </div>

                {!mobileDaySchedule ? (
                <div
                  className="grid min-w-0"
                  style={{ gridTemplateColumns: weekGridTemplateColumns }}
                >
                  <div className="h-6 shrink-0 border-r border-white/10 bg-white/[0.02]" />
                  {gridDays.map((day, gridIdx) => {
                  return (
                    <div
                      key={`pad-${format(day, "yyyy-MM-dd")}`}
                      className={cn("h-6 shrink-0", gridIdx > 0 && "border-l border-white/10")}
                    />
                  );
                  })}
                </div>
                ) : null}
            </div>
              </div>
            </div>
          </div>

          {!mobileDaySchedule &&
          (hasUpcomingUnlogged ||
            (canManageTimeCatalog && mode === "week" && section === "time") ||
            (canEditVisiblePeriod && mode === "week" && section === "time")) ? (
            <Collapsible open={weekBottomOpen} onOpenChange={setWeekBottomOpen} className="shrink-0">
              <div className="rounded-lg border border-white/10 bg-white/[0.03]">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-white/85 hover:bg-white/[0.06]"
                  >
                    <span>{t("time.weekToolsExpand")}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-white/50 transition-transform",
                        weekBottomOpen ? "rotate-180" : "rotate-0"
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-white/10 px-3 pb-3 pt-2 data-[state=closed]:animate-out">
                  <div className="max-h-[min(50dvh,32rem)] space-y-3 overflow-y-auto overscroll-contain pr-0.5">
          {hasUpcomingUnlogged ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{t("time.upcomingTitle")}</p>
                  <p className="text-xs text-white/45 mt-0.5">{t("time.upcomingHint")}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-white/60 hover:text-white"
                  onClick={() => setUpcomingCollapsed((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      upcomingCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
              {upcomingCollapsed ? null : (
                <ul className="space-y-2 pr-1">
                  {(upcomingJobs ?? [])
                    .filter((job) => !plannedJobIsLogged(job, entryByJobId, entries))
                    .map((job) => {
                    const inCurrentWeek = weekJobIds.has(job.id);
                    const disp = plannedJobDisplayRange(job);
                    const dayLabel = format(disp.start, "EEE d MMM");
                    const timeLabel = format(disp.start, "HH:mm");
                    return (
                      <li
                        key={`up-${job.id}`}
                        className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-white/90 font-medium truncate">
                            {internalBookingDisplayTitle(job.title)}
                          </div>
                          <div className="text-[11px] text-white/45 truncate">
                            {internalBookingDisplayTitle(job.eventTitle)} · {dayLabel} {timeLabel}
                            {inCurrentWeek ? ` · ${t("time.inThisWeek")}` : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/15 text-white/80 h-8 text-xs"
                            onClick={() => jumpToJobWeek(job)}
                          >
                            {t("time.showWeek")}
                          </Button>
                          {canEditVisiblePeriod ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600"
                              onClick={() => addJobToTime(job)}
                            >
                              {t("time.addToTime")}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {canManageTimeCatalog && mode === "week" && section === "time" ? (
            <div className="space-y-3">
              <TimeCatalogSettings />
            </div>
          ) : null}

          {canEditVisiblePeriod && mode === "week" && section === "time" ? (
            <p className="text-xs text-white/40">{t("time.dragHint")}</p>
          ) : null}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : null}
        </div>
      )}
      </div>

      <TimeEntryEditSheet
        entry={editingEntry}
        liveRange={entryLiveDragRange}
        open={Boolean(editingEntry)}
        onOpenChange={(o) => {
          if (!o) setEditingEntryId(null);
        }}
        projects={projects ?? []}
        tags={tags ?? []}
        onSave={(id, body) => {
          updateEntry.mutate(
            { id, body },
            {
              onSuccess: () => {
                timeNotify({ title: t("time.entryUpdated") });
              },
            }
          );
        }}
        onToggleLock={(id, locked) => {
          updateEntry.mutate(
            { id, body: { isLocked: locked } },
            {
              onSuccess: () => {
                timeNotify({ title: locked ? t("time.entryLocked") : t("time.entryUnlocked") });
              },
            }
          );
        }}
        saving={updateEntry.isPending}
        onDelete={(id) => deleteEntry.mutate(id)}
        deleting={deleteEntry.isPending}
        entrySummary={editingEntryJobSummary}
        leaveManagementEnabled={leaveManagementEnabled}
        workDayDurationMinutes={workDayMinutes}
      />
    </div>
  );
}
