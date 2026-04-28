/** Parse "HH:mm" to minutes from midnight. */
export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null;
  return hh * 60 + mm;
}

export function minutesToTime(totalMins: number): string {
  const norm = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** End time on same day (wraps if needed). */
export function endTimeFromStartAndDuration(start: string, durationMinutes: number): string {
  const s = timeToMinutes(start);
  if (s === null || !Number.isFinite(durationMinutes) || durationMinutes < 0) return "";
  return minutesToTime(s + durationMinutes);
}

/** Duration in minutes; if end < start, assumes next day. */
export function durationMinutesBetween(start: string, end: string): number | null {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60;
  if (d === 0) return null;
  return d;
}

export const TIME_INPUT_CLASS =
  "w-[5.75rem] min-w-[5.75rem] max-w-[5.75rem] shrink-0 font-mono text-sm tabular-nums [color-scheme:dark] bg-white/5 border-white/10 text-white";

export const DURATION_MINUTES_INPUT_CLASS =
  "w-[4.75rem] min-w-[4.75rem] max-w-[4.75rem] shrink-0 font-mono text-sm tabular-nums bg-white/5 border-white/10 text-white";
