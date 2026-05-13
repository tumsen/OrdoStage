import { useMemo, useRef } from "react";

import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { Label } from "@/components/ui/label";
import {
  ScheduleTimeRow,
  scheduleDateInputClass,
  scheduleFieldLabelClass,
} from "./ScheduleTimeRow";
import {
  buildDatetimeLocal,
  durationMinutesBetweenDatetimesUncapped,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";

function formatDurationHint(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Start and end each with **own date + time** so multi-day spans are obvious in edit mode.
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
  const refStartTime = useRef<SplitTimeFieldHandle>(null);
  const refEndTime = useRef<SplitTimeFieldHandle>(null);

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
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">Start</p>
          <ScheduleTimeRow>
            <div className="shrink-0">
              <Label className={scheduleFieldLabelClass}>Start date</Label>
              <DateInputWithWeekday
                value={startDate}
                onChange={setStartDate}
                className={scheduleDateInputClass}
                weekdayClassName="text-sm text-white/45"
              />
            </div>
            <div className="shrink-0">
              <Label className={scheduleFieldLabelClass}>Start time</Label>
              <SplitTimeInput
                ref={refStartTime}
                value={startT}
                onChange={setStartTime}
                nextFieldRef={refEndTime}
                aria-label="Start time"
              />
            </div>
          </ScheduleTimeRow>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">End</p>
          <ScheduleTimeRow>
            <div className="shrink-0">
              <Label className={scheduleFieldLabelClass}>End date</Label>
              <DateInputWithWeekday
                value={endDate}
                onChange={setEndDate}
                className={scheduleDateInputClass}
                weekdayClassName="text-sm text-white/45"
              />
            </div>
            <div className="shrink-0">
              <Label className={scheduleFieldLabelClass}>End time</Label>
              <SplitTimeInput
                ref={refEndTime}
                value={endT}
                onChange={setEndTime}
                aria-label="End time"
                disabled={!hasStartTime}
              />
            </div>
          </ScheduleTimeRow>
        </div>
      </div>

      {durationHint ? (
        <p className="mt-3 text-[11px] text-white/40 tabular-nums">Duration · {durationHint}</p>
      ) : (
        <p className="mt-3 text-[11px] text-white/35">
          Set start date/time and end date/time so the end is after the start (different end dates are
          allowed).
        </p>
      )}
    </div>
  );
}
