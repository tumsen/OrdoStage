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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { TimeEntry, TimeProject, TimeTag, TimeTrackingJob } from "@/contracts/backendTypes";

const WEEK_STARTS_ON = 1 as const;
const DISPLAY_START_MINUTES = 6 * 60;
const DISPLAY_END_MINUTES = 23 * 60;
const DISPLAY_RANGE = DISPLAY_END_MINUTES - DISPLAY_START_MINUTES;
const PX_PER_HOUR = 40;
const COLUMN_HEIGHT_PX = ((DISPLAY_END_MINUTES - DISPLAY_START_MINUTES) / 60) * PX_PER_HOUR;

function localDayKey(iso: string): string {
  const d = parseISO(iso);
  return format(d, "yyyy-MM-dd");
}

function localMinutesFromIso(iso: string): number {
  const d = parseISO(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function snapMinutes(m: number, step = 15): number {
  return Math.round(m / step) * step;
}

function isoFromDayAndMinutes(dayYmd: string, minutesFromMidnight: number): string {
  const [y, mo, d] = dayYmd.split("-").map(Number);
  const dd = new Date(y, (mo ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const h = Math.floor(minutesFromMidnight / 60);
  const mi = minutesFromMidnight % 60;
  dd.setHours(h, mi, 0, 0);
  return dd.toISOString();
}

type DragState = {
  entryId: string;
  kind: "move" | "resize";
  origStartsMin: number;
  origEndsMin: number;
  dayYmd: string;
};

export default function TimeTracking() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { canView, canAction } = usePermissions();
  const canUsePage = canView("time");
  const canEdit = canAction("time.write");
  const readAll = canAction("time.read_all");

  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

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

  const { data: jobs } = useQuery({
    queryKey: ["time-jobs", rangeFrom, rangeTo, readAll, selectedPersonId],
    queryFn: () =>
      api.get<TimeTrackingJob[]>(`/api/time/jobs?from=${rangeFrom}&to=${rangeTo}${personQs}`),
    enabled: canUsePage && Boolean(mePerson?.id),
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

  const updateEntry = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ startsAt: string; endsAt: string }> }) =>
      api.patch<TimeEntry>(`/api/time/entries/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: () => toast({ title: t("time.saveError"), variant: "destructive" }),
  });

  const createEntry = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TimeEntry>("/api/time/entries", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ title: t("time.entryCreated") });
    },
    onError: () => toast({ title: t("time.saveError"), variant: "destructive" }),
  });

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const minutesFromY = useCallback((clientY: number, _dayYmd: string, colEl: HTMLElement | null) => {
    if (!colEl) return null;
    const rect = colEl.getBoundingClientRect();
    const y = clientY - rect.top;
    const clamped = Math.max(0, Math.min(COLUMN_HEIGHT_PX, y));
    const frac = clamped / COLUMN_HEIGHT_PX;
    const mins = DISPLAY_START_MINUTES + frac * DISPLAY_RANGE;
    return snapMinutes(Math.round(mins));
  }, []);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (!drag) return;
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const col = document.querySelector(`[data-day-col="${d.dayYmd}"]`) as HTMLElement | null;
      const m = minutesFromY(ev.clientY, d.dayYmd, col);
      setDrag(null);
      if (m === null) return;
      if (d.kind === "resize") {
        const newEnd = Math.max(d.origStartsMin + 15, Math.min(24 * 60, m));
        updateEntry.mutate({
          id: d.entryId,
          body: {
            startsAt: isoFromDayAndMinutes(d.dayYmd, d.origStartsMin),
            endsAt: isoFromDayAndMinutes(d.dayYmd, newEnd),
          },
        });
        return;
      }
      const dur = d.origEndsMin - d.origStartsMin;
      const newStart = Math.max(0, Math.min(24 * 60 - dur, m));
      const newEnd = newStart + dur;
      updateEntry.mutate({
        id: d.entryId,
        body: {
          startsAt: isoFromDayAndMinutes(d.dayYmd, newStart),
          endsAt: isoFromDayAndMinutes(d.dayYmd, newEnd),
        },
      });
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [drag, minutesFromY, updateEntry]);

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
      const k = localDayKey(e.startsAt);
      const mins =
        (parseISO(e.endsAt).getTime() - parseISO(e.startsAt).getTime()) / 60_000;
      acc.set(k, (acc.get(k) ?? 0) + mins);
    }
    return acc;
  }, [entries]);

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
            <div className="w-12 shrink-0 pt-8 text-[10px] text-white/35 text-right pr-2 space-y-0">
              {Array.from({ length: DISPLAY_END_MINUTES / 60 - DISPLAY_START_MINUTES / 60 }).map(
                (_, i) => {
                  const h = DISPLAY_START_MINUTES / 60 + i;
                  return (
                    <div key={h} style={{ height: PX_PER_HOUR }} className="border-t border-white/5">
                      {h}
                    </div>
                  );
                }
              )}
            </div>
            {weekDays.map((day) => {
              const dayYmd = format(day, "yyyy-MM-dd");
              return (
                <div key={dayYmd} className="flex-1 min-w-[100px] border-l border-white/10">
                  <div className="text-center py-2 border-b border-white/10 text-xs text-white/70">
                    <div className="uppercase tracking-wide text-[10px] text-white/40">
                      {format(day, "EEE")}
                    </div>
                    <div className="font-medium text-white">{format(day, "d")}</div>
                  </div>
                  <div
                    data-day-col={dayYmd}
                    className="relative"
                    style={{ height: COLUMN_HEIGHT_PX }}
                  >
                    {(jobs ?? [])
                      .filter((j) => localDayKey(j.plannedStartsAt) === dayYmd)
                      .map((j) => {
                        const logged = entryByJobId.get(j.id);
                        const sMin = localMinutesFromIso(j.plannedStartsAt);
                        const eMin = localMinutesFromIso(j.plannedEndsAt);
                        const top = ((sMin - DISPLAY_START_MINUTES) / DISPLAY_RANGE) * 100;
                        const h = ((eMin - sMin) / DISPLAY_RANGE) * 100;
                        return (
                          <div
                            key={`plan-${j.id}`}
                            className="absolute left-0.5 right-0.5 rounded border border-dashed border-white/25 bg-white/[0.04] px-1 text-[10px] text-white/50 pointer-events-none overflow-hidden"
                            style={{
                              top: `${Math.max(0, top)}%`,
                              height: `${Math.max(4, h)}%`,
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
                      .filter((e) => localDayKey(e.startsAt) === dayYmd)
                      .map((e) => {
                        const sMin = localMinutesFromIso(e.startsAt);
                        const eMin = localMinutesFromIso(e.endsAt);
                        const top = ((sMin - DISPLAY_START_MINUTES) / DISPLAY_RANGE) * 100;
                        const h = ((eMin - sMin) / DISPLAY_RANGE) * 100;
                        const isJob = e.kind === "job";
                        const label =
                          isJob && e.eventShowJobId
                            ? (jobs ?? []).find((j) => j.id === e.eventShowJobId)?.title ??
                              t("time.job")
                            : e.note || t("time.customBlock");
                        const tagLabel = e.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join(", ");
                        const proj =
                          e.timeProjectId && projectById.get(e.timeProjectId)
                            ? projectById.get(e.timeProjectId)!.name
                            : null;
                        return (
                          <div
                            key={e.id}
                            className={cn(
                              "absolute left-0.5 right-0.5 rounded border px-1 text-[10px] overflow-hidden shadow-sm select-none",
                              isJob
                                ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-50"
                                : "border-sky-400/50 bg-sky-500/25 text-sky-50"
                            )}
                            style={{
                              top: `${Math.max(0, top)}%`,
                              height: `${Math.max(5, h)}%`,
                              zIndex: 2,
                            }}
                            onPointerDown={(ev) => {
                              if (!canEdit) return;
                              if ((ev.target as HTMLElement).dataset.handle === "resize") return;
                              ev.currentTarget.setPointerCapture(ev.pointerId);
                              setDrag({
                                entryId: e.id,
                                kind: "move",
                                origStartsMin: sMin,
                                origEndsMin: eMin,
                                dayYmd,
                              });
                            }}
                          >
                            <div className="font-medium truncate">{label}</div>
                            {proj ? <div className="text-[9px] opacity-80 truncate">{proj}</div> : null}
                            {tagLabel ? (
                              <div className="text-[9px] opacity-70 truncate">{tagLabel}</div>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                data-handle="resize"
                                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize bg-white/20 hover:bg-white/35"
                                onPointerDown={(ev) => {
                                  ev.stopPropagation();
                                  ev.currentTarget.setPointerCapture(ev.pointerId);
                                  setDrag({
                                    entryId: e.id,
                                    kind: "resize",
                                    origStartsMin: sMin,
                                    origEndsMin: eMin,
                                    dayYmd,
                                  });
                                }}
                              />
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
                          const start = DISPLAY_START_MINUTES + 6 * 60;
                          const end = start + 60;
                          createEntry.mutate({
                            startsAt: isoFromDayAndMinutes(dayYmd, start),
                            endsAt: isoFromDayAndMinutes(dayYmd, end),
                            kind: "custom",
                          });
                        }}
                      >
                        {t("time.addBlock")}
                      </Button>
                      {(jobs ?? [])
                        .filter((j) => localDayKey(j.plannedStartsAt) === dayYmd && !entryByJobId.has(j.id))
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
                            {t("time.logJob")}: {j.title}
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
    </div>
  );
}
