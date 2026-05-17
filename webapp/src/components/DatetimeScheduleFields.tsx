import { useEffect, useMemo, useRef, useState } from "react";

import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { EventStartDateInput } from "@/components/DateInputWithWeekday";
import { Label } from "@/components/ui/label";
import {
  buildDatetimeLocal,
  durationMinutesForwardBetweenDatetimes,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";

import { ScheduleTimeRow, scheduleFieldLabelClass } from "./ScheduleTimeRow";

/**
 * Event / booking style: **Date — Start — End — Duration** in one row (local `datetime-local` values).
 */
export function DatetimeScheduleFields({
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
  const refSt = useRef<SplitTimeFieldHandle>(null);
  const refEn = useRef<SplitTimeFieldHandle>(null);
  const refDur = useRef<SplitTimeFieldHandle>(null);

  const sd = parseDatetimeLocal(startValue);
  const ed = parseDatetimeLocal(endValue);
  const parsedDate = sd.date;
  const [date, setLocalDate] = useState(parsedDate);
  const startT = sd.time;
  const endT = ed.time;
  const hasStartTime = /^\d{2}:\d{2}$/.test(startT);

  useEffect(() => {
    setLocalDate(parsedDate);
  }, [parsedDate]);

  const durationMin = useMemo(() => {
    if (!startValue || !endValue) return 0;
    return durationMinutesForwardBetweenDatetimes(startValue, endValue) ?? 0;
  }, [startValue, endValue]);

  const setDate = (d: string) => {
    setLocalDate(d);
    const dur = durationMin;
    const st = startT || "00:00";
    const newStart = buildDatetimeLocal(d, st);
    onStartChange(newStart);
    if (dur > 0) {
      const ns = new Date(newStart);
      onEndChange(toDatetimeLocalString(new Date(ns.getTime() + dur * 60000)));
    } else if (endValue) {
      const ed2 = parseDatetimeLocal(endValue);
      onEndChange(buildDatetimeLocal(d, ed2.time || "00:00"));
    }
  };

  const onStartT = (v: string) => {
    const d0 = date || sd.date;
    if (!d0) return;
    onStartChange(buildDatetimeLocal(d0, v));
  };

  const onEndT = (v: string) => {
    if (!hasStartTime) return;
    const d0 = ed.date || sd.date;
    if (!d0) return;
    let end = new Date(buildDatetimeLocal(d0, v));
    const start = new Date(startValue);
    if (!Number.isFinite(end.getTime()) || !Number.isFinite(start.getTime())) return;
    if (end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    onEndChange(toDatetimeLocalString(end));
  };

  const onDur = (m: number) => {
    if (!hasStartTime) return;
    if (!startValue) return;
    const s = new Date(startValue);
    if (!Number.isFinite(s.getTime())) return;
    if (m <= 0) {
      onEndChange(startValue);
      return;
    }
    onEndChange(toDatetimeLocalString(new Date(s.getTime() + m * 60000)));
  };

  return (
    <ScheduleTimeRow className={className}>
      <div className="shrink-0">
        <Label className={scheduleFieldLabelClass}>Start date</Label>
        <EventStartDateInput value={date} onChange={setDate} />
      </div>
      <div className="shrink-0">
        <Label className={scheduleFieldLabelClass}>Start</Label>
        <SplitTimeInput
          ref={refSt}
          value={startT}
          onChange={onStartT}
          nextFieldRef={refEn}
          aria-label="Start"
        />
      </div>
      <div className="shrink-0">
        <Label className={scheduleFieldLabelClass}>End</Label>
        <SplitTimeInput
          ref={refEn}
          value={endT}
          onChange={onEndT}
          nextFieldRef={refDur}
          aria-label="End"
          disabled={!hasStartTime}
        />
      </div>
      <div className="shrink-0">
        <Label className={scheduleFieldLabelClass}>Duration</Label>
        <SplitDurationHhMmInput
          ref={refDur}
          valueMinutes={durationMin}
          onChangeMinutes={onDur}
          aria-label="Duration"
          disabled={!hasStartTime}
        />
      </div>
    </ScheduleTimeRow>
  );
}
