import { useCallback, useRef, useState } from "react";
import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";
import type { CalendarItem } from "./scheduleUtils";
import {
  itemsForDay,
  itemColor,
  getItemTimeRange,
  layoutTimedBlockInDay,
} from "./scheduleUtils";

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 15;
const MIN_DRAG_PX = 8;

interface OutlookTimeGridProps {
  days: Date[];
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  onSelectTimeRange: (start: Date, end: Date) => void;
}

function yToMinutesFromMidnight(clientY: number, columnTop: number): number {
  const y = clientY - columnTop;
  const minuteFloat = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(minuteFloat / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(24 * 60 - SNAP_MINUTES, snapped));
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

export function OutlookTimeGrid({ days, items, onItemClick, onSelectTimeRange }: OutlookTimeGridProps) {
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
    const top = rect.top;
    const m0 = yToMinutesFromMidnight(d.startY, top);
    const m1 = yToMinutesFromMidnight(d.currentY, top);
    const lo = Math.min(m0, m1);
    const hi = Math.max(m0, m1);
    if (Math.abs(d.currentY - d.startY) < MIN_DRAG_PX) return;
    if (hi - lo < SNAP_MINUTES) return;

    const start = minutesToDate(d.day, lo);
    let end = minutesToDate(d.day, hi);
    if (end <= start) {
      end = new Date(start.getTime() + SNAP_MINUTES * 60 * 1000);
    }
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
      <div className="min-w-[860px]">
        <div className="grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}>
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

        <div className="grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}>
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

          {days.map((day, dayIndex) => {
            const dayItems = itemsForDay(items, day);
            const timed = dayItems
              .map((item) => ({ item, ...getItemTimeRange(item) }))
              .filter(({ hasExplicitTime }) => hasExplicitTime);
            const allDay = dayItems
              .map((item) => ({ item, ...getItemTimeRange(item) }))
              .filter(({ hasExplicitTime }) => !hasExplicitTime);

            let selectionOverlay: React.ReactNode = null;
            if (drag && drag.dayIndex === dayIndex) {
              const col = columnRefs.current[dayIndex];
              if (col) {
                const rect = col.getBoundingClientRect();
                const topPx = Math.min(drag.startY, drag.currentY) - rect.top;
                const hPx = Math.abs(drag.currentY - drag.startY);
                selectionOverlay = (
                  <div
                    className="absolute left-1 right-1 rounded-md border-2 border-rose-400/80 bg-rose-500/25 z-[5] pointer-events-none"
                    style={{ top: topPx, height: Math.max(hPx, 4) }}
                  />
                );
              }
            }

            return (
              <div
                key={day.toISOString()}
                ref={(el) => {
                  columnRefs.current[dayIndex] = el;
                }}
                className="relative border-l border-white/10 touch-none select-none"
                style={{ height: totalHeight }}
                onPointerDown={(e) => handleColumnPointerDown(day, dayIndex, e)}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-white/5 pointer-events-none z-0"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {allDay.map(({ item }, idx) => (
                  <button
                    type="button"
                    key={`${item.id}-all-${idx}`}
                    data-booking-block
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemClick(item);
                    }}
                    className="absolute left-1 right-1 rounded px-2 py-1 text-[10px] truncate text-left bg-white/10 text-white/80 hover:bg-white/20 z-20"
                    style={{ top: 2 + idx * 20 }}
                    title={item.title}
                  >
                    All day - {item.title}
                  </button>
                ))}

                {selectionOverlay}

                {timed.map(({ item, start, end }, idx) => {
                  const layout = layoutTimedBlockInDay(day, start, end, HOUR_HEIGHT);
                  if (!layout) return null;
                  const { top, height, clippedStart, clippedEnd } = layout;
                  const venueName =
                    item.kind === "event"
                      ? (item.raw as EventDetail).venue?.name
                      : (item.raw as InternalBookingDetail).venue?.name;
                  const creatorName =
                    item.kind === "booking" ? (item.raw as InternalBookingDetail).createdBy?.name : undefined;

                  return (
                    <button
                      type="button"
                      key={`${item.id}-${idx}`}
                      data-booking-block
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick(item);
                      }}
                      className={`absolute left-1 right-1 rounded-md px-2 py-1 text-left overflow-hidden z-10 flex flex-col shadow-sm ${itemColor(
                        item
                      )}`}
                      style={{ top, height }}
                      title={creatorName ? `${item.title} — ${creatorName}` : item.title}
                    >
                      <div className="truncate font-semibold text-[11px] leading-tight shrink-0">{item.title}</div>
                      <div className="truncate opacity-90 text-[10px] leading-tight mt-0.5 flex-1 min-h-0">
                        {clippedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                        {clippedEnd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {venueName ? ` · ${venueName}` : ""}
                        {creatorName ? ` · ${creatorName}` : ""}
                      </div>
                    </button>
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
