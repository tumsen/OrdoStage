import { useMemo } from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { durationMinutesBetweenDatetimesUncapped } from "@/lib/showTiming";

function formatDurationHint(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Start and end as separate `datetime-local` values so bookings can span multiple calendar days.
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
  const durationHint = useMemo(() => {
    if (!startValue || !endValue) return null;
    const m = durationMinutesBetweenDatetimesUncapped(startValue, endValue);
    return m != null ? formatDurationHint(m) : null;
  }, [startValue, endValue]);

  const inp =
    "mt-1 h-9 w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white [color-scheme:dark]";

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-white/50 text-xs uppercase tracking-wide">Starts</Label>
          <Input
            type="datetime-local"
            value={startValue}
            onChange={(e) => onStartChange(e.target.value)}
            className={inp}
          />
        </div>
        <div>
          <Label className="text-white/50 text-xs uppercase tracking-wide">Ends</Label>
          <Input
            type="datetime-local"
            value={endValue}
            onChange={(e) => onEndChange(e.target.value)}
            className={inp}
          />
        </div>
      </div>
      {durationHint ? (
        <p className="mt-2 text-[11px] text-white/40 tabular-nums">Duration · {durationHint}</p>
      ) : (
        <p className="mt-2 text-[11px] text-white/35">Set start and end so the end is after the start.</p>
      )}
    </div>
  );
}
