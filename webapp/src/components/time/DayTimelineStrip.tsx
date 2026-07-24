import { useEffect, useRef, useState } from "react";
import {
  MINUTES_PER_DAY,
  TIME_SNAP_MINUTES,
  formatHourLabel,
  snapWindowMinutes,
} from "@/lib/timeGrid";
import { cn } from "@/lib/utils";
import type { TimeFormat } from "@/lib/preferences";

export type DayTimelineSibling = {
  id: string;
  startMin: number;
  endMin: number;
  color: string;
};

type DragMode = "create" | "move" | "resizeStart" | "resizeEnd";

type DragState = {
  mode: DragMode;
  originMin: number;
  startMin: number;
  endMin: number;
  grabOffsetMin: number;
};

function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return 0;
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return hh * 60 + mm;
}

function minutesToHm(total: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(total)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function minutesFromClientY(
  clientY: number,
  trackTop: number,
  trackHeight: number
): number {
  const y = clientY - trackTop;
  const clamped = Math.max(0, Math.min(trackHeight, y));
  return (clamped / trackHeight) * MINUTES_PER_DAY;
}

const HANDLE_PX = 8;
const PX_PER_HOUR = 28;

export function DayTimelineStrip(props: {
  startHm: string;
  endHm: string;
  onChangeRange: (startHm: string, endHm: string) => void;
  siblings?: DayTimelineSibling[];
  activeColor?: string | null;
  disabled?: boolean;
  /** When set, only move the block (end follows start + duration). */
  fixedDurationMinutes?: number | null;
  timeFormat?: TimeFormat;
  /** Denser hour rows (e.g. mobile side strip). */
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const {
    startHm,
    endHm,
    onChangeRange,
    siblings = [],
    activeColor = "#f5c518",
    disabled = false,
    fixedDurationMinutes = null,
    timeFormat = "24h",
    compact = false,
    className,
    "aria-label": ariaLabel,
  } = props;

  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const onChangeRangeRef = useRef(onChangeRange);
  onChangeRangeRef.current = onChangeRange;

  const committedStart = hmToMinutes(startHm);
  let committedEnd = hmToMinutes(endHm);
  if (committedEnd <= committedStart) committedEnd += MINUTES_PER_DAY;
  committedEnd = Math.min(MINUTES_PER_DAY, committedEnd);

  const viewStart = drag?.startMin ?? committedStart;
  const viewEnd = drag?.endMin ?? committedEnd;
  const pxPerHour = compact ? 18 : PX_PER_HOUR;
  const trackHeight = 24 * pxPerHour;

  useEffect(() => {
    if (!drag) return;

    const onMove = (ev: PointerEvent) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const raw = minutesFromClientY(ev.clientY, rect.top, rect.height);
      const snapped = snapWindowMinutes(raw);
      const minDur = fixedDurationMinutes ?? TIME_SNAP_MINUTES;

      setDrag((prev) => {
        if (!prev) return prev;
        if (prev.mode === "create") {
          const a = prev.originMin;
          const b = snapped;
          let startMin = Math.min(a, b);
          let endMin = Math.max(a, b);
          if (fixedDurationMinutes != null) {
            startMin = snapWindowMinutes(
              Math.min(MINUTES_PER_DAY - fixedDurationMinutes, startMin)
            );
            endMin = Math.min(MINUTES_PER_DAY, startMin + fixedDurationMinutes);
            return { ...prev, startMin, endMin };
          }
          if (endMin - startMin < TIME_SNAP_MINUTES) {
            endMin = Math.min(MINUTES_PER_DAY, startMin + TIME_SNAP_MINUTES);
          }
          return { ...prev, startMin, endMin };
        }
        if (prev.mode === "move" || (fixedDurationMinutes != null && prev.mode !== "resizeStart" && prev.mode !== "resizeEnd")) {
          const dur = fixedDurationMinutes ?? prev.endMin - prev.startMin;
          let startMin = snapWindowMinutes(snapped - prev.grabOffsetMin);
          startMin = Math.max(0, Math.min(MINUTES_PER_DAY - minDur, startMin));
          return { ...prev, startMin, endMin: startMin + dur };
        }
        if (prev.mode === "resizeStart") {
          let startMin = Math.min(prev.endMin - TIME_SNAP_MINUTES, snapped);
          startMin = Math.max(0, startMin);
          return { ...prev, startMin };
        }
        let endMin = Math.max(prev.startMin + TIME_SNAP_MINUTES, snapped);
        endMin = Math.min(MINUTES_PER_DAY, endMin);
        return { ...prev, endMin };
      });
    };

    const onUp = () => {
      const prev = dragRef.current;
      setDrag(null);
      if (!prev) return;
      const endHmOut =
        prev.endMin >= MINUTES_PER_DAY
          ? "00:00"
          : minutesToHm(Math.min(MINUTES_PER_DAY - 1, Math.max(prev.startMin + 1, prev.endMin)));
      onChangeRangeRef.current(minutesToHm(prev.startMin), endHmOut);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, fixedDurationMinutes]);

  const beginDrag = (mode: DragMode, clientY: number, grabOffsetMin = 0) => {
    if (disabled) return;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = minutesFromClientY(clientY, rect.top, rect.height);
    const originMin = snapWindowMinutes(raw);
    if (mode === "create") {
      const dur = fixedDurationMinutes ?? TIME_SNAP_MINUTES;
      setDrag({
        mode,
        originMin,
        startMin: originMin,
        endMin: Math.min(MINUTES_PER_DAY, originMin + dur),
        grabOffsetMin: 0,
      });
      return;
    }
    setDrag({
      mode,
      originMin,
      startMin: committedStart,
      endMin: committedEnd,
      grabOffsetMin,
    });
  };

  const activeTop = (viewStart / MINUTES_PER_DAY) * 100;
  const activeHeight = (Math.max(TIME_SNAP_MINUTES, viewEnd - viewStart) / MINUTES_PER_DAY) * 100;
  const color = activeColor || "#f5c518";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        ref={trackRef}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={MINUTES_PER_DAY}
        aria-valuenow={viewStart}
        aria-disabled={disabled || undefined}
        className={cn(
          "relative w-full select-none overflow-hidden rounded-md border border-white/10 bg-white/[0.03]",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"
        )}
        style={{ height: trackHeight }}
        onPointerDown={(ev) => {
          if (disabled || ev.button !== 0) return;
          ev.preventDefault();
          const el = trackRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const raw = minutesFromClientY(ev.clientY, rect.top, rect.height);
          const topPx = (committedStart / MINUTES_PER_DAY) * rect.height;
          const bottomPx = (committedEnd / MINUTES_PER_DAY) * rect.height;
          const y = ev.clientY - rect.top;
          if (y >= topPx && y <= bottomPx) {
            if (fixedDurationMinutes == null && y - topPx <= HANDLE_PX) {
              beginDrag("resizeStart", ev.clientY);
              return;
            }
            if (fixedDurationMinutes == null && bottomPx - y <= HANDLE_PX) {
              beginDrag("resizeEnd", ev.clientY);
              return;
            }
            beginDrag("move", ev.clientY, raw - committedStart);
            return;
          }
          beginDrag("create", ev.clientY);
        }}
      >
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={`h-${i}`}
            className="pointer-events-none absolute left-0 right-0 border-t border-white/[0.06]"
            style={{ top: `${(i / 24) * 100}%` }}
          />
        ))}
        {Array.from({ length: 24 }, (_, hour) => (
          <div
            key={`lbl-${hour}`}
            className="pointer-events-none absolute left-1 z-[1] text-[9px] leading-none text-white/35"
            style={{ top: `calc(${(hour / 24) * 100}% + 2px)` }}
          >
            {formatHourLabel(hour, timeFormat)}
          </div>
        ))}
        {siblings.map((sib) => {
          const top = (sib.startMin / MINUTES_PER_DAY) * 100;
          const height = (Math.max(5, sib.endMin - sib.startMin) / MINUTES_PER_DAY) * 100;
          return (
            <div
              key={sib.id}
              className={cn(
                "pointer-events-none absolute right-1 rounded-sm opacity-40",
                compact ? "left-6" : "left-8"
              )}
              style={{
                top: `${top}%`,
                height: `${height}%`,
                backgroundColor: sib.color,
              }}
            />
          );
        })}
        <div
          className={cn(
            "absolute right-1 z-[2] rounded-sm border border-white/25 shadow-sm",
            compact ? "left-6" : "left-8",
            !disabled && "cursor-grab active:cursor-grabbing"
          )}
          style={{
            top: `${activeTop}%`,
            height: `${activeHeight}%`,
            backgroundColor: color,
            minHeight: 4,
          }}
        >
          {fixedDurationMinutes == null && !disabled ? (
            <>
              <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" data-handle="start" />
              <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" data-handle="end" />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
