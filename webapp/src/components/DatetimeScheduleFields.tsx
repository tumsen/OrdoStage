import { useEffect, useMemo, useRef, useState } from "react";

import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import {
  EventStartDateInput,
  eventScheduleDateInputClassName,
  eventScheduleDateWeekdayClassName,
} from "@/components/DateInputWithWeekday";
import { Label } from "@/components/ui/label";
import {
  buildDatetimeLocal,
  durationMinutesForwardBetweenDatetimes,
  endDatetimeLocalFromStartAndWallEnd,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";

import { ScheduleTimeRow, scheduleFieldLabelClass } from "./ScheduleTimeRow";

/**
 * Event / booking style: **Date — Start — End — Duration** in one row (local `datetime-local` values).
 * End time may be earlier on the clock than start (counts toward the next calendar day).
 */
export function DatetimeScheduleFields({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className,
  dateInputClassName = eventScheduleDateInputClassName,
  dateWeekdayClassName = eventScheduleDateWeekdayClassName,
}: {
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  className?: string;
  /** Date trigger height/styling (use `jobScheduleDateInputClassName` in job rows). */
  dateInputClassName?: string;
  dateWeekdayClassName?: string;
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
  const endSpansNextDay = Boolean(sd.date && ed.date && ed.date > sd.date);

  useEffect(() => {
    setLocalDate(parsedDate);
  }, [parsedDate]);

  const durationMin = useMemo(() => {
    if (!startValue || !endValue) return 0;
    return durationMinutesForwardBetweenDatetimes(startValue, endValue) ?? 0;
  }, [startValue, endValue]);

  const applyDurationFromStart = (newStart: string, dur: number) => {
    const s = new Date(newStart);
    if (!Number.isFinite(s.getTime()) || dur <= 0) return;
    onEndChange(toDatetimeLocalString(new Date(s.getTime() + dur * 60_000)));
  };

  const setDate = (d: string) => {
    setLocalDate(d);
    const st = startT || "00:00";
    const newStart = buildDatetimeLocal(d, st);
    onStartChange(newStart);
    if (durationMin > 0) {
      applyDurationFromStart(newStart, durationMin);
    } else if (hasStartTime && /^\d{2}:\d{2}$/.test(endT)) {
      const next = endDatetimeLocalFromStartAndWallEnd(d, st, endT);
      if (next) onEndChange(next);
    }
  };

  const onStartT = (v: string) => {
    const d0 = date || sd.date;
    if (!d0) return;
    const newStart = buildDatetimeLocal(d0, v);
    onStartChange(newStart);
    if (durationMin > 0) {
      applyDurationFromStart(newStart, durationMin);
    } else if (/^\d{2}:\d{2}$/.test(endT)) {
      const next = endDatetimeLocalFromStartAndWallEnd(d0, v, endT);
      if (next) onEndChange(next);
    }
  };

  const onEndT = (v: string) => {
    if (!hasStartTime) return;
    const d0 = date || sd.date;
    if (!d0) return;
    const next = endDatetimeLocalFromStartAndWallEnd(d0, startT, v);
    if (next) onEndChange(next);
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
        <EventStartDateInput
          value={date}
          onChange={setDate}
          className={dateInputClassName}
          weekdayClassName={dateWeekdayClassName}
        />
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
        <Label className={scheduleFieldLabelClass}>
          End
          {endSpansNextDay ? (
            <span className="normal-case text-white/40 font-normal tracking-normal"> (next day)</span>
          ) : null}
        </Label>
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
