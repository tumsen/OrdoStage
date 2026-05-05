import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
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
  Pencil,
  BarChart2,
  Trash2,
} from "lucide-react";
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
import { displayHex, hexToRgba } from "@/lib/timeCatalogColors";
import { TimeEntryEditSheet } from "@/components/time/TimeEntryEditSheet";
import { TimeCatalogSettings } from "@/components/time/TimeCatalogSettings";
import type { TimeEntry, TimeProject, TimeTag, TimeTrackingJob } from "@/contracts/backendTypes";
import type { Language, TimeFormat } from "@/lib/preferences";
import {
  MINUTES_PER_DAY,
  TIME_SNAP_MINUTES,
  bottomBoundaryLabel,
  clampMinutesToDay,
  columnDayYmdForInstant,
  dateFromColumnAndWindowMinutes,
  formatHourLabel,
  minutesFromWindowStart,
  rawWindowMinutesFromY,
  snapWindowMinutes,
} from "@/lib/timeGrid";

const WEEK_STARTS_ON = 1 as const;
const PX_PER_HOUR = 36;
const COLUMN_HEIGHT_PX = (MINUTES_PER_DAY / 60) * PX_PER_HOUR;
/** Same height for corner spacer and day headers so the hour grid lines up with columns. */
const WEEK_GRID_HEADER_CLASS =
  "min-h-[6.75rem] shrink-0 border-b border-white/10 box-border flex flex-col items-stretch justify-center gap-0.5 px-1.5 py-2";

function dateFnsLocale(language: Language): Locale {
  if (language === "da") return localeDa;
  if (language === "de") return localeDe;
  return localeEnGB;
}

const DISPLAY_START_STORAGE_KEY = "timeGrid.displayStartHour";

function readDisplayStartHour(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(DISPLAY_START_STORAGE_KEY);
  const n = v !== null ? Number.parseInt(v, 10) : 0;
  if (!Number.isFinite(n) || n < 0 || n > 23) return 0;
  return n;
}

/** Same idea as schedule booking: ignore plain clicks; require real drag distance. */
const MIN_CREATE_DRAG_PX = 8;
const MIN_ENTRY_MOVE_DRAG_PX = 8;

type EntryDragRef = {
  entryId: string;
  kind: "move" | "resizeEnd" | "resizeStart";
  origStartWinMin: number;
  origEndWinMin: number;
  dayYmd: string;
  durationMin: number;
  /** Move only: set until pointer moves past MIN_ENTRY_MOVE_DRAG_PX (plain click → edit). */
  moveStartClientX?: number;
  moveStartClientY?: number;
  moveThresholdPassed?: boolean;
};

type CreateDragRef = {
  dayYmd: string;
  startY: number;
  currentY: number;
  /** True once pointer moved far enough to show selection (not a bare click). */
  thresholdPassed: boolean;
};

function pctRangeFromWindowMinutes(lo: number, hi: number): { topPct: number; heightPct: number } {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  const topPct = (clampMinutesToDay(a) / MINUTES_PER_DAY) * 100;
  const heightPct = Math.max(((b - a) / MINUTES_PER_DAY) * 100, 0.35);
  return { topPct, heightPct };
}

function formatDurationShort(totalMin: number): string {
  const m = Math.round(totalMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  if (!Number.isFinite(m) || m <= 0) return "0 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

/** Snap local wall-clock to grid for on-block labels. */
function snapLocalClockToGrid(d: Date): Date {
  const x = new Date(d.getTime());
  let mins = x.getHours() * 60 + x.getMinutes();
  mins = Math.round(mins / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  mins = Math.min(mins, MINUTES_PER_DAY - TIME_SNAP_MINUTES);
  x.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return x;
}

export default function TimeTracking() {
  const { t, language } = useI18n();
  const dfLocale = useMemo(() => dateFnsLocale(language), [language]);
  const queryClient = useQueryClient();
  const { effective } = usePreferences();
  const timeFormat: TimeFormat = effective?.timeFormat ?? "24h";
  const { canView, canAction } = usePermissions();
  const canUsePage = canView("time");
  const canEdit = canAction("time.write");
  const readAll = canAction("time.read_all");
  const canManageTimeCatalog = canAction("time.manage_catalog");

  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(true);
  const [displayStartHour, setDisplayStartHour] = useState(readDisplayStartHour);

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

  const rangeFrom = format(mode === "week" ? weekStart : startOfMonth(anchor), "yyyy-MM-dd");
  const rangeTo = format(mode === "week" ? weekEnd : endOfMonth(anchor), "yyyy-MM-dd");

  const { data: peopleForFilter } = useQuery({
    queryKey: ["time-people"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; email: string | null }>>("/api/time/people"),
    enabled: readAll,
  });

  type MePerson = { id: string; weeklyContractHours?: number | null; vacationDaysPerYear?: number | null };
  const { data: mePerson } = useQuery({
    queryKey: ["people", "me"],
    queryFn: () => api.get<MePerson | null>("/api/people/me"),
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
        category: string;
        isLocked: boolean;
      }>;
    }) => api.patch<TimeEntry>(`/api/time/entries/${id}`, body),
    onMutate: (variables) => {
      const previous = queryClient.getQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] });
      queryClient.setQueriesData<TimeEntry[]>({ queryKey: ["time-entries"] }, (old) => {
        if (!old) return old;
        return old.map((x) => {
          if (x.id !== variables.id) return x;
          const b = variables.body;
          return {
            ...x,
            ...(b.startsAt !== undefined ? { startsAt: b.startsAt } : {}),
            ...(b.endsAt !== undefined ? { endsAt: b.endsAt } : {}),
            ...(b.note !== undefined ? { note: b.note } : {}),
            ...(b.timeProjectId !== undefined ? { timeProjectId: b.timeProjectId } : {}),
            ...(b.tagIds !== undefined ? { tagIds: b.tagIds } : {}),
            ...(b.category !== undefined
              ? { category: b.category as TimeEntry["category"] }
              : {}),
            ...(b.isLocked !== undefined ? { isLocked: b.isLocked } : {}),
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
        eventId: body.eventId != null ? (body.eventId as string) : null,
        timeProjectId: body.timeProjectId != null ? (body.timeProjectId as string) : null,
        note: body.note != null ? (body.note as string) : null,
        isLocked: body.isLocked === true,
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
      toast({ title: t("time.entryCreated") });
    },
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

  /** Live position + window minutes while dragging (labels follow pointer; snap on release). */
  const [dragOverride, setDragOverride] = useState<{
    entryId: string;
    dayYmd: string;
    topPct: number;
    heightPct: number;
    startWinMin: number;
    endWinMin: number;
  } | null>(null);

  const entryDragRef = useRef<EntryDragRef | null>(null);
  const createDragRef = useRef<CreateDragRef | null>(null);
  const activeColElRef = useRef<HTMLElement | null>(null);
  const createOverlayEls = useRef<Record<string, HTMLDivElement | null>>({});
  const displayStartHourRef = useRef(displayStartHour);

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

  /** Live ISO range while dragging the entry open in the sheet (matches grid labels). */
  const entryLiveDragRange = useMemo(() => {
    if (!dragOverride || !editingEntryId || dragOverride.entryId !== editingEntryId) return null;
    const sh = displayStartHour;
    return {
      startsAt: dateFromColumnAndWindowMinutes(
        dragOverride.dayYmd,
        dragOverride.startWinMin,
        sh
      ).toISOString(),
      endsAt: dateFromColumnAndWindowMinutes(
        dragOverride.dayYmd,
        dragOverride.endWinMin,
        sh
      ).toISOString(),
    };
  }, [dragOverride, editingEntryId, displayStartHour]);

  const minutesFromY = useCallback((clientY: number, colEl: HTMLElement | null) => {
    if (!colEl) return null;
    const rect = colEl.getBoundingClientRect();
    const raw = rawWindowMinutesFromY(clientY, rect.top, COLUMN_HEIGHT_PX);
    return snapWindowMinutes(raw);
  }, []);

  const hideCreateOverlay = useCallback((dayYmd: string) => {
    const el = createOverlayEls.current[dayYmd];
    if (el) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    }
  }, []);

  const updateCreateOverlayDom = useCallback(
    (dayYmd: string, loRaw: number, hiRaw: number) => {
      const el = createOverlayEls.current[dayYmd];
      if (!el) return;
      const lo = Math.min(loRaw, hiRaw);
      const hi = Math.max(loRaw, hiRaw);
      const { topPct, heightPct } = pctRangeFromWindowMinutes(lo, hi);
      el.style.opacity = "1";
      el.style.top = `${topPct}%`;
      el.style.height = `${heightPct}%`;
      const lineEl = el.querySelector("[data-create-line]");
      const durEl = el.querySelector("[data-create-dur]");
      const startAt = dateFromColumnAndWindowMinutes(
        dayYmd,
        lo,
        displayStartHourRef.current
      );
      const endAt = dateFromColumnAndWindowMinutes(dayYmd, hi, displayStartHourRef.current);
      const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
      if (lineEl)
        lineEl.textContent = `${format(startAt, tf)} – ${format(endAt, tf)}`;
      if (durEl) durEl.textContent = formatDurationShort(hi - lo);
    },
    [timeFormat]
  );

  useEffect(() => {
    if (editingEntryId && !editingEntry) setEditingEntryId(null);
  }, [editingEntryId, editingEntry]);

  const attachCreateDragListeners = useCallback(
    (dayYmd: string, startClientY: number) => {
      const col = document.querySelector(`[data-day-col="${dayYmd}"]`) as HTMLElement | null;
      if (!col) return;
      createDragRef.current = {
        dayYmd,
        startY: startClientY,
        currentY: startClientY,
        thresholdPassed: false,
      };

      let createRafPending = false;
      let latestClientY = startClientY;

      const onMove = (ev: PointerEvent) => {
        const c = createDragRef.current;
        if (!c || c.dayYmd !== dayYmd) return;
        c.currentY = ev.clientY;
        if (!c.thresholdPassed) {
          if (Math.abs(ev.clientY - c.startY) < MIN_CREATE_DRAG_PX) return;
          c.thresholdPassed = true;
        }
        latestClientY = ev.clientY;
        if (createRafPending) return;
        createRafPending = true;
        requestAnimationFrame(() => {
          createRafPending = false;
          const c2 = createDragRef.current;
          if (!c2 || c2.dayYmd !== dayYmd) return;
          const r = col.getBoundingClientRect();
          const curRaw = rawWindowMinutesFromY(latestClientY, r.top, COLUMN_HEIGHT_PX);
          const startRaw2 = rawWindowMinutesFromY(c2.startY, r.top, COLUMN_HEIGHT_PX);
          updateCreateOverlayDom(dayYmd, snapWindowMinutes(curRaw), snapWindowMinutes(startRaw2));
        });
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        const c = createDragRef.current;
        createDragRef.current = null;
        if (!c || c.dayYmd !== dayYmd) return;
        const r = col.getBoundingClientRect();
        const dy = Math.abs(ev.clientY - c.startY);

        if (dy < MIN_CREATE_DRAG_PX || !c.thresholdPassed) {
          if (c.thresholdPassed) hideCreateOverlay(c.dayYmd);
          return;
        }

        const startRaw = rawWindowMinutesFromY(c.startY, r.top, COLUMN_HEIGHT_PX);
        const endRaw = rawWindowMinutesFromY(ev.clientY, r.top, COLUMN_HEIGHT_PX);
        const lo = Math.min(startRaw, endRaw);
        const hi = Math.max(startRaw, endRaw);

        let startWin = snapWindowMinutes(lo);
        let endWin = snapWindowMinutes(hi);
        if (endWin - startWin < TIME_SNAP_MINUTES) {
          endWin = Math.min(startWin + TIME_SNAP_MINUTES, MINUTES_PER_DAY);
          if (endWin - startWin < TIME_SNAP_MINUTES) {
            startWin = Math.max(0, endWin - TIME_SNAP_MINUTES);
          }
        }
        if (endWin <= startWin) {
          hideCreateOverlay(dayYmd);
          return;
        }

        createEntry.mutate(
          {
            kind: "custom",
            startsAt: dateFromColumnAndWindowMinutes(
              dayYmd,
              startWin,
              displayStartHourRef.current
            ).toISOString(),
            endsAt: dateFromColumnAndWindowMinutes(dayYmd, endWin, displayStartHourRef.current).toISOString(),
          },
          {
            onSuccess: (created) => {
              setEditingEntryId(created.id);
            },
            onSettled: () => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => hideCreateOverlay(dayYmd));
              });
            },
          }
        );
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [createEntry, hideCreateOverlay, updateCreateOverlayDom, setEditingEntryId]
  );

  const attachEntryDragListeners = useCallback(() => {
    const onMove = (ev: PointerEvent) => {
      const col = activeColElRef.current;
      const cur = entryDragRef.current;
      if (!cur || !col) return;
      const r = col.getBoundingClientRect();
      const mSnap = snapWindowMinutes(rawWindowMinutesFromY(ev.clientY, r.top, COLUMN_HEIGHT_PX));

      if (cur.kind === "move") {
        if (!cur.moveThresholdPassed) {
          const sx = cur.moveStartClientX ?? ev.clientX;
          const sy = cur.moveStartClientY ?? ev.clientY;
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;
          if (dx * dx + dy * dy < MIN_ENTRY_MOVE_DRAG_PX * MIN_ENTRY_MOVE_DRAG_PX) return;
          cur.moveThresholdPassed = true;
        }
        const dur =
          Math.max(TIME_SNAP_MINUTES, Math.round(cur.durationMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES);
        const newStart = clampMinutesToDay(Math.max(0, Math.min(MINUTES_PER_DAY - dur, mSnap)));
        const newEnd = newStart + dur;
        const { topPct, heightPct } = pctRangeFromWindowMinutes(newStart, newEnd);
        setDragOverride({
          entryId: cur.entryId,
          dayYmd: cur.dayYmd,
          topPct,
          heightPct,
          startWinMin: newStart,
          endWinMin: newEnd,
        });
        return;
      }

      if (cur.kind === "resizeEnd") {
        const newEnd = clampMinutesToDay(
          Math.max(cur.origStartWinMin + TIME_SNAP_MINUTES, mSnap)
        );
        const { topPct, heightPct } = pctRangeFromWindowMinutes(cur.origStartWinMin, newEnd);
        setDragOverride({
          entryId: cur.entryId,
          dayYmd: cur.dayYmd,
          topPct,
          heightPct,
          startWinMin: cur.origStartWinMin,
          endWinMin: newEnd,
        });
        return;
      }

      if (cur.kind === "resizeStart") {
        const newStart = clampMinutesToDay(
          Math.min(mSnap, cur.origEndWinMin - TIME_SNAP_MINUTES)
        );
        const { topPct, heightPct } = pctRangeFromWindowMinutes(newStart, cur.origEndWinMin);
        setDragOverride({
          entryId: cur.entryId,
          dayYmd: cur.dayYmd,
          topPct,
          heightPct,
          startWinMin: newStart,
          endWinMin: cur.origEndWinMin,
        });
      }
    };

    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const d = entryDragRef.current;
      const col = activeColElRef.current;
      if (!d || !col) {
        entryDragRef.current = null;
        activeColElRef.current = null;
        setDragOverride(null);
        return;
      }
      const m = minutesFromY(ev.clientY, col);
      entryDragRef.current = null;
      activeColElRef.current = null;
      const sh = displayStartHourRef.current;

      if (d.kind === "move" && !d.moveThresholdPassed) {
        setEditingEntryId(d.entryId);
        setDragOverride(null);
        return;
      }

      if (m === null) {
        setDragOverride(null);
        return;
      }

      if (d.kind === "resizeEnd") {
        const newEndWin = clampMinutesToDay(Math.max(d.origStartWinMin + TIME_SNAP_MINUTES, m));
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: dateFromColumnAndWindowMinutes(d.dayYmd, d.origStartWinMin, sh).toISOString(),
            endsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newEndWin, sh).toISOString(),
          },
        });
        setDragOverride(null);
        return;
      }

      if (d.kind === "resizeStart") {
        const newStartWin = clampMinutesToDay(Math.min(m, d.origEndWinMin - TIME_SNAP_MINUTES));
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newStartWin, sh).toISOString(),
            endsAt: dateFromColumnAndWindowMinutes(d.dayYmd, d.origEndWinMin, sh).toISOString(),
          },
        });
        setDragOverride(null);
        return;
      }

      const dur =
        Math.max(TIME_SNAP_MINUTES, Math.round(d.durationMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES);
      const newStartWin = clampMinutesToDay(Math.max(0, Math.min(MINUTES_PER_DAY - dur, m)));
      const newEndWin = clampMinutesToDay(newStartWin + dur);
      updateEntry.mutate({
        id: d.entryId,
        body: {
          startsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newStartWin, sh).toISOString(),
          endsAt: dateFromColumnAndWindowMinutes(d.dayYmd, newEndWin, sh).toISOString(),
        },
      });
      setDragOverride(null);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [minutesFromY, updateEntry, setEditingEntryId]);

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

  // Hours per work day (for vacation/sick day sizing). Danish default: 37h/wk ÷ 5 = 7.4h
  const hoursPerWorkDay =
    mePerson.weeklyContractHours != null ? mePerson.weeklyContractHours / 5 : 7.4;

  const weekJobIds = new Set((jobs ?? []).map((j) => j.id));
  const hasUpcomingUnlogged =
    mode === "week" &&
    (upcomingJobs ?? []).some((j) => !entryByJobId.has(j.id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t("time.title")}</h2>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 whitespace-nowrap">
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
          {readAll && (
            <Link to="/time/reports">
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
          )}
        </div>
      </div>

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
          )}
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
                      <span className="absolute left-0 right-1 top-0 z-[1] -translate-y-1/2 text-right text-[10px] leading-[10px] text-white/50 tabular-nums pointer-events-none">
                        {label}
                      </span>
                    </div>
                  );
                })}
                <span className="absolute bottom-0 left-0 right-1 z-[1] translate-y-1/2 text-right text-[10px] leading-[10px] text-white/50 tabular-nums pointer-events-none">
                  {bottomBoundaryLabel(displayStartHour, timeFormat === "24h" ? "24h" : "12h")}
                </span>
              </div>
              <div className="h-6 border-b border-white/15" />
            </div>
            {weekDays.map((day) => {
              const dayYmd = format(day, "yyyy-MM-dd");
              const dayOffEntry = (entries ?? []).find(
                (e) =>
                  (e.category === "vacation" || e.category === "sick" || e.category === "holiday") &&
                  columnDayYmdForInstant(parseISO(e.startsAt), displayStartHour) === dayYmd
              );
              const dayOffCategory = dayOffEntry?.category ?? null;
              const dayOffColors: Record<string, { bg: string; text: string; border: string }> = {
                vacation: { bg: "bg-emerald-500/8", text: "text-emerald-300", border: "border-emerald-500/25" },
                sick: { bg: "bg-orange-500/8", text: "text-orange-300", border: "border-orange-500/25" },
                holiday: { bg: "bg-purple-500/8", text: "text-purple-300", border: "border-purple-500/25" },
              };
              const col = dayOffCategory ? dayOffColors[dayOffCategory] : null;

              const addDayOff = (category: "vacation" | "sick") => {
                if (!canEdit) return;
                // Start at 09:00 UTC for the day, span hoursPerWorkDay
                const [y, m, d] = dayYmd.split("-").map(Number);
                const startsAt = new Date(Date.UTC(y!, m! - 1, d!, 8, 0, 0));
                const endsAt = new Date(startsAt.getTime() + hoursPerWorkDay * 60 * 60 * 1000);
                createEntry.mutate({
                  startsAt: startsAt.toISOString(),
                  endsAt: endsAt.toISOString(),
                  kind: "custom",
                  category,
                });
              };

              return (
                <div key={dayYmd} className="flex-1 min-w-[100px] border-l border-white/10 flex flex-col group">
                  <div className={cn(WEEK_GRID_HEADER_CLASS, "text-xs text-white/70", col?.bg, col ? `border-b ${col.border}` : "")}>
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
                        <div className="text-[10px] text-white/60 leading-snug mt-1">
                          {format(day, "d MMMM yyyy", { locale: dfLocale })}
                        </div>
                        <div className="text-[10px] text-white/45 leading-snug mt-0.5 tabular-nums">
                          {t("time.calendarWeekIso", { week: getISOWeek(day) })}
                        </div>
                      </div>
                      {canEdit && !dayOffEntry ? (
                        <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title={t("time.addVacationDay")}
                            onClick={() => addDayOff("vacation")}
                            className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300/70 hover:bg-emerald-500/30 hover:text-emerald-200 leading-none"
                          >
                            V
                          </button>
                          <button
                            type="button"
                            title={t("time.addSickDay")}
                            onClick={() => addDayOff("sick")}
                            className="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-500/15 text-orange-300/70 hover:bg-orange-500/30 hover:text-orange-200 leading-none"
                          >
                            S
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {dayOffEntry ? (
                      <div className={cn("text-[9px] font-medium mt-1 capitalize", col?.text)}>
                        {t(`time.category${dayOffEntry.category.charAt(0).toUpperCase()}${dayOffEntry.category.slice(1)}` as never)}
                      </div>
                    ) : null}
                  </div>
                  <div
                    data-day-col={dayYmd}
                    className={cn("relative flex flex-col", col?.bg)}
                    style={{ height: COLUMN_HEIGHT_PX }}
                  >
                    {col && (
                      <div className={cn("absolute inset-0 z-0 pointer-events-none", col.bg)} />
                    )}
                    <div className="absolute inset-0 z-0 flex flex-col pointer-events-none">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="flex-1 min-h-0 border-t border-white/[0.1]" />
                      ))}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 z-0 border-t border-white/[0.1] pointer-events-none" />
                    {canEdit ? (
                      <>
                        <div
                          className="absolute inset-0 z-[1] cursor-crosshair touch-none"
                          onPointerDown={(ev) => {
                            ev.preventDefault();
                            attachCreateDragListeners(dayYmd, ev.clientY);
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
                            className="absolute left-0.5 right-0.5 z-[2] flex flex-col rounded border border-dashed border-white/25 bg-white/[0.04] px-1 py-0.5 text-[10px] text-white/50 overflow-hidden select-none"
                            style={{
                              top: `${Math.max(0, topPct)}%`,
                              height: `${Math.max(3, heightPct)}%`,
                            }}
                            title={j.eventTitle}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                            }}
                          >
                            <div className="min-h-0 flex-1 overflow-hidden leading-tight">
                              <div className="font-medium text-white/65 truncate">{j.title}</div>
                              {logged ? null : (
                                <span className="block text-[9px] text-white/35">{t("time.planned")}</span>
                              )}
                            </div>
                            {canEdit && !logged ? (
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
                        const isLocked = e.isLocked === true;
                        const cat = e.category ?? "work";
                        const isDayOff = cat === "vacation" || cat === "sick" || cat === "holiday";
                        const label =
                          isDayOff
                            ? t(`time.category${cat.charAt(0).toUpperCase()}${cat.slice(1)}` as never)
                            : isJob && e.eventShowJobId
                            ? (jobs ?? []).find((j) => j.id === e.eventShowJobId)?.title ??
                              (upcomingJobs ?? []).find((j) => j.id === e.eventShowJobId)?.title ??
                              t("time.job")
                            : t("time.customBlock");
                        const projEntity = e.timeProjectId
                          ? projectById.get(e.timeProjectId)
                          : undefined;
                        const projStripe = projEntity
                          ? displayHex(projEntity.color, projEntity.id)
                          : null;
                        const proj = projEntity?.name ?? null;
                        const timeTf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
                        const override =
                          dragOverride?.entryId === e.id ? dragOverride : null;
                        const colYmd = override?.dayYmd ?? dayYmd;
                        const liveStart =
                          override &&
                          dateFromColumnAndWindowMinutes(
                            colYmd,
                            override.startWinMin,
                            displayStartHour
                          );
                        const liveEnd =
                          override &&
                          dateFromColumnAndWindowMinutes(
                            colYmd,
                            override.endWinMin,
                            displayStartHour
                          );
                        const startDisp = override && liveStart && liveEnd
                          ? snapLocalClockToGrid(liveStart)
                          : snapLocalClockToGrid(start);
                        const endDisp = override && liveStart && liveEnd
                          ? snapLocalClockToGrid(liveEnd)
                          : snapLocalClockToGrid(end);
                        const startTimeLabel = format(startDisp, timeTf);
                        const endTimeLabel = format(endDisp, timeTf);
                        const durForLabel = override && liveStart && liveEnd
                          ? Math.max(
                              TIME_SNAP_MINUTES,
                              Math.round(
                                (liveEnd.getTime() - liveStart.getTime()) /
                                  60000 /
                                  TIME_SNAP_MINUTES
                              ) * TIME_SNAP_MINUTES
                            )
                          : Math.max(
                              TIME_SNAP_MINUTES,
                              Math.round(durMin / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES
                            );
                        const durationLabel = formatDurationShort(durForLabel);
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "absolute left-0.5 right-0.5 rounded border px-1 pt-1 pb-2 text-[10px] overflow-hidden shadow-sm select-none",
                              cat === "vacation"
                                ? "border-emerald-400/60 bg-emerald-500/30 text-emerald-50"
                                : cat === "sick"
                                ? "border-orange-400/60 bg-orange-500/30 text-orange-50"
                                : cat === "holiday"
                                ? "border-purple-400/60 bg-purple-500/30 text-purple-50"
                                : isJob
                                ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-50"
                                : "border-sky-400/50 bg-sky-500/25 text-sky-50",
                              isLocked ? "opacity-90" : ""
                            )}
                            data-entry-block={e.id}
                            style={{
                              top: `${override?.topPct ?? Math.max(0, topPct)}%`,
                              height: `${override?.heightPct ?? Math.max(4, heightPct)}%`,
                              zIndex: 2,
                              ...(projStripe
                                ? { boxShadow: `inset 4px 0 0 0 ${projStripe}` }
                                : {}),
                            }}
                            onPointerDown={(ev) => {
                              if (!canEdit) return;
                              if (isLocked) return;
                              if ((ev.target as HTMLElement).closest("[data-handle]")) return;
                              const col = (ev.currentTarget as HTMLElement).closest("[data-day-col]");
                              activeColElRef.current = col instanceof HTMLElement ? col : null;
                              const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                              entryDragRef.current = {
                                entryId: e.id,
                                kind: "move",
                                origStartWinMin: sWin,
                                origEndWinMin: sWin + durMin,
                                dayYmd,
                                durationMin: durMin,
                                moveStartClientX: ev.clientX,
                                moveStartClientY: ev.clientY,
                                moveThresholdPassed: false,
                              };
                              attachEntryDragListeners();
                            }}
                          >
                            {canEdit ? (
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
                                          toast({
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
                            <div className="font-medium truncate pr-4">{label}</div>
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
                            {canEdit ? (
                              <>
                                <button
                                  type="button"
                                  data-handle="resizeStart"
                                  className="absolute top-0 left-0 right-6 h-1.5 cursor-ns-resize bg-white/15 hover:bg-white/30 rounded-t-sm"
                                  aria-hidden
                                  onPointerDown={(ev) => {
                                    if (isLocked) return;
                                    ev.stopPropagation();
                                    const col = (ev.currentTarget as HTMLElement).closest(
                                      "[data-day-col]"
                                    );
                                    activeColElRef.current = col instanceof HTMLElement ? col : null;
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    entryDragRef.current = {
                                      entryId: e.id,
                                      kind: "resizeStart",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + durMin,
                                      dayYmd,
                                      durationMin: durMin,
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
                                    const col = (ev.currentTarget as HTMLElement).closest(
                                      "[data-day-col]"
                                    );
                                    activeColElRef.current = col instanceof HTMLElement ? col : null;
                                    const sWin = minutesFromWindowStart(start, dayYmd, displayStartHour);
                                    entryDragRef.current = {
                                      entryId: e.id,
                                      kind: "resizeEnd",
                                      origStartWinMin: sWin,
                                      origEndWinMin: sWin + durMin,
                                      dayYmd,
                                      durationMin: durMin,
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
                  <div className="h-6 border-b border-white/15" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canManageTimeCatalog && mode === "week" ? (
        <div className="mt-8 space-y-3">
          <TimeCatalogSettings />
        </div>
      ) : null}

      {canEdit && mode === "week" ? (
        <p className="text-xs text-white/40">{t("time.dragHint")}</p>
      ) : null}

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
                toast({ title: t("time.entryUpdated") });
              },
            }
          );
        }}
        onToggleLock={(id, locked) => {
          updateEntry.mutate(
            { id, body: { isLocked: locked } },
            {
              onSuccess: () => {
                toast({ title: locked ? t("time.entryLocked") : t("time.entryUnlocked") });
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
