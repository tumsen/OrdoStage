/** Strict `HH:mm` (24h) normalization — align with webapp `normalizeTimeHHMM`. */
export function normalizeTimeHHMM(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return "";
  let hh = Number.parseInt(m[1]!, 10);
  let mm = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return "";
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function timeToMinutes(t: string): number | null {
  const n = normalizeTimeHHMM(t);
  if (!n) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(n);
  if (!m) return null;
  return Number.parseInt(m[1]!, 10) * 60 + Number.parseInt(m[2]!, 10);
}

export function minutesToTime(totalMins: number): string {
  const norm = ((totalMins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const mm = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function endTimeFromStartAndDuration(start: string, durationMinutes: number): string {
  const s = timeToMinutes(start);
  if (s === null || !Number.isFinite(durationMinutes) || durationMinutes < 0) return "";
  return minutesToTime(s + durationMinutes);
}

/** Parse tour API date string → calendar day key `YYYY-MM-DD`. */
export function dayKeyFromDateInput(dateStr: string): string {
  const t = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : t.slice(0, 10);
}
