/** Wall-clock time stored as strict `HH:mm` (24h) everywhere in schedules. */
export function normalizeTimeHHMM(raw: string): string {
  const t = raw.trim();
  /** Allow `HH:mm`, `H:mm`, optional `:ss` / fractional seconds (DB, paste). */
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/.exec(t);
  if (!m) return "";
  let hh = Number.parseInt(m[1], 10);
  let mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return "";
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Parse "HH:mm" to minutes from midnight. */
export function timeToMinutes(t: string): number | null {
  const n = normalizeTimeHHMM(t);
  if (!n) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(n);
  if (!m) return null;
  return Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
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
  if (d === 0) return 24 * 60;
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

/**
 * Calendar `YYYY-MM-DD` for a job row when `jobDate` is JSON ISO (`…T…Z`).
 * Using `.slice(0, 10)` on UTC ISO picks the **UTC** date, which can differ from the local
 * calendar day and yields wrong start/end when paired with local wall-clock `startTime`
 * (broken durations like ~31h for a same-day 14–21 block).
 */
export function calendarDateKeyFromJobDate(isoOrDay: string, fallback: string): string {
  if (!isoOrDay || typeof isoOrDay !== "string") return fallback.slice(0, 10);
  const t = isoOrDay.trim();
  if (t.length < 10) return fallback.slice(0, 10);
  if (t.includes("T") || t.length > 10) {
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return fallback.slice(0, 10);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return t.slice(0, 10);
}

/** Parse `datetime-local` value to YYYY-MM-DD and HH:mm (local). */
export function parseDatetimeLocal(s: string): { date: string; time: string } {
  if (!s || !s.trim()) return { date: "", time: "" };
  const t = s.trim();
  if (!t.includes("T")) return { date: t.slice(0, 10), time: "" };
  const [d, restRaw] = t.split("T");
  if (!d) return { date: "", time: "" };
  const rest = (restRaw || "").trim();
  const tm = /^(\d{1,2}):(\d{2})/.exec(rest);
  if (!tm) return { date: d, time: "" };
  const hh = Number.parseInt(tm[1], 10);
  const mm = Number.parseInt(tm[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return { date: d, time: "" };
  const hhC = Math.min(23, Math.max(0, hh));
  const mmC = Math.min(59, Math.max(0, mm));
  return {
    date: d,
    time: `${String(hhC).padStart(2, "0")}:${String(mmC).padStart(2, "0")}`,
  };
}

/** Upper bound for a single job span when counting forward (23 h 59 m). */
export const MAX_JOB_FORWARD_DURATION_MINUTES = 23 * 60 + 59;

/**
 * Duration between two full `datetime-local` strings, counting **forwards** only.
 * Same **parsed calendar date**: compare **clock times only** (fixes 14:00→15:00 showing ~25 h when `Date`
 * comparisons crossed midnight or TZ quirks).
 * Same date with end clock ≤ start: overnight block toward **next calendar day**, capped at {@link MAX_JOB_FORWARD_DURATION_MINUTES}.
 * Different dates: timestamp difference with optional +24 h when end ≤ start; result capped at {@link MAX_JOB_FORWARD_DURATION_MINUTES}.
 */
export function durationMinutesForwardBetweenDatetimes(
  startValue: string,
  endValue: string
): number | null {
  const sd = parseDatetimeLocal(startValue);
  const ed = parseDatetimeLocal(endValue);
  if (!sd.date || !sd.time || !ed.date || !ed.time) return null;
  const sm = timeToMinutes(sd.time);
  const em = timeToMinutes(ed.time);
  if (sm === null || em === null) return null;

  const maxM = MAX_JOB_FORWARD_DURATION_MINUTES;

  if (sd.date === ed.date) {
    if (em > sm) {
      return Math.min(maxM, Math.max(1, em - sm));
    }
    const overnight = 24 * 60 + em - sm;
    return Math.min(maxM, Math.max(1, overnight));
  }

  const a = new Date(startValue).getTime();
  let b = new Date(endValue).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b <= a) b += 24 * 60 * 60 * 1000;
  const raw = Math.round((b - a) / 60_000);
  return Math.min(maxM, Math.max(1, raw));
}

/** Full span between two `datetime-local` values (no job-duration cap). */
export function durationMinutesBetweenDatetimesUncapped(
  startValue: string,
  endValue: string
): number | null {
  const a = new Date(startValue).getTime();
  const b = new Date(endValue).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const raw = Math.round((b - a) / 60_000);
  return raw > 0 ? raw : null;
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

/**
 * Serialize a `Date` for booking API bodies (`startDate` / `endDate`).
 * Do not send `YYYY-MM-DDTHH:mm` without offset: Node often runs in UTC and parses that as
 * **UTC** wall time, while the calendar grid uses the user's local zone (e.g. +2h in CEST).
 */
export function dateToBookingApiIso(d: Date): string {
  return d.toISOString();
}

/** Browser `datetime-local` value (`YYYY-MM-DDTHH:mm`) → UTC ISO for the same instant. */
export function datetimeLocalInputToBookingApiIso(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString();
}
