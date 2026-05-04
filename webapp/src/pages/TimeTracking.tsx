import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TimeEntryEditSheet } from "@/components/time/TimeEntryEditSheet";
import type { TimeEntry, TimeProject, TimeTag, TimeTrackingJob } from "@/contracts/backendTypes";
import type { TimeFormat } from "@/lib/preferences";
import {
  MINUTES_PER_DAY,
  bottomBoundaryLabel,
  clampMinutesToDay,
  columnDayYmdForInstant,
  dateFromColumnAndWindowMinutes,
  formatHourLabel,
  minutesFromWindowStart,
} from "@/lib/timeGrid";

const WEEK_STARTS_ON = 1 as const;
const PX_PER_HOUR = 36;
const COLUMN_HEIGHT_PX = (MINUTES_PER_DAY / 60) * PX_PER_HOUR;
/** Same height for corner spacer and day headers so the hour grid lines up with columns. */
const WEEK_GRID_HEADER_CLASS =
  "h-[4.5rem] shrink-0 border-b border-white/10 box-border flex flex-col items-center justify-center gap-0.5 px-1 text-center";

const DISPLAY_START_STORAGE_KEY = "timeGrid.displayStartHour";

function readDisplayStartHour(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(DISPLAY_START_STORAGE_KEY);
  const n = v !== null ? Number.parseInt(v, 10) : 0;
  if (!Number.isFinite(n) || n < 0 || n > 23) return 0;
  return n;
}

function snapMinutes(m: number, step = 15): number {
  return Math.round(m / step) * step;
}

type DragState = {
  entryId: string;
  kind: "move" | "resizeEnd" | "resizeStart";
  origStartWinMin: number;
  origEndWinMin: number;
  dayYmd: string;
  durationMin: number;
};

type CreateDraftState = { dayYmd: string; a: number; b: number };

export default function TimeTracking() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { effective } = usePreferences();
  const timeFormat: TimeFormat = effective?.timeFormat ?? "24h";
  const { canView, canAction } = usePermissions();
  const canUsePage = canView("time");
  const canEdit = canAction("time.write");
  const readAll = canAction("time.read_all");

  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [displayStartHour, setDisplayStartHour] = useState(readDisplayStartHour);

  useEffect(() => {
    window.localStorage.setItem(DISPLAY_START_STORAGE_KEY, String(displayStartHour));
  }, [displayStartHour]);

  const weekStart = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON });
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  );

  const rangeFrom = format(mode === "week" ? weekStart : startOfMonth(anchor), "yyyy-MM-dd");
  const rangeTo = format(mode === "week" ? weekEnd : endOfMonth(anchor), "yyyy-MM-dd");

  const { data: peopleForFilter } = useQuery({
    queryKey: ["time-people"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; email: string | null }>>("/api/time/people"),
    enabled: readAll,
  });

  const { data: mePerson } = useQuery({
    queryKey: ["people", "me"],
    queryFn: () => api.get<{ id: string } | null>("/api/people/me"),
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
      }>;
    }) => api.patch<TimeEntry>(`/api/time/entries/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () => toast({ title: t("time.saveError"), variant: "destructive" }),
  });

  const createEntry = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TimeEntry>("/api/time/entries", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["time-jobs-upcoming"] });
      toast({ title: t("time.entryCreated") });
    },
    onError: () => toast({ title: t("time.saveError"), variant: "destructive" }),
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["time-jobs-upcoming"] });
      toast({ title: t("time.entryDeleted") });
      setEditingEntryId(null);
    },
    onError: () => toast({ title: t("time.deleteError"), variant: "destructive" }),
  });

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraftState | null>(null);
  const createDraftRef = useRef<CreateDraftState | null>(null);

  const editingEntry = useMemo(
    () => (entries ?? []).find((x) => x.id === editingEntryId) ?? null,
    [entries, editingEntryId]
  );

  const editingEntryJobSummary = useMemo(() => {
    if (!editingEntry || editingEntry.kind !== "job" || !editingEntry.eventShowJobId) return null;
    return (
      (jobs ?? []).find((j) => j.id === editingEntry.eventShowJobId)?.title ??
      (upcomingJobs ?? []).find((j) => j.id === editingEntry.eventShowJobId)?.title ??
      null
    );
  }, [editingEntry, jobs, upcomingJobs]);

  const minutesFromY = useCallback((clientY: number, colEl: HTMLElement | null) => {
    if (!colEl) return null;
    const rect = colEl.getBoundingClientRect();
    const y = clientY - rect.top;
    const clamped = Math.max(0, Math.min(COLUMN_HEIGHT_PX, y));
    const frac = clamped / COLUMN_HEIGHT_PX;
    const mins = frac * MINUTES_PER_DAY;
    return snapMinutes(Math.round(mins));
  }, []);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (editingEntryId && !editingEntry) setEditingEntryId(null);
  }, [editingEntryId, editingEntry]);

  useEffect(() => {
    if (!drag) return;
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const col = document.querySelector(`[data-day-col="${d.dayYmd}"]`) as HTMLElement | null;
      const m = minutesFromY(ev.clientY, col);
      setDrag(null);
      if (m === null) return;

      if (d.kind === "resizeEnd") {
        const newEndWin = clampMinutesToDay(Math.max(d.origStartWinMin + 15, m));
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: dateFromColumnAndWindowMinutes(
              d.dayYmd,
              d.origStartWinMin,
              displayStartHour
            ).toISOString(),
            endsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newEndWin, displayStartHour).toISOString(),
          },
        });
        return;
      }

      if (d.kind === "resizeStart") {
        const newStartWin = clampMinutesToDay(Math.min(m, d.origEndWinMin - 15));
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: dateFromColumnAndWindowMinutes(
              d.dayYmd,
              newStartWin,
              displayStartHour
            ).toISOString(),
            endsAt: dateFromColumnAndWindowMinutes(
              d.dayYmd,
              d.origEndWinMin,
              displayStartHour
            ).toISOString(),
          },
        });
        return;
      }

      const dur = d.durationMin;
      const newStartWin = clampMinutesToDay(Math.max(0, Math.min(MINUTES_PER_DAY - dur, m)));
      const newEndWin = newStartWin + dur;
      updateEntry.mutate({
        id: d.entryId,
        body: {
          startsAt: dateFromColumnAndWindowMinutes(
            d.dayYmd,
            newStartWin,
            displayStartHour
          ).toISOString(),
          endsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newEndWin, displayStartHour).toISOString(),
        },
      });
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [drag, displayStartHour, minutesFromY, updateEntry]);

  const entryByJobId = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of entries ?? []) {
      if (e.eventShowJobId) m.set(e.eventShowJobId, e);
    }
    return m;
  }, [entries]);

  const monthCells = useMemo(() => {
    if (mode !== "month") return [];
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const calStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [mode, anchor]);

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

  function jumpToJobWeek(job: TimeTrackingJob) {
    const d = parseISO(job.plannedStartsAt);
    if (Number.isFinite(d.getTime())) setAnchor(d);
    setMode("week");
  }

  function addJobToTime(job: TimeTrackingJob) {
    createEntry.mutate({
      startsAt: job.plannedStartsAt,
      endsAt: job.plannedEndsAt,
      kind: "job",
      eventShowJobId: job.id,
      eventId: job.eventId,
    });
    jumpToJobWeek(job);
  }

  function entryWindowMetrics(e: TimeEntry, columnDayYmd: string) {
    const start = parseISO(e.startsAt);
    const end = parseISO(e.endsAt);
    const startWin = minutesFromWindowStart(start, columnDayYmd, displayStartHour);
    let endWin = minutesFromWindowStart(end, columnDayYmd, displayStartHour);
    if (endWin < startWin) endWin += MINUTES_PER_DAY;
    const visibleEnd = Math.min(endWin, MINUTES_PER_DAY);
    const topPct = (Math.max(0, startWin) / MINUTES_PER_DAY) * 100;
    const heightPct = ((visibleEnd - Math.max(0, startWin)) / MINUTES_PER_DAY) * 100;
    return { topPct, heightPct };
  }

  function jobWindowMetrics(job: TimeTrackingJob, columnDayYmd: string) {
    const start = parseISO(job.plannedStartsAt);
    const end = parseISO(job.plannedEndsAt);
    const startWin = minutesFromWindowStart(start, columnDayYmd, displayStartHour);
    let endWin = minutesFromWindowStart(end, columnDayYmd, displayStartHour);
    if (endWin < startWin) endWin += MINUTES_PER_DAY;
    const visibleEnd = Math.min(endWin, MINUTES_PER_DAY);
    const topPct = (Math.max(0, startWin) / MINUTES_PER_DAY) * 100;
    const heightPct = ((visibleEnd - Math.max(0, startWin)) / MINUTES_PER_DAY) * 100;
    return { topPct, heightPct };
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
        <h2 className="text-lg font-semibold text-white">{t("time.title")}</h2>
        <p className="text-sm text-white/55 mt-2">{t("time.needPersonLink")}</p>
      </div>
    );
  }

  const weekJobIds = new Set((jobs ?? []).map((j) => j.id));
  const hasUpcomingUnlogged =
    mode === "week" &&
    (upcomingJobs ?? []).some((j) => !entryByJobId.has(j.id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t("time.title")}</h2>
          <p className="text-sm text-white/50 mt-1">{t("time.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => setMode("week")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                mode === "week" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              {t("time.week")}
            </button>
            <button
              type="button"
              onClick={() => setMode("month")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm",
                mode === "month" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              {t("time.month")}
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
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
          <span className="text-sm text-white/70 tabular-nums min-w-[11rem]">
            {mode === "week"
              ? `${format(weekStart, "d MMM")} – ${format(weekEnd, "d MMM yyyy")}`
              : format(anchor, "MMMM yyyy")}
          </span>
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
          ) : null}
        </div>
      </div>

      {hasUpcomingUnlogged ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-white">{t("time.upcomingTitle")}</p>
            <p className="text-xs text-white/45 mt-0.5">{t("time.upcomingHint")}</p>
          </div>
          <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {(upcomingJobs ?? [])
              .filter((job) => !entryByJobId.has(job.id))
              .map((job) => {
              const inCurrentWeek = weekJobIds.has(job.id);
              const dayLabel = format(parseISO(job.plannedStartsAt), "EEE d MMM");
              const timeLabel = format(parseISO(job.plannedStartsAt), "HH:mm");
              return (
                <li
                  key={`up-${job.id}`}
                  className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-white/90 font-medium truncate">{job.title}</div>
                    <div className="text-[11px] text-white/45 truncate">
                      {job.eventTitle} · {dayLabel} {timeLabel}
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
                    {canEdit ? (
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
        </div>
      ) : null}

      {mode === "month" ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="grid grid-cols-7 gap-px text-[10px] uppercase tracking-wide text-white/40 mb-2">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((x) => (
              <div key={x} className="text-center py-1">
                {x}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((day) => {
              const k = format(day, "yyyy-MM-dd");
              const mins = totalsByDay.get(k) ?? 0;
              const h = Math.round((mins / 60) * 10) / 10;
              const inMonth = day.getMonth() === anchor.getMonth();
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => {
                    setAnchor(day);
                    setMode("week");
                  }}
                  className={cn(
                    "min-h-[4rem] rounded-lg border border-white/10 p-2 text-left transition",
                    inMonth ? "bg-white/[0.04] hover:bg-white/[0.07]" : "opacity-25"
                  )}
                >
                  <div className="text-xs text-white/50">{format(day, "d")}</div>
                  {mins > 0 ? (
                    <div className="text-sm font-medium text-ordo-yellow mt-1">{h}h</div>
                  ) : (
                    <div className="text-xs text-white/25 mt-1">—</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-x-auto">
          <div className="flex min-w-[720px]">
            <div className="w-14 shrink-0 flex flex-col">
              <div className={cn(WEEK_GRID_HEADER_CLASS, "w-full border-b-0")} aria-hidden />
              <div className="relative flex flex-col" style={{ height: COLUMN_HEIGHT_PX }}>
                {Array.from({ length: 24 }).map((_, i) => {
                  const hour24 = (displayStartHour + i) % 24;
                  const label = formatHourLabel(hour24, timeFormat === "24h" ? "24h" : "12h");
                  return (
                    <div key={i} className="relative flex-1 min-h-0">
                      <span className="absolute left-0 right-1 top-0 z-[1] -translate-y-1/2 text-right text-[10px] leading-none text-white/50 tabular-nums pointer-events-none">
                        {label}
                      </span>
                    </div>
                  );
                })}
                <span className="absolute bottom-0 left-0 right-1 z-[1] translate-y-1/2 text-right text-[10px] leading-none text-white/50 tabular-nums pointer-events-none">
                  {bottomBoundaryLabel(displayStartHour, timeFormat === "24h" ? "24h" : "12h")}
                </span>
              </div>
            </div>
            {weekDays.map((day) => {
              const dayYmd = format(day, "yyyy-MM-dd");
              return (
                <div key={dayYmd} className="flex-1 min-w-[100px] border-l border-white/10 flex flex-col">
                  <div className={cn(WEEK_GRID_HEADER_CLASS, "text-xs text-white/70")}>
                    <div className="uppercase tracking-wide text-[10px] text-white/40">
                      {format(day, "EEE")}
                    </div>
                    <div className="font-medium text-white">{format(day, "d")}</div>
                  </div>
                  <div
                    data-day-col={dayYmd}
                    className="relative flex flex-col border-b border-white/15"
                    style={{ height: COLUMN_HEIGHT_PX }}
                  >
                    <div className="absolute inset-0 z-0 flex flex-col pointer-events-none">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="flex-1 min-h-0 border-t border-white/[0.1]" />
                      ))}
                    </div>
                    {canEdit ? (
                      <>
                        <div
                          className="absolute inset-0 z-[1] cursor-crosshair touch-none"
                          onPointerDown={(ev) => {
                            const col = ev.currentTarget.parentElement as HTMLElement | null;
                            const m = minutesFromY(ev.clientY, col);
                            if (m === null) return;
                            const draft: CreateDraftState = { dayYmd, a: m, b: m };
                            createDraftRef.current = draft;
                            setCreateDraft(draft);
                            ev.currentTarget.setPointerCapture(ev.pointerId);
                          }}
                          onPointerMove={(ev) => {
                            const d = createDraftRef.current;
                            if (!d || d.dayYmd !== dayYmd) return;
                            const col = document.querySelector(
                              `[data-day-col="${dayYmd}"]`
                            ) as HTMLElement | null;
                            const m = minutesFromY(ev.clientY, col);
                            if (m === null) return;
                            const next = { ...d, b: m };
                            createDraftRef.current = next;
                            setCreateDraft(next);
                          }}
                          onPointerUp={(ev) => {
                            const d = createDraftRef.current;
                            createDraftRef.current = null;
                            setCreateDraft(null);
                            try {
                              ev.currentTarget.releasePointerCapture(ev.pointerId);
                            } catch {
                              /* released */
                            }
                            if (!d || d.dayYmd !== dayYmd) return;
                            const lo = Math.min(d.a, d.b);
                            const hi = Math.max(d.a, d.b);
                            let startWin = lo;
                            let endWin = hi;
                            if (endWin - startWin < 15) {
                              endWin = Math.min(startWin + 15, MINUTES_PER_DAY);
                              if (endWin - startWin < 15) {
                                startWin = Math.max(0, endWin - 15);
                              }
                            }
                            createEntry.mutate({
                              kind: "custom",
                              startsAt: dateFromColumnAndWindowMinutes(
                                dayYmd,
                                startWin,
                                displayStartHour
                              ).toISOString(),
                              endsAt: dateFromColumnAndWindowMinutes(
                                dayYmd,
                                endWin,
                                displayStartHour
                              ).toISOString(),
                            });
                          }}
                          onPointerCancel={(ev) => {
                            createDraftRef.current = null;
                            setCreateDraft(null);
                            try {
                              ev.currentTarget.releasePointerCapture(ev.pointerId);
                            } catch {
                              /* released */
                            }
                          }}
                        />
                        {createDraft?.dayYmd === dayYmd ? (
                          <div
                            className="absolute left-0.5 right-0.5 z-[1] rounded border border-sky-400/50 bg-sky-400/15 pointer-events-none"
                            style={{
                              top: `${(Math.min(createDraft.a, createDraft.b) / MINUTES_PER_DAY) * 100}%`,
                              height: `${Math.max(
                                ((Math.abs(createDraft.b - createDraft.a) || 0) / MINUTES_PER_DAY) *
                                  100,
                                0.35
                              )}%`,
                            }}
                          />
                        ) : null}
                      </>
                    ) : null}
                    {(jobs ?? [])
                      .filter(
                        (j) =>
                          columnDayYmdForInstant(parseISO(j.plannedStartsAt), displayStartHour) ===
                          dayYmd
                      )
                      .map((j) => {
                        const logged = entryByJobId.get(j.id);
                        const { topPct, heightPct } = jobWindowMetrics(j, dayYmd);
                        return (
                          <div
                            key={`plan-${j.id}`}
                            className="absolute left-0.5 right-0.5 rounded border border-dashed border-white/25 bg-white/[0.04] px-1 text-[10px] text-white/50 pointer-events-none overflow-hidden"
                            style={{
                              top: `${Math.max(0, topPct)}%`,
                              height: `${Math.max(3, heightPct)}%`,
                            }}
                            title={j.eventTitle}
                          >
                            {j.title}
                            {logged ? null : (
                              <span className="block text-white/35">{t("time.planned")}</span>
                            )}
                          </div>
                        );
                      })}
                    {(entries ?? [])
                      .filter(
                        (e) =>
                          columnDayYmdForInstant(parseISO(e.startsAt), displayStartHour) === dayYmd
                      )
                      .map((e) => {
                        const { topPct, heightPct } = entryWindowMetrics(e, dayYmd);
                        const start = parseISO(e.startsAt);
                        const end = parseISO(e.endsAt);
                        const durMin = (end.getTime() - start.getTime()) / 60000;
                        const isJob = e.kind === "job";
                        const label =
                          isJob && e.eventShowJobId
                            ? (jobs ?? []).find((j) => j.id === e.eventShowJobId)?.title ??
                              (upcomingJobs ?? []).find((j) => j.id === e.eventShowJobId)?.title ??
                              t("time.job")
                            : e.note || t("time.customBlock");
                        const tagLabel = e.tagIds
                          .map((id) => tagById.get(id)?.name)
                          .filter(Boolean)
                          .join(", ");
                        const proj =
                          e.timeProjectId && projectById.get(e.timeProjectId)
                            ? projectById.get(e.timeProjectId)!.name
                            : null;
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "absolute left-0.5 right-0.5 rounded border px-1 pt-1 pb-2 text-[10px] overflow-hidden shadow-sm select-none",
                              isJob
                                ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-50"
                                : "border-sky-400/50 bg-sky-500/25 text-sky-50"
                            )}
                            style={{
                              top: `${Math.max(0, topPct)}%`,
                              height: `${Math.max(4, heightPct)}%`,
                              zIndex: 2,
                            }}
                            onPointerDown={(ev) => {
                              if (!canEdit) return;
                              if ((ev.target as HTMLElement).closest("[data-handle]")) return;
                              ev.currentTarget.setPointerCapture(ev.pointerId);
                              const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                              setDrag({
                                entryId: e.id,
                                kind: "move",
                                origStartWinMin: sWin,
                                origEndWinMin: sWin + durMin,
                                dayYmd,
                                durationMin: durMin,
                              });
                            }}
                          >
                            {canEdit ? (
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
                            ) : null}
                            <div className="font-medium truncate pr-4">{label}</div>
                            {proj ? <div className="text-[9px] opacity-80 truncate">{proj}</div> : null}
                            {tagLabel ? (
                              <div className="text-[9px] opacity-70 truncate">{tagLabel}</div>
                            ) : null}
                            {canEdit ? (
                              <>
                                <button
                                  type="button"
                                  data-handle="resizeStart"
                                  className="absolute top-0 left-0 right-6 h-1.5 cursor-ns-resize bg-white/15 hover:bg-white/30 rounded-t-sm"
                                  aria-hidden
                                  onPointerDown={(ev) => {
                                    ev.stopPropagation();
                                    ev.currentTarget.setPointerCapture(ev.pointerId);
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    setDrag({
                                      entryId: e.id,
                                      kind: "resizeStart",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + durMin,
                                      dayYmd,
                                      durationMin: durMin,
                                    });
                                  }}
                                />
                                <button
                                  type="button"
                                  data-handle="resizeEnd"
                                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-white/20 hover:bg-white/35 rounded-b-sm"
                                  aria-hidden
                                  onPointerDown={(ev) => {
                                    ev.stopPropagation();
                                    ev.currentTarget.setPointerCapture(ev.pointerId);
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    setDrag({
                                      entryId: e.id,
                                      kind: "resizeEnd",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + durMin,
                                      dayYmd,
                                      durationMin: durMin,
                                    });
                                  }}
                                />
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                  {canEdit ? (
                    <div className="p-1 border-t border-white/10 space-y-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-[11px] text-white/70"
                        onClick={() => {
                          const [y, mo, d] = dayYmd.split("-").map(Number);
                          const nine = new Date(y, (mo ?? 1) - 1, d ?? 1, 9, 0, 0, 0);
                          const winStart = minutesFromWindowStart(nine, dayYmd, displayStartHour);
                          const endWin = winStart + 60;
                          createEntry.mutate({
                            startsAt: dateFromColumnAndWindowMinutes(
                              dayYmd,
                              winStart,
                              displayStartHour
                            ).toISOString(),
                            endsAt: dateFromColumnAndWindowMinutes(
                              dayYmd,
                              endWin,
                              displayStartHour
                            ).toISOString(),
                            kind: "custom",
                          });
                        }}
                      >
                        {t("time.addBlock")}
                      </Button>
                      {(jobs ?? [])
                        .filter(
                          (j) =>
                            columnDayYmdForInstant(parseISO(j.plannedStartsAt), displayStartHour) ===
                              dayYmd && !entryByJobId.has(j.id)
                        )
                        .map((j) => (
                          <Button
                            key={`log-${j.id}`}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-[11px] text-emerald-300/90"
                            onClick={() => {
                              createEntry.mutate({
                                startsAt: j.plannedStartsAt,
                                endsAt: j.plannedEndsAt,
                                kind: "job",
                                eventShowJobId: j.id,
                                eventId: j.eventId,
                              });
                            }}
                          >
                            {t("time.addToTime")}: {j.title}
                          </Button>
                        ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canEdit && mode === "week" ? (
        <p className="text-xs text-white/40">{t("time.dragHint")}</p>
      ) : null}

      <TimeEntryEditSheet
        entry={editingEntry}
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
                toast({ title: t("time.entryUpdated") });
              },
            }
          );
        }}
        saving={updateEntry.isPending}
        onDelete={(id) => deleteEntry.mutate(id)}
        deleting={deleteEntry.isPending}
        entrySummary={editingEntryJobSummary}
      />
    </div>
  );
}
