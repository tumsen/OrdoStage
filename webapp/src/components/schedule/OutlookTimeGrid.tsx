import { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";
import type { CalendarItem } from "./scheduleUtils";
import {
  itemsForDay,
  itemColor,
  getItemTimeRange,
  layoutTimedBlockInDay,
  computeOverlapLayout,
} from "./scheduleUtils";

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;
const MIN_DRAG_PX = 8;

interface OutlookTimeGridProps {
  days: Date[];
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  onDeleteItem: (item: CalendarItem) => void;
  onSelectTimeRange: (start: Date, end: Date) => void;
}

function yToMinutesFromMidnight(clientY: number, columnTop: number): number {
  const y = clientY - columnTop;
  const minuteFloat = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(minuteFloat / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, snapped));
}

function getSnappedRangeMinutes(startY: number, currentY: number, columnTop: number): { lo: number; hi: number } {
  const m0 = yToMinutesFromMidnight(startY, columnTop);
  const m1 = yToMinutesFromMidnight(currentY, columnTop);
  return { lo: Math.min(m0, m1), hi: Math.max(m0, m1) };
}

function formatDragTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function minutesToDate(day: Date, minutesFromMidnight: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + minutesFromMidnight * 60 * 1000);
  return d;
}

type DragPayload = {
  day: Date;
  dayIndex: number;
  startY: number;
  currentY: number;
};

function StatusLabel({ status }: { status?: string }) {
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
}: OutlookTimeGridProps) {
  const totalHeight = 24 * HOUR_HEIGHT;
  const hours = Array.from({ length: 24 }).map((_, h) => h);

  const [drag, setDrag] = useState<DragPayload | null>(null);
  const dragRef = useRef<DragPayload | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const col = columnRefs.current[d.dayIndex];
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const { lo, hi } = getSnappedRangeMinutes(d.startY, d.currentY, rect.top);
    if (Math.abs(d.currentY - d.startY) < MIN_DRAG_PX) return;
    if (hi - lo < SNAP_MINUTES) return;
    const start = minutesToDate(d.day, lo);
    let end = minutesToDate(d.day, hi);
    if (end <= start) end = new Date(start.getTime() + SNAP_MINUTES * 60 * 1000);
    onSelectTimeRange(start, end);
  }, [onSelectTimeRange]);

  const handleColumnPointerDown = (day: Date, dayIndex: number, e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-booking-block]")) return;
    const col = columnRefs.current[dayIndex];
    if (!col) return;
    e.preventDefault();
    const payload: DragPayload = { day, dayIndex, startY: e.clientY, currentY: e.clientY };
    dragRef.current = payload;
    setDrag(payload);
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = { ...dragRef.current, currentY: ev.clientY };
      setDrag({ ...dragRef.current });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="rounded-lg border border-white/10 overflow-auto">
      <div className="min-w-[600px]">
        {/* ── Day header row ──────────────────────────────────────────────── */}
        <div className="grid sticky top-0 z-30 bg-[#0d0d14]" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-white/10 bg-white/[0.02]" />
          {days.map((d) => (
            <div key={d.toISOString()} className="border-b border-l border-white/10 bg-white/[0.02] px-2 py-2">
              <div className="text-xs text-white/80 font-medium">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className="text-[11px] text-white/40">
                {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
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
                    const venueName = item.kind === "event" ? (item.raw as EventDetail).venue?.name : undefined;
                    return (
                      <div key={item.id} className="group/all relative flex items-center">
                        <button
                          data-booking-block
                          onClick={() => onItemClick(item)}
                          className={`flex-1 text-left text-[10px] px-1.5 py-0.5 rounded font-medium truncate ${itemColor(item)}`}
                          title={[item.title, venueName && `@ ${venueName}`].filter(Boolean).join(" ")}
                        >
                          {item.title}
                          {venueName ? <span className="opacity-70"> @ {venueName}</span> : null}
                          {" "}<StatusLabel status={item.status} />
                        </button>
                        <button
                          data-booking-block
                          onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }}
                          className="absolute right-0.5 top-0.5 opacity-0 group-hover/all:opacity-100 w-4 h-4 flex items-center justify-center rounded bg-red-900/80 text-red-300 hover:bg-red-700 transition-opacity z-10"
                          title="Delete"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Time grid ──────────────────────────────────────────────────── */}
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          {/* Hour labels */}
          <div className="relative border-r border-white/10" style={{ height: totalHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute w-full text-[10px] text-white/35 pr-2 text-right pointer-events-none"
                style={{ top: h * HOUR_HEIGHT - 6 }}
              >
                {`${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const dayItems = itemsForDay(items, day);
            const timedRaw = dayItems
              .map((item) => ({ item, ...getItemTimeRange(item) }))
              .filter(({ hasExplicitTime }) => hasExplicitTime);

            const laidOut = computeOverlapLayout(timedRaw);

            let selectionOverlay: React.ReactNode = null;
            if (drag && drag.dayIndex === dayIndex) {
              const col = columnRefs.current[dayIndex];
              if (col) {
                const rect = col.getBoundingClientRect();
                const { lo, hi } = getSnappedRangeMinutes(drag.startY, drag.currentY, rect.top);
                const durMin = Math.max(hi - lo, SNAP_MINUTES);
                const topPx = (lo / 60) * HOUR_HEIGHT;
                const hPx = Math.max((durMin / 60) * HOUR_HEIGHT, 36);
                const startAt = minutesToDate(day, lo);
                const endAt = minutesToDate(day, lo === hi ? lo + SNAP_MINUTES : hi);
                selectionOverlay = (
                  <div
                    className="absolute left-1 right-1 rounded-md border-2 border-rose-400/80 bg-rose-500/25 z-[5] pointer-events-none flex flex-col justify-start px-1.5 py-1 overflow-hidden"
                    style={{ top: topPx, height: hPx }}
                  >
                    <div className="text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                      {formatDragTime(startAt)} – {formatDragTime(endAt)}
                    </div>
                    <div className="text-[9px] text-white/85 leading-tight mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                      {durMin} min
                    </div>
                  </div>
                );
              }
            }

            return (
              <div
                key={day.toISOString()}
                ref={(el) => { columnRefs.current[dayIndex] = el; }}
                className="relative border-l border-white/10 touch-none select-none"
                style={{ height: totalHeight }}
                onPointerDown={(e) => handleColumnPointerDown(day, dayIndex, e)}
              >
                {/* Hour lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-white/5 pointer-events-none z-0"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {selectionOverlay}

                {/* Timed blocks with overlap columns */}
                {laidOut.map(({ item, start, end, colIndex, totalCols }) => {
                  const layout = layoutTimedBlockInDay(day, start, end, HOUR_HEIGHT);
                  if (!layout) return null;
                  const { top, height, clippedStart, clippedEnd } = layout;

                  const venueName =
                    item.kind === "event"
                      ? (item.raw as EventDetail).venue?.name
                      : (item.raw as InternalBookingDetail).venue?.name;
                  const creatorName =
                    item.kind === "booking" ? (item.raw as InternalBookingDetail).createdBy?.name : undefined;

                  // Width / left position for overlap columns (with small gap)
                  const gapPx = 2;
                  const leftPct = (colIndex / totalCols) * 100;
                  const widthPct = (1 / totalCols) * 100;

                  // Very thin block → rotate text
                  const isThin = height < 28 || totalCols >= 4;

                  const timeLabel = `${clippedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${clippedEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                  const tooltipText = [item.title, venueName && `@ ${venueName}`, timeLabel, item.status].filter(Boolean).join(" · ");

                  return (
                    <div
                      key={`${item.id}-${colIndex}`}
                      className="absolute group/block"
                      style={{
                        top,
                        height: Math.max(height, 16),
                        left: `calc(${leftPct}% + ${gapPx}px)`,
                        width: `calc(${widthPct}% - ${gapPx * 2}px)`,
                        zIndex: 10 + colIndex,
                      }}
                    >
                      {/* Main block button */}
                      <button
                        type="button"
                        data-booking-block
                        onClick={(e) => { e.stopPropagation(); onItemClick(item); }}
                        className={`w-full h-full rounded-md text-left overflow-hidden flex flex-col shadow-sm ${itemColor(item)}`}
                        title={tooltipText}
                      >
                        {isThin ? (
                          /* Very short block: single rotated line */
                          <div
                            className="w-full h-full flex items-center px-1 overflow-hidden"
                            style={{ writingMode: height < 22 ? "vertical-rl" : undefined }}
                          >
                            <span className="truncate font-semibold text-[9px] leading-tight whitespace-nowrap">
                              {item.title}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full px-1.5 py-1 overflow-hidden">
                            {/* Title line */}
                            <div className="truncate font-semibold text-[11px] leading-tight shrink-0">
                              {item.title}
                              {venueName && item.kind === "event" ? (
                                <span className="font-normal opacity-75"> @ {venueName}</span>
                              ) : null}
                            </div>
                            {/* Time + status line */}
                            <div className="flex items-center gap-1 text-[10px] leading-tight mt-0.5 opacity-90 flex-1 min-h-0 overflow-hidden">
                              <span className="truncate shrink-0">
                                {timeLabel}
                                {item.kind === "booking" && venueName ? ` · ${venueName}` : ""}
                                {creatorName ? ` · ${creatorName}` : ""}
                              </span>
                              <StatusLabel status={item.status} />
                            </div>
                          </div>
                        )}
                      </button>

                      {/* Delete button — appears on hover */}
                      <button
                        type="button"
                        data-booking-block
                        onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }}
                        className="absolute top-0.5 right-0.5 opacity-0 group-hover/block:opacity-100 w-4 h-4 flex items-center justify-center rounded bg-black/60 text-white/80 hover:bg-red-700 hover:text-white transition-opacity z-20"
                        title="Delete"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
