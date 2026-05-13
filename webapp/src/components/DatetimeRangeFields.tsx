import { useMemo } from "react";

import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
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

const dateInputClass =
  "bg-white/5 border-white/10 text-white [color-scheme:dark] w-full min-w-0";

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
      {/* Column 1 width = max of both date rows so both date boxes match the longest weekday + date. */}
      <div
        className={cn(
          "grid grid-cols-[auto_auto] gap-x-3 gap-y-3 items-end",
          "min-w-0 max-w-full overflow-x-auto pb-0.5"
        )}
      >
        <div className="min-w-0">
          <FieldLabel>Start date</FieldLabel>
          <DateInputWithWeekday
            value={startDate}
            onChange={setStartDate}
            className={dateInputClass}
            weekdayClassName="text-sm text-white/45"
          />
        </div>
        <div className="shrink-0">
          <FieldLabel>Start</FieldLabel>
          <SplitTimeInput value={startT} aria-label="Start time" onChange={setStartTime} />
        </div>
        <div className="min-w-0">
          <FieldLabel>End date</FieldLabel>
          <DateInputWithWeekday
            value={endDate}
            onChange={setEndDate}
            className={dateInputClass}
            weekdayClassName="text-sm text-white/45"
          />
        </div>
        <div className="shrink-0">
          <FieldLabel>End</FieldLabel>
          <SplitTimeInput
            value={endT}
            aria-label="End time"
            disabled={!hasStartTime}
            onChange={setEndTime}
          />
        </div>
      </div>

      {durationHint ? (
        <p className="mt-2 text-[11px] text-white/40 tabular-nums">Duration · {durationHint}</p>
      ) : (
        <p className="mt-2 text-[11px] text-white/35">
          Set start and end so the end is after the start (end date can differ from start date).
        </p>
      )}
    </div>
  );
}
