import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";
import type { CalendarItem } from "./scheduleUtils";
import {
  itemsForDay,
  itemColor,
  getItemTimeRange,
  layoutTimedBlockInDay,
  computeOverlapLayout,
  calendarItemVenueName,
} from "./scheduleUtils";
import { usePreferences } from "@/hooks/usePreferences";
import {
  CALENDAR_GRID_SCROLLER_CLASS,
  CALENDAR_PX_PER_HOUR,
  CALENDAR_STICKY_HEADER_CHROME,
  CALENDAR_TIME_GRID_TOP_PAD_PX,
  findColumnIndexAtX,
  WEEK_GRID_MIN_DRAG_PX,
} from "@/lib/weekGridColumns";
import { bottomBoundaryLabel, formatHourLabel } from "@/lib/timeGrid";
import { cn } from "@/lib/utils";

const SNAP_MINUTES = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_GRID_HEADER_CLASS =
  "min-h-[6.75rem] shrink-0 border-b border-white/10 box-border flex flex-col items-stretch justify-center gap-0.5 px-1.5 py-2";

interface OutlookTimeGridProps {
  days: Date[];
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  /** Omitted in read-only views (no delete affordances). */
  onDeleteItem?: (item: CalendarItem) => void;
  /** Omitted when drag-to-create new bookings is disabled. */
  onSelectTimeRange?: (start: Date, end: Date) => void;
  className?: string;
  /** Called when a booking block is dragged to a new position. */
  onUpdateItemTime?: (item: CalendarItem, start: Date, end: Date) => void;
  /** Called when a booking's lock button is toggled. */
  onToggleLock?: (item: CalendarItem, locked: boolean) => void;
  /** Hide all edit/delete/create gestures (venue detail month view). */
  readOnly?: boolean;
  /** Narrow day headers (weekday + day number) for many columns at once. */
  compactDayHeaders?: boolean;
  /** Scale hour band height so 00:00–24:00 fills the vertical space (parent must be a flex column with bounded height). */
  fitHoursVertically?: boolean;
}

/** Snap wall-clock minutes within a calendar day; 1440 = end of day (midnight), same as `dateFromDayAndMinutes`. */
function snapMinutesFromMidnight(rawMinutes: number): number {
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(24 * 60, snapped));
}

function snapMin(value: number): number {
  return Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;
}

function formatDragTime(d: Date, hour12: boolean): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12 });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dateFromDayAndMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day);
  d.setTime(d.getTime() + minutes * 60 * 1000);
  return d;
}

function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

function allSameLocalMonth(days: Date[]): boolean {
  if (days.length === 0) return false;
  const y = days[0]!.getFullYear();
  const m = days[0]!.getMonth();
  return days.every((d) => d.getFullYear() === y && d.getMonth() === m);
}

type CreateDragPayload = {
  day: Date;
  dayIndex: number;
  startY: number;
  currentY: number;
  /** Day index the pointer is currently over (may differ from start day). */
  currentDayIndex: number;
};

type MoveMode = "move" | "resize-start" | "resize-end";

type MoveDragPayload = {
  item: CalendarItem;
  mode: MoveMode;
  origStartMs: number;
  origEndMs: number;
  startDayIndex: number;
  startX: number;
  startY: number;
  currentY: number;
  currentDayIndex: number;
  passed: boolean;
};

function isBookingItem(item: CalendarItem): item is CalendarItem & { raw: InternalBookingDetail } {
  return item.kind === "booking";
}

function isItemLocked(item: CalendarItem): boolean {
  return isBookingItem(item) && (item.raw as InternalBookingDetail & { isLocked?: boolean }).isLocked === true;
}

function blocksOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function StatusLabel({ status }: { status?: string }) {
  if (status === "confirmed")
    return (
      <span className="shrink-0 text-[8px] font-semibold uppercase px-1 py-px rounded bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 leading-none">
        Confirmed
      </span>
    );
  if (status === "draft")
    return (
      <span className="shrink-0 text-[8px] font-semibold uppercase px-1 py-px rounded bg-ordo-yellow/30 text-ordo-yellow border border-ordo-yellow/50 leading-none">
        Draft
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="shrink-0 text-[8px] font-semibold uppercase px-1 py-px rounded bg-red-950/60 text-red-400 border border-red-700/50 leading-none">
        Cancelled
      </span>
    );
  return null;
}

export function OutlookTimeGrid({
  days,
  items,
  onItemClick,
  onDeleteItem,
  onSelectTimeRange,
  className = "",
  onUpdateItemTime,
  onToggleLock,
  readOnly = false,
  compactDayHeaders = false,
  fitHoursVertically = false,
}: OutlookTimeGridProps) {
  const { effective } = usePreferences();
  const timeFormat = effective?.timeFormat === "12h" ? "12h" : "24h";
  const locale = effective?.language === "da" ? "da-DK" : effective?.language === "de" ? "de-DE" : "en-US";

  const compactMonthBannerLabel = useMemo(() => {
    if (!compactDayHeaders || days.length === 0 || !allSameLocalMonth(days)) return null;
    return days[0]!.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }, [compactDayHeaders, days, locale]);

  const timeSheetRef = useRef<HTMLDivElement | null>(null);
  const [timeSheetHeight, setTimeSheetHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!fitHoursVertically) {
      setTimeSheetHeight(null);
      return;
    }
    const el = timeSheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (!Number.isFinite(h) || h < 48) return;
      setTimeSheetHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitHoursVertically, days.length]);

  const hourHeightPx = useMemo(() => {
    if (!fitHoursVertically || timeSheetHeight == null) return CALENDAR_PX_PER_HOUR;
    const inner = timeSheetHeight - CALENDAR_TIME_GRID_TOP_PAD_PX;
    return Math.max(6, inner / 24);
  }, [fitHoursVertically, timeSheetHeight]);

  const yToMinutesFromMidnight = useCallback(
    (clientY: number, columnTop: number) => {
      const y = clientY - columnTop;
      return snapMinutesFromMidnight((y / hourHeightPx) * 60);
    },
    [hourHeightPx]
  );

  const rawMinutesFromY = useCallback(
    (clientY: number, columnTop: number) => ((clientY - columnTop) / hourHeightPx) * 60,
    [hourHeightPx]
  );

  const totalHeight = 24 * hourHeightPx;
  /** Outer column height: grid body + top inset (mirrors breathing room above bottom pad row). */
  const columnFrameHeight = totalHeight + CALENDAR_TIME_GRID_TOP_PAD_PX;
  const hours = Array.from({ length: 24 }).map((_, h) => h);

  const [createDrag, setCreateDrag] = useState<CreateDragPayload | null>(null);
  const createDragRef = useRef<CreateDragPayload | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDragPayload | null>(null);
  const moveDragRef = useRef<MoveDragPayload | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Create drag (drag empty space to make a new booking) ────────────────
  const endCreateDrag = useCallback(() => {
    const d = createDragRef.current;
    createDragRef.current = null;
    setCreateDrag(null);
    if (!d) return;
    const startCol = columnRefs.current[d.dayIndex];
    if (!startCol) return;
    const startMin = yToMinutesFromMidnight(d.startY, startCol.getBoundingClientRect().top);

    const endIdx = Math.max(0, Math.min(days.length - 1, d.currentDayIndex));
    const endCol = columnRefs.current[endIdx];
    if (!endCol) return;
    const endMin = yToMinutesFromMidnight(d.currentY, endCol.getBoundingClientRect().top);

    const dxDays = endIdx - d.dayIndex;
    const dyMin = endMin - startMin;
    const totalMin = dxDays * 24 * 60 + dyMin;
    if (
      Math.abs(d.currentY - d.startY) < WEEK_GRID_MIN_DRAG_PX &&
      Math.abs(totalMin) < SNAP_MINUTES &&
      dxDays === 0
    ) {
      return;
    }

    let startDayIdx = d.dayIndex;
    let startMinutes = startMin;
    let endDayIdx = endIdx;
    let endMinutes = endMin;
    if (totalMin < 0) {
      startDayIdx = endIdx;
      startMinutes = endMin;
      endDayIdx = d.dayIndex;
      endMinutes = startMin;
    }

    const startDay = days[startDayIdx];
    const endDay = days[endDayIdx];
    if (!startDay || !endDay) return;
    const startDate = dateFromDayAndMinutes(startDay, startMinutes);
    let endDate = dateFromDayAndMinutes(endDay, endMinutes);
    if (endDate <= startDate) {
      endDate = new Date(startDate.getTime() + SNAP_MINUTES * 60 * 1000);
    }
    if (endDate.getTime() - startDate.getTime() < SNAP_MINUTES * 60 * 1000) return;
    onSelectTimeRange?.(startDate, endDate);
  }, [onSelectTimeRange, days, yToMinutesFromMidnight]);

  const handleColumnPointerDown = (day: Date, dayIndex: number, e: React.PointerEvent) => {
    if (readOnly || !onSelectTimeRange) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-booking-block]")) return;
    const col = columnRefs.current[dayIndex];
    if (!col) return;
    e.preventDefault();
    const payload: CreateDragPayload = {
      day,
      dayIndex,
      startY: e.clientY,
      currentY: e.clientY,
      currentDayIndex: dayIndex,
    };
    createDragRef.current = payload;
    setCreateDrag(payload);
    const onMove = (ev: PointerEvent) => {
      if (!createDragRef.current) return;
      const nextIdx = findColumnIndexAtX(columnRefs.current, ev.clientX, createDragRef.current.dayIndex);
      createDragRef.current = {
        ...createDragRef.current,
        currentY: ev.clientY,
        currentDayIndex: nextIdx,
      };
      setCreateDrag({ ...createDragRef.current });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      endCreateDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ── Move drag (drag a booking block to reposition it) ───────────────────
  const computeMovedRange = useCallback(
    (m: MoveDragPayload): { start: Date; end: Date } | null => {
      const startCol = columnRefs.current[m.startDayIndex];
      const curCol = columnRefs.current[m.currentDayIndex];
      if (!startCol || !curCol) return null;

      if (m.mode === "move") {
        const rawStart = rawMinutesFromY(m.startY, startCol.getBoundingClientRect().top);
        const rawCur = rawMinutesFromY(m.currentY, curCol.getBoundingClientRect().top);
        const dxDays = m.currentDayIndex - m.startDayIndex;
        const totalDeltaMin = dxDays * 24 * 60 + (rawCur - rawStart);
        const snappedDeltaMs = snapMin(totalDeltaMin) * 60 * 1000;
        return {
          start: new Date(m.origStartMs + snappedDeltaMs),
          end: new Date(m.origEndMs + snappedDeltaMs),
        };
      }

      // Resize uses the absolute pointer position so the edge follows the pointer.
      const day = days[m.currentDayIndex];
      if (!day) return null;
      const rawMin = rawMinutesFromY(m.currentY, curCol.getBoundingClientRect().top);
      const ptMs = startOfDay(day).getTime() + snapMinutesFromMidnight(rawMin) * 60 * 1000;

      if (m.mode === "resize-start") {
        const maxStart = m.origEndMs - SNAP_MINUTES * 60 * 1000;
        const newStart = Math.min(ptMs, maxStart);
        return { start: new Date(newStart), end: new Date(m.origEndMs) };
      }

      // resize-end
      const minEnd = m.origStartMs + SNAP_MINUTES * 60 * 1000;
      const newEnd = Math.max(ptMs, minEnd);
      return { start: new Date(m.origStartMs), end: new Date(newEnd) };
    },
    [days, rawMinutesFromY]
  );

  const endMoveDrag = useCallback(() => {
    const m = moveDragRef.current;
    moveDragRef.current = null;
    setMoveDrag(null);
    if (!m) return;
    if (!m.passed) {
      // Treat as a click — open the editor.
      onItemClick(m.item);
      return;
    }
    const next = computeMovedRange(m);
    if (!next) return;
    if (next.start.getTime() === m.origStartMs && next.end.getTime() === m.origEndMs) return;
    onUpdateItemTime?.(m.item, next.start, next.end);
  }, [onItemClick, onUpdateItemTime, computeMovedRange]);

  const startMoveDrag = (
    item: CalendarItem,
    dayIndex: number,
    mode: MoveMode,
    e: React.PointerEvent
  ) => {
    if (readOnly) return;
    if (!isBookingItem(item)) {
      onItemClick(item);
      return;
    }
    if (item.disabled) return;
    if (isItemLocked(item) || !onUpdateItemTime) {
      if (mode === "move") onItemClick(item);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const range = getItemTimeRange(item);
    if (!range.start || !range.end) {
      onItemClick(item);
      return;
    }
    const payload: MoveDragPayload = {
      item,
      mode,
      origStartMs: range.start.getTime(),
      origEndMs: range.end.getTime(),
      startDayIndex: dayIndex,
      startX: e.clientX,
      startY: e.clientY,
      currentY: e.clientY,
      currentDayIndex: dayIndex,
      // Resize feedback should be immediate; "move" still requires a small
      // displacement so a plain click stays a click.
      passed: mode !== "move",
    };
    moveDragRef.current = payload;
    setMoveDrag(payload);
    const onMove = (ev: PointerEvent) => {
      if (!moveDragRef.current) return;
      const dx = ev.clientX - moveDragRef.current.startX;
      const dy = ev.clientY - moveDragRef.current.startY;
      const passed =
        moveDragRef.current.passed || Math.hypot(dx, dy) >= WEEK_GRID_MIN_DRAG_PX;
      const nextIdx = findColumnIndexAtX(columnRefs.current, ev.clientX, moveDragRef.current.startDayIndex);
      moveDragRef.current = {
        ...moveDragRef.current,
        currentY: ev.clientY,
        currentDayIndex: nextIdx,
        passed,
      };
      setMoveDrag({ ...moveDragRef.current });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      endMoveDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={cn(
        fitHoursVertically
          ? "min-h-0 flex-1 flex flex-col overflow-x-auto overflow-y-visible rounded-xl border border-white/10 bg-white/[0.02]"
          : CALENDAR_GRID_SCROLLER_CLASS,
        className
      )}
    >
      <div
        className={cn("min-w-0", fitHoursVertically && "flex min-h-0 flex-1 flex-col")}
        style={{
          minWidth: days.length > 10 ? `${Math.max(420, 48 + days.length * 22)}px` : "720px",
        }}
      >
        <div className={`${CALENDAR_STICKY_HEADER_CHROME} shrink-0 border-b border-white/10`}>
          {compactMonthBannerLabel ? (
            <div
              className="grid shrink-0 border-b border-white/10 bg-white/[0.04]"
              style={{ gridTemplateColumns: `56px minmax(0, 1fr)` }}
            >
              <div className="border-r border-white/10 bg-white/[0.02]" aria-hidden />
              <div className="px-2 py-1.5 text-center text-[11px] font-semibold text-white/85 tabular-nums">
                {compactMonthBannerLabel}
              </div>
            </div>
          ) : null}
          {/* ── Day header row ──────────────────────────────────────────────── */}
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div
              className={cn(
                "w-full border-b-0",
                compactDayHeaders
                  ? "min-h-[3.75rem] shrink-0 border-b border-white/10 box-border flex flex-col items-stretch justify-center px-1 py-1"
                  : WEEK_GRID_HEADER_CLASS
              )}
              aria-hidden
            />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={cn(
                  "border-l border-white/10",
                  compactDayHeaders
                    ? "min-h-[3.75rem] shrink-0 border-b border-white/10 box-border flex flex-col items-stretch justify-center px-0.5 py-1 text-[10px] text-white/75"
                    : `${WEEK_GRID_HEADER_CLASS} text-xs text-white/70`
                )}
              >
                {compactDayHeaders ? (
                  <div className="flex flex-col items-center justify-center text-center min-w-0">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-white/70 leading-none">
                      {d.toLocaleDateString(locale, { weekday: "short" })}
                    </div>
                    <div className="text-[12px] font-bold text-white tabular-nums leading-none mt-1">
                      {d.getDate()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[11px] text-white font-semibold leading-tight">
                        {d.toLocaleDateString(locale, { weekday: "long" })}
                      </div>
                      <div className="mt-1 text-[10px] text-white/60 leading-snug">
                        {d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      <div className="text-[10px] text-white/45 leading-snug mt-0.5 tabular-nums">
                        W{getIsoWeek(d)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── All-day strip ──────────────────────────────────────────────── */}
          {days.some((d) => itemsForDay(items, d).some((i) => !getItemTimeRange(i).hasExplicitTime)) && (
            <div className="grid border-b border-white/10" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="bg-white/[0.01] border-r border-white/10 flex items-center justify-end pr-1.5 py-1">
                <span className="text-[9px] text-white/25 uppercase tracking-wide">All day</span>
              </div>
              {days.map((day) => {
                const allDay = itemsForDay(items, day).filter((i) => !getItemTimeRange(i).hasExplicitTime);
                return (
                  <div key={day.toISOString()} className="border-l border-white/10 bg-white/[0.01] p-0.5 min-h-[28px] flex flex-col gap-0.5">
                    {allDay.map((item) => {
                      const eventVenueName =
                        item.kind === "job"
                          ? item.venueLabel
                          : item.kind === "tour"
                            ? item.venueLabel
                            : item.kind === "event"
                              ? (item.raw as EventDetail).venue?.name
                              : undefined;
                      const isDisabled = item.disabled === true;
                      return (
                        <div key={item.id} className="group/all relative flex items-center">
                          <button
                            data-booking-block
                            onClick={() => { if (!isDisabled) onItemClick(item); }}
                            className={`flex-1 text-left text-[10px] px-1.5 py-0.5 rounded font-medium truncate ${itemColor(item)} ${
                              isDisabled ? "opacity-40 saturate-50 cursor-not-allowed" : ""
                            }`}
                            title={[
                              isDisabled ? "Occupied:" : null,
                              item.title,
                              eventVenueName && `@ ${eventVenueName}`,
                            ].filter(Boolean).join(" ")}
                          >
                            {item.title}
                            {eventVenueName ? <span className="opacity-70"> @ {eventVenueName}</span> : null}
                            {" "}<StatusLabel status={item.status} />
                          </button>
                          {onDeleteItem && !readOnly && (item.kind === "job" || item.kind === "tour" || isDisabled ? null : (
                            <button
                              data-booking-block
                              onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }}
                              className="absolute right-0.5 top-0.5 opacity-0 group-hover/all:opacity-100 w-4 h-4 flex items-center justify-center rounded bg-red-900/80 text-red-300 hover:bg-red-700 transition-opacity z-10"
                              title="Delete"
                            >
                              <Trash2 size={9} />
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Time grid ──────────────────────────────────────────────────── */}
        <div
          ref={fitHoursVertically ? timeSheetRef : undefined}
          className={cn(fitHoursVertically && "flex min-h-0 flex-1 flex-col")}
        >
        <div
          className={cn("grid min-h-0", fitHoursVertically && "h-full min-h-0")}
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {/* Hour labels — border-r only on the grid band (not through top inset above 00:00). */}
          <div className="relative box-border" style={{ height: columnFrameHeight }}>
            <div
              className="pointer-events-none absolute inset-x-0 border-r border-white/10"
              style={{
                top: CALENDAR_TIME_GRID_TOP_PAD_PX,
                height: totalHeight,
              }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute left-0 right-1 z-[1] flex -translate-y-1/2 items-end justify-end text-right text-[9px] leading-[10px] text-white/50 tabular-nums"
                  style={{ top: h * hourHeightPx }}
                >
                  {formatHourLabel(h, timeFormat)}
                </div>
              ))}
              <span className="pointer-events-none absolute bottom-0 left-0 right-1 z-[1] flex translate-y-1 items-end justify-end text-right text-[9px] leading-[10px] text-white/50 tabular-nums">
                {bottomBoundaryLabel(0, timeFormat)}
              </span>
            </div>
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const dayItems = itemsForDay(items, day);
            const timedRaw = dayItems
              .map((item) => ({ item, ...getItemTimeRange(item) }))
              .filter(({ hasExplicitTime }) => hasExplicitTime);

            const backgroundRaw = timedRaw.filter(({ item }) => item.renderBehind === true);
            const foregroundRaw = timedRaw.filter(({ item }) => item.renderBehind !== true);
            const laidOut = computeOverlapLayout(foregroundRaw);

            // Create-drag selection overlay (faded red rectangle).
            let selectionOverlay: React.ReactNode = null;
            if (createDrag) {
              const startCol = columnRefs.current[createDrag.dayIndex];
              const endIdxRaw = Math.max(0, Math.min(days.length - 1, createDrag.currentDayIndex));
              const endCol = columnRefs.current[endIdxRaw];
              if (startCol && endCol) {
                const startMin0 = yToMinutesFromMidnight(createDrag.startY, startCol.getBoundingClientRect().top);
                const endMin0 = yToMinutesFromMidnight(createDrag.currentY, endCol.getBoundingClientRect().top);
                const dxDays = endIdxRaw - createDrag.dayIndex;
                const totalMin = dxDays * 24 * 60 + (endMin0 - startMin0);
                let startDayIdx = createDrag.dayIndex;
                let startMinutes = startMin0;
                let endDayIdx = endIdxRaw;
                let endMinutes = endMin0;
                if (totalMin < 0) {
                  startDayIdx = endIdxRaw;
                  startMinutes = endMin0;
                  endDayIdx = createDrag.dayIndex;
                  endMinutes = startMin0;
                }

                if (dayIndex >= startDayIdx && dayIndex <= endDayIdx) {
                  const segStart = dayIndex === startDayIdx ? startMinutes : 0;
                  let segEnd = dayIndex === endDayIdx ? endMinutes : 24 * 60;
                  if (dayIndex === startDayIdx && dayIndex === endDayIdx && segEnd === segStart) {
                    segEnd = segStart + SNAP_MINUTES;
                  }
                  const topPx = (segStart / 60) * hourHeightPx;
                  const hPx = Math.max(((segEnd - segStart) / 60) * hourHeightPx, 18);
                  const showLabel = dayIndex === startDayIdx;
                  const startDay = days[startDayIdx];
                  const endDay = days[endDayIdx];
                  const startAt = startDay ? dateFromDayAndMinutes(startDay, startMinutes) : null;
                  const endAtRaw = endDay
                    ? dateFromDayAndMinutes(
                        endDay,
                        endMinutes === startMinutes && startDayIdx === endDayIdx
                          ? endMinutes + SNAP_MINUTES
                          : endMinutes
                      )
                    : null;
                  const totalDurMin = startAt && endAtRaw
                    ? Math.max(SNAP_MINUTES, Math.round((endAtRaw.getTime() - startAt.getTime()) / 60000))
                    : SNAP_MINUTES;
                  selectionOverlay = (
                    <div
                      className="absolute left-1 right-1 rounded-md border-2 border-rose-400/80 bg-rose-500/25 z-[5] pointer-events-none flex flex-col justify-start px-1.5 py-1 overflow-hidden"
                      style={{ top: topPx, height: hPx }}
                    >
                      {showLabel && startAt && endAtRaw ? (
                        <>
                          <div className="text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                            {formatDragTime(startAt, effective?.timeFormat === "12h")} – {formatDragTime(endAtRaw, effective?.timeFormat === "12h")}
                          </div>
                          <div className="text-[9px] text-white/85 leading-tight mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                            {endDayIdx > startDayIdx
                              ? `${endDayIdx - startDayIdx + 1} days · ${Math.round(totalDurMin / 60)}h ${totalDurMin % 60}m`
                              : `${totalDurMin} min`}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                }
              }
            }

            // Move-drag preview overlay for the dragged booking.
            let moveOverlay: React.ReactNode = null;
            if (moveDrag && moveDrag.passed) {
              const next = computeMovedRange(moveDrag);
              if (next) {
                const layout = layoutTimedBlockInDay(day, next.start, next.end, hourHeightPx);
                if (layout) {
                  const { top, height, clippedStart, clippedEnd } = layout;
                  const isFirst =
                    next.start.getTime() >= startOfDay(day).getTime() &&
                    next.start.getTime() < startOfDay(day).getTime() + DAY_MS;
                  const draggedVenue = calendarItemVenueName(moveDrag.item);
                  const hour12Move = effective?.timeFormat === "12h";
                  const moveTimePart = `${formatDragTime(clippedStart, hour12Move)} – ${formatDragTime(clippedEnd, hour12Move)}`;
                  const movePreviewFullTitle = [
                    moveDrag.item.title,
                    draggedVenue && `@ ${draggedVenue}`,
                    moveTimePart,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  moveOverlay = (
                    <div
                      key="move-preview"
                      className="absolute left-1 right-1 rounded-md border-2 border-rose-400/80 bg-rose-500/30 z-[6] pointer-events-none flex flex-col justify-start px-1.5 py-1 overflow-hidden"
                      style={{ top, height: Math.max(height, 18) }}
                      title={movePreviewFullTitle}
                    >
                      {isFirst ? (
                        <>
                          <div className="text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate">
                            {moveDrag.item.title}
                            {draggedVenue ? (
                              <span className="font-normal opacity-80"> @ {draggedVenue}</span>
                            ) : null}
                          </div>
                          <div className="text-[9px] text-white/90 leading-tight mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                            {moveTimePart}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[9px] text-white/90 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] shrink-0 truncate">
                            {moveTimePart}
                          </div>
                          <div className="text-[9px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] truncate mt-0.5">
                            {moveDrag.item.title}
                            {draggedVenue ? (
                              <span className="font-normal opacity-80"> @ {draggedVenue}</span>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  );
                }
              }
            }

            return (
              <div
                key={day.toISOString()}
                className="relative box-border"
                style={{ height: columnFrameHeight }}
              >
                <div
                  ref={(el) => {
                    columnRefs.current[dayIndex] = el;
                  }}
                  className="absolute inset-x-0 touch-none select-none border-l border-white/10"
                  style={{
                    top: CALENDAR_TIME_GRID_TOP_PAD_PX,
                    height: totalHeight,
                  }}
                  onPointerDown={(e) => handleColumnPointerDown(day, dayIndex, e)}
                >
                  {/* Hour lines + explicit line at end of day (24:00). */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0 z-0 border-t border-white/[0.1]"
                      style={{ top: h * hourHeightPx }}
                    />
                  ))}
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 border-t border-white/[0.1]" />

                  {selectionOverlay}
                  {moveOverlay}

                {/* Event-linked venue bookings render as a backing layer, not an
                    overlap column. If they overlap this event/show, use the
                    foreground block's width so the booking visually belongs to it. */}
                {backgroundRaw.map(({ item, start, end }) => {
                  const layout = layoutTimedBlockInDay(day, start, end, hourHeightPx);
                  if (!layout) return null;
                  const { top, height, clippedStart, clippedEnd } = layout;
                  const booking = item.raw as InternalBookingDetail & { eventId?: string | null };
                  const eventTargets = laidOut.filter((fg) => {
                    if (fg.item.kind !== "event") return false;
                    const ev = fg.item.raw as EventDetail;
                    return ev.id === booking.eventId;
                  });
                  const target =
                    eventTargets.find((fg) => blocksOverlap(start, end, fg.start, fg.end)) ??
                    eventTargets.find((fg) => {
                      const fgDayStart = startOfDay(fg.start).getTime();
                      const fgDayEnd = fgDayStart + DAY_MS;
                      return start.getTime() < fgDayEnd && end.getTime() > fgDayStart;
                    }) ??
                    eventTargets[0];

                  const gapPx = 2;
                  const leftPct = target ? (target.colIndex / target.totalCols) * 100 : 0;
                  const widthPct = target ? (1 / target.totalCols) * 100 : 100;
                  const isLocked = isItemLocked(item);
                  const canDrag = !readOnly && isBookingItem(item) && !item.disabled && !isLocked && Boolean(onUpdateItemTime);
                  const isBeingDragged = moveDrag?.item.id === item.id && moveDrag.passed;
                  const timeLabel = `${clippedStart.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: effective?.timeFormat === "12h",
                  })}–${clippedEnd.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: effective?.timeFormat === "12h",
                  })}`;
                  const venueNm = calendarItemVenueName(item);
                  const bgTooltip = ["Venue booking", item.title, venueNm && `@ ${venueNm}`, timeLabel]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <div
                      key={`behind-${item.id}`}
                      className={`absolute group/behind ${isBeingDragged ? "opacity-30" : ""}`}
                      style={{
                        top: Math.max(0, top - 2),
                        height: Math.max(height + 4, 20),
                        left: target ? `calc(${leftPct}% + ${gapPx}px)` : `${gapPx}px`,
                        width: target ? `calc(${widthPct}% - ${gapPx * 2}px)` : `calc(100% - ${gapPx * 2}px)`,
                      }}
                    >
                      <div
                        data-booking-block
                        className={`absolute inset-0 rounded-lg border-2 border-rose-300/80 bg-rose-500/20 shadow-[0_0_0_1px_rgba(244,63,94,0.35)] ${
                          canDrag ? "cursor-grab active:cursor-grabbing" : ""
                        }`}
                        style={{ zIndex: 4 }}
                        title={bgTooltip}
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).closest("[data-handle]")) return;
                          if (canDrag) startMoveDrag(item, dayIndex, "move", e);
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-handle]")) return;
                          if (canDrag) return;
                          e.stopPropagation();
                          onItemClick(item);
                        }}
                      />

                      <div
                        className={cn(
                          "pointer-events-none absolute inset-0 z-[5] flex min-h-0 flex-col justify-end overflow-hidden px-1",
                          height < 40 ? "justify-center pb-1 pt-1" : "pb-7 pr-7 pt-6"
                        )}
                        aria-hidden
                      >
                        <div className="truncate text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.92)]">
                          {item.title}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] leading-tight text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.92)]">
                          {[venueNm && `@ ${venueNm}`, timeLabel].filter(Boolean).join(" · ")}
                        </div>
                      </div>

                      {!readOnly ? (
                        <>
                          <button
                            type="button"
                            data-handle="edit"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onItemClick(item);
                            }}
                            className="absolute top-0.5 right-0.5 z-[30] w-5 h-5 flex items-center justify-center rounded text-white/90 bg-rose-950/70 hover:bg-rose-800 hover:text-white transition-colors"
                            title="Edit venue booking"
                          >
                            <Pencil size={11} />
                          </button>
                          {onToggleLock ? (
                            <button
                              type="button"
                              data-handle="lock"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleLock(item, !isLocked);
                              }}
                              className={`absolute top-[26px] right-0.5 z-[30] w-5 h-5 flex items-center justify-center rounded text-white/90 ${
                                isLocked ? "bg-amber-700/80 hover:bg-amber-700" : "bg-rose-950/70 hover:bg-rose-800"
                              } hover:text-white transition-colors`}
                              title={isLocked ? "Unlock venue booking" : "Lock venue booking"}
                            >
                              {isLocked ? <Lock size={11} /> : <LockOpen size={11} />}
                            </button>
                          ) : null}
                          {!isLocked ? (
                            <button
                              type="button"
                              data-handle="delete"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem?.(item);
                              }}
                              className="absolute bottom-0.5 right-0.5 z-[30] w-5 h-5 flex items-center justify-center rounded text-white/90 bg-rose-950/70 hover:bg-red-700 hover:text-white transition-colors"
                              title="Delete venue booking"
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : (
                            <span
                              className="absolute bottom-0.5 left-0.5 z-[30] inline-flex items-center gap-1 rounded bg-black/45 px-1 py-0.5 text-[9px] text-white/85"
                              title="Locked. Unlock to edit, move or delete."
                            >
                              <Lock className="h-2.5 w-2.5" />
                              Locked
                            </span>
                          )}
                        </>
                      ) : null}

                      {canDrag && !readOnly && height >= 14 ? (
                        <>
                          {start.getTime() === clippedStart.getTime() ? (
                            <div
                              data-handle="resize-top"
                              onPointerDown={(e) => startMoveDrag(item, dayIndex, "resize-start", e)}
                              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-[40] hover:bg-rose-200/20"
                              title="Drag to change venue booking start time"
                            />
                          ) : null}
                          {end.getTime() === clippedEnd.getTime() ? (
                            <div
                              data-handle="resize-bottom"
                              onPointerDown={(e) => startMoveDrag(item, dayIndex, "resize-end", e)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-[40] hover:bg-rose-200/20"
                              title="Drag to change venue booking end time"
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}

                {/* Timed blocks with overlap columns */}
                {laidOut.map(({ item, start, end, colIndex, totalCols }) => {
                  const layout = layoutTimedBlockInDay(day, start, end, hourHeightPx);
                  if (!layout) return null;
                  const { top, height, clippedStart, clippedEnd } = layout;
                  const isDisabled = item.disabled === true;
                  const isBooking = isBookingItem(item);
                  const isLocked = isItemLocked(item);
                  const canDrag = !readOnly && isBooking && !isDisabled && !isLocked && Boolean(onUpdateItemTime);
                  const isBeingDragged = moveDrag?.item.id === item.id && moveDrag.passed;

                  const venueName = calendarItemVenueName(item);
                  const creatorName =
                    item.kind === "booking" ? (item.raw as InternalBookingDetail).createdBy?.name : undefined;

                  const gapPx = 2;
                  const leftPct = (colIndex / totalCols) * 100;
                  const widthPct = (1 / totalCols) * 100;

                  const isThin = height < 28 || totalCols >= 4;

                  const timeLabel = `${clippedStart.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: effective?.timeFormat === "12h",
                  })}–${clippedEnd.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: effective?.timeFormat === "12h",
                  })}`;
                  const tooltipText = [item.title, venueName && `@ ${venueName}`, timeLabel, item.status].filter(Boolean).join(" · ");

                  const showInlineActions = !readOnly && isBooking && !isDisabled && Boolean(onToggleLock || onUpdateItemTime);

                  return (
                    <div
                      key={`${item.id}-${colIndex}`}
                      className={`absolute group/block ${isBeingDragged ? "opacity-30" : ""}`}
                      style={{
                        top,
                        height: Math.max(height, 16),
                        left: `calc(${leftPct}% + ${gapPx}px)`,
                        width: `calc(${widthPct}% - ${gapPx * 2}px)`,
                        zIndex: 10 + colIndex,
                      }}
                    >
                      <div
                        data-booking-block
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).closest("[data-handle]")) return;
                          if (canDrag) {
                            startMoveDrag(item, dayIndex, "move", e);
                          }
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-handle]")) return;
                          if (canDrag) return;
                          e.stopPropagation();
                          if (!isDisabled) onItemClick(item);
                        }}
                        className={`w-full h-full rounded-md text-left overflow-hidden flex flex-col shadow-sm ${itemColor(item)} ${
                          isDisabled ? "opacity-40 saturate-50 cursor-not-allowed" : ""
                        } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                        title={isDisabled ? `Occupied · ${tooltipText}` : tooltipText}
                      >
                        {isThin ? (
                          <div
                            className="w-full h-full flex items-center px-1 overflow-hidden"
                            style={{ writingMode: height < 22 ? "vertical-rl" : undefined }}
                          >
                            <span className="truncate font-semibold text-[9px] leading-tight whitespace-nowrap">
                              {item.title}
                              {venueName ? ` · ${venueName}` : ""}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full px-1.5 py-1 overflow-hidden">
                            <div className={cn("truncate font-semibold text-[11px] leading-tight shrink-0", readOnly ? "pr-1" : "pr-9")}>
                              {item.title}
                              {venueName ? <span className="font-normal opacity-75"> @ {venueName}</span> : null}
                            </div>
                            <div
                              className={cn(
                                "flex items-center gap-1 text-[10px] leading-tight mt-0.5 opacity-90 flex-1 min-h-0 overflow-hidden",
                                readOnly ? "pr-1" : "pr-9"
                              )}
                            >
                              <span className="truncate shrink-0">
                                {timeLabel}
                                {creatorName ? ` · ${creatorName}` : ""}
                              </span>
                              <StatusLabel status={item.status} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Locked badge (bottom-left) */}
                      {isBooking && isLocked && !isThin ? (
                        <span
                          className="absolute bottom-0.5 left-0.5 z-[3] inline-flex items-center gap-1 rounded bg-black/40 px-1 py-0.5 text-[9px] text-white/85"
                          title="Locked. Unlock to edit, move or delete."
                        >
                          <Lock className="h-2.5 w-2.5" />
                          Locked
                        </span>
                      ) : null}

                      {/* Resize handles — only on the segment that contains the actual edge.
                          Bookings spanning multiple day columns get the top handle on the
                          first segment and the bottom handle on the last. */}
                      {canDrag && !readOnly && height >= 14 ? (
                        <>
                          {start.getTime() === clippedStart.getTime() ? (
                            <div
                              data-handle="resize-top"
                              onPointerDown={(e) => startMoveDrag(item, dayIndex, "resize-start", e)}
                              className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-[40] hover:bg-white/15"
                              title="Drag to change start time"
                            />
                          ) : null}
                          {end.getTime() === clippedEnd.getTime() ? (
                            <div
                              data-handle="resize-bottom"
                              onPointerDown={(e) => startMoveDrag(item, dayIndex, "resize-end", e)}
                              className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-[40] hover:bg-white/15"
                              title="Drag to change end time"
                            />
                          ) : null}
                        </>
                      ) : null}

                      {/* Inline action buttons for bookings (edit / lock / delete). */}
                      {showInlineActions ? (
                        <>
                          {onUpdateItemTime ? (
                            <button
                              type="button"
                              data-handle="edit"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onItemClick(item);
                              }}
                              className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded text-white/85 bg-black/35 hover:bg-black/55 hover:text-white transition-colors z-20"
                              title="Edit"
                            >
                              <Pencil size={11} />
                            </button>
                          ) : null}
                          {onToggleLock ? (
                            <button
                              type="button"
                              data-handle="lock"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleLock(item, !isLocked);
                              }}
                              className={`absolute top-[26px] right-0.5 w-5 h-5 flex items-center justify-center rounded text-white/85 ${
                                isLocked ? "bg-amber-700/70 hover:bg-amber-700" : "bg-black/35 hover:bg-black/55"
                              } hover:text-white transition-colors z-20`}
                              title={isLocked ? "Unlock" : "Lock"}
                            >
                              {isLocked ? <Lock size={11} /> : <LockOpen size={11} />}
                            </button>
                          ) : null}
                          {!isLocked ? (
                            <button
                              type="button"
                              data-handle="delete"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteItem?.(item);
                              }}
                              className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded text-white/85 bg-black/35 hover:bg-red-700 hover:text-white transition-colors z-20"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : null}
                        </>
                      ) : readOnly || item.kind === "job" || item.kind === "tour" || isDisabled || isBooking ? null : (
                        <button
                          type="button"
                          data-handle="delete"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem?.(item);
                          }}
                          className="absolute top-0.5 right-0.5 opacity-0 group-hover/block:opacity-100 w-4 h-4 flex items-center justify-center rounded bg-black/60 text-white/80 hover:bg-red-700 hover:text-white transition-opacity z-20"
                          title="Delete"
                        >
                          <Trash2 size={9} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            );
          })}
        </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="h-6 shrink-0" />
          {days.map((day) => (
            <div key={`pad-${day.toISOString()}`} className="h-6 shrink-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
