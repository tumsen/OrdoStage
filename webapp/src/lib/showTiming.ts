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

/** Total minutes → "HH:MM" for duration (0–99 h, 0–59 m). */
export function totalMinutesToDurationHhMm(total: number): string {
  if (!Number.isFinite(total) || total < 0) return "00:00";
  const capped = Math.min(99 * 60 + 59, Math.max(0, Math.floor(total)));
  const h = Math.floor(capped / 60);
  const m = capped - h * 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function durationHhMmToTotalMinutes(hhStr: string, mmStr: string): number {
  const dH = (hhStr || "0").replace(/\D/g, "").slice(0, 2);
  const dM = (mmStr || "0").replace(/\D/g, "").slice(0, 2);
  const h = Math.min(99, Math.max(0, parseInt(dH || "0", 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(dM || "0", 10) || 0));
  return h * 60 + m;
}

/** Parse `datetime-local` value to YYYY-MM-DD and HH:mm (local). */
export function parseDatetimeLocal(s: string): { date: string; time: string } {
  if (!s || !s.trim()) return { date: "", time: "" };
  const t = s.trim();
  if (!t.includes("T")) return { date: t.slice(0, 10), time: "" };
  const [d, rest] = t.split("T");
  if (!d) return { date: "", time: "" };
  const timePart = (rest || "").slice(0, 5);
  if (!timePart || timePart.length < 4) return { date: d, time: "" };
  return { date: d, time: timePart.length === 5 ? timePart : `${timePart.slice(0, 2).padStart(2, "0")}:${timePart.slice(3, 5).padStart(2, "0")}` };
}

export function buildDatetimeLocal(date: string, time: string): string {
  if (!date) return "";
  const t = (time && /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim() : "00:00").split(":");
  const hh = String(Math.min(23, Math.max(0, parseInt(t[0] || "0", 10) || 0))).padStart(2, "0");
  const mm = String(Math.min(59, Math.max(0, parseInt(t[1] || "0", 10) || 0))).padStart(2, "0");
  return `${date}T${hh}:${mm}`;
}

/** Format a local Date for `datetime-local` inputs (no timezone suffix). */
export function toDatetimeLocalString(d: Date): string {
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${m}`;
}
