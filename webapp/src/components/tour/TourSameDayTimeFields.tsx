import { useMemo, useRef } from "react";

import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { Label } from "@/components/ui/label";
import {
  buildDatetimeLocal,
  durationMinutesBetween,
  durationMinutesForwardBetweenDatetimes,
  minutesToTime,
  parseDatetimeLocal,
  timeToMinutes,
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
    if (!startValue || !endValue || !startT || !endT) return 0;
    const wall = durationMinutesBetween(startT, endT);
    if (wall !== null) return wall;
    return durationMinutesForwardBetweenDatetimes(startValue, endValue) ?? 0;
  }, [startValue, endValue, startT, endT]);

  const onStartT = (v: string) => {
    if (!dayKey) return;
    onStartChange(buildDatetimeLocal(dayKey, v));
  };

  const onEndT = (v: string) => {
    if (!hasStartTime || !dayKey) return;
    const sm = timeToMinutes(parseDatetimeLocal(startValue).time || "");
    const em = timeToMinutes(v);
    if (sm === null || em === null) return;
    if (em <= sm) {
      const anchor = new Date(`${dayKey}T12:00:00`);
      if (!Number.isFinite(anchor.getTime())) return;
      anchor.setDate(anchor.getDate() + 1);
      const nk = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;
      onEndChange(buildDatetimeLocal(nk, v));
      return;
    }
    onEndChange(buildDatetimeLocal(dayKey, v));
  };

  const onDur = (m: number) => {
    if (!hasStartTime || !dayKey) return;
    const sm = timeToMinutes(startT);
    if (sm === null || !Number.isFinite(m)) return;
    if (m <= 0) {
      onEndChange(buildDatetimeLocal(dayKey, startT));
      return;
    }
    const total = sm + Math.floor(m);
    const daysForward = Math.floor(total / (24 * 60));
    const rem = total % (24 * 60);
    const anchor = new Date(`${dayKey}T12:00:00`);
    if (!Number.isFinite(anchor.getTime())) return;
    anchor.setDate(anchor.getDate() + daysForward);
    const nk = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;
    onEndChange(buildDatetimeLocal(nk, minutesToTime(rem)));
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
