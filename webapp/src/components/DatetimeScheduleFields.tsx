import { useMemo, useRef } from "react";

import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildDatetimeLocal,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";

import { ScheduleTimeRow, scheduleDateInputClass, scheduleFieldLabelClass } from "./ScheduleTimeRow";

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
  const date = sd.date;
  const startT = sd.time;
  const endT = ed.time;

  const durationMin = useMemo(() => {
    if (!startValue || !endValue) return 0;
    const a = new Date(startValue);
    const b = new Date(endValue);
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a) return 0;
    return Math.round((b - a) / 60000);
  }, [startValue, endValue]);

  const setDate = (d: string) => {
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
        <Label className={scheduleFieldLabelClass}>Date</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={scheduleDateInputClass}
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
        <Label className={scheduleFieldLabelClass}>End</Label>
        <SplitTimeInput
          ref={refEn}
          value={endT}
          onChange={onEndT}
          nextFieldRef={refDur}
          aria-label="End"
        />
      </div>
      <div className="shrink-0">
        <Label className={scheduleFieldLabelClass}>Duration</Label>
        <SplitDurationHhMmInput
          ref={refDur}
          valueMinutes={durationMin}
          onChangeMinutes={onDur}
          aria-label="Duration"
        />
      </div>
    </ScheduleTimeRow>
  );
}
