import { useMemo, useRef } from "react";

import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { Label } from "@/components/ui/label";
import {
  buildDatetimeLocal,
  durationMinutesForwardBetweenDatetimes,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";
import { ScheduleTimeRow, scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";

/**
 * Same as event job scheduling: Start / End / Duration for one calendar day (`dayKey` = YYYY-MM-DD).
 */
export function TourSameDayTimeFields({
  dayKey,
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  className,
}: {
  dayKey: string;
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
  const startT = sd.time;
  const endT = ed.time;
  const hasStartTime = /^\d{2}:\d{2}$/.test(startT);

  const durationMin = useMemo(() => {
    if (!startValue || !endValue) return 0;
    return durationMinutesForwardBetweenDatetimes(startValue, endValue) ?? 0;
  }, [startValue, endValue]);

  const onStartT = (v: string) => {
    if (!dayKey) return;
    onStartChange(buildDatetimeLocal(dayKey, v));
  };

  const onEndT = (v: string) => {
    if (!hasStartTime || !dayKey) return;
    const d0 = ed.date || sd.date || dayKey;
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
