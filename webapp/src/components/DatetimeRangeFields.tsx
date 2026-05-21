import { useMemo } from "react";

import { EventStartDateInput } from "@/components/DateInputWithWeekday";
import { SplitTimeInput } from "@/components/SplitTimeField";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  buildDatetimeLocal,
  durationMinutesBetweenDatetimesUncapped,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";

/** Same label style as event show rows (`ShowTimeEditor` / new show form). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-white/60 text-xs uppercase tracking-wide block mb-1.5">{children}</Label>;
}

function formatDurationHint(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Two rows like event **shows** styling: start date + start time, then end date + end time.
 */
export function DatetimeRangeFields({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className,
}: {
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  className?: string;
}) {
  const sd = parseDatetimeLocal(startValue);
  const ed = parseDatetimeLocal(endValue);
  const startDate = sd.date;
  const startT = sd.time;
  const endDate = ed.date;
  const endT = ed.time;
  const hasStartTime = /^\d{2}:\d{2}$/.test(startT);

  const durationHint = useMemo(() => {
    if (!startValue || !endValue) return null;
    const m = durationMinutesBetweenDatetimesUncapped(startValue, endValue);
    return m != null ? formatDurationHint(m) : null;
  }, [startValue, endValue]);

  const setStartDate = (d: string) => {
    const t = startT || "00:00";
    onStartChange(buildDatetimeLocal(d, t));
  };

  const setStartTime = (v: string) => {
    const d0 = startDate;
    if (!d0) return;
    onStartChange(buildDatetimeLocal(d0, v));
  };

  const setEndDate = (d: string) => {
    const t = endT || "00:00";
    onEndChange(buildDatetimeLocal(d, t));
  };

  const setEndTime = (v: string) => {
    if (!hasStartTime) return;
    const d0 = endDate || startDate;
    if (!d0) return;
    let end = new Date(buildDatetimeLocal(d0, v));
    const start = new Date(startValue);
    if (!Number.isFinite(end.getTime()) || !Number.isFinite(start.getTime())) return;
    if (end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    onEndChange(toDatetimeLocalString(end));
  };

  return (
    <div className={className}>
      {/*
        Shrink-wrapped grid: column widths are max-content only (no growth from a wide parent).
        Date column = max(start date intrinsic width, end date intrinsic width); w-full on inputs
        matches that width so both boxes align without exceeding the longer weekday + date row.
      */}
      <div className="max-w-full overflow-x-auto pb-0.5">
        <div
          className={cn(
            "inline-grid grid-cols-[max-content_max-content] gap-x-3 gap-y-3 items-end",
            "justify-items-start"
          )}
        >
          <div className="flex shrink-0 flex-col">
            <FieldLabel>Start date</FieldLabel>
            <EventStartDateInput value={startDate} onChange={setStartDate} />
          </div>
          <div className="shrink-0 justify-self-start">
            <FieldLabel>Start</FieldLabel>
            <SplitTimeInput value={startT} aria-label="Start time" onChange={setStartTime} />
          </div>
          <div className="flex shrink-0 flex-col">
            <FieldLabel>End date</FieldLabel>
            <EventStartDateInput value={endDate} onChange={setEndDate} />
          </div>
          <div className="shrink-0 justify-self-start">
            <FieldLabel>End</FieldLabel>
            <SplitTimeInput
              value={endT}
              aria-label="End time"
              disabled={!hasStartTime}
              onChange={setEndTime}
            />
          </div>
        </div>
      </div>

      {durationHint ? (
        <p className="mt-2 text-[11px] text-white/40 tabular-nums">Duration · {durationHint}</p>
      ) : (
        <p className="mt-2 text-[11px] text-white/35">
          Set start and end times. End may be earlier on the clock (next calendar day).
        </p>
      )}
    </div>
  );
}
