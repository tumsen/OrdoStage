/**
 * Browser user time — calendar dates and `HH:mm` wall clocks are interpreted in the **device’s
 * local timezone** (ECMAScript `Date` local getters, same as `datetime-local` inputs).
 *
 * Use these helpers whenever you combine a stored calendar day (`YYYY-MM-DD`) with a stored
 * wall-clock time so the schedule grid, bookings, and show rows match what the user sees in
 * their browser (avoids parsing `YYYY-MM-DDTHH:mm` as UTC in WebKit and keeps parity with
 * server-stored UTC ISO instants).
 */

/** IANA zone for the current browser (e.g. `Europe/Copenhagen`). Safe fallback `UTC`. */
export function getBrowserIanaTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Optional header for API calls if the backend ever needs the client zone (not wired by default). */
export function browserTimezoneRequestHeader(): Record<string, string> {
  const tz = getBrowserIanaTimeZone();
  return tz ? { "X-Client-Time-Zone": tz } : {};
}

function normalizeWallClockHhMm(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/.exec(t);
  if (!m) return "";
  let hh = Number.parseInt(m[1], 10);
  let mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return "";
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Calendar day (`YYYY-MM-DD`, no offset) + wall-clock `HH:mm` in the **browser’s local** zone
 * → UTC ISO string (`…Z`) for APIs and the schedule time grid.
 */
export function wallClockYmdHhMmToUtcIso(dateYmd: string, timeHhMm: string): string {
  const day = dateYmd.trim().split("T")[0]!.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const t = normalizeWallClockHhMm(timeHhMm);
    return t ? `${day}T${t}` : `${day}T${timeHhMm.trim()}`;
  }
  const t = normalizeWallClockHhMm(timeHhMm);
  if (!t) return `${day}T${timeHhMm.trim()}`;
  const [yy, mo, dd] = day.split("-").map((x) => Number.parseInt(x, 10));
  const [hh, mm] = t.split(":").map((x) => Number.parseInt(x, 10));
  if (![yy, mo, dd, hh, mm].every((n) => Number.isFinite(n))) return `${day}T${t}`;
  /** Local civil datetime → same instant as the user’s OS clock in their zone. */
  const local = new Date(yy, mo - 1, dd, hh, mm, 0, 0);
  if (!Number.isFinite(local.getTime())) return `${day}T${t}`;
  return local.toISOString();
}

/** Add minutes to a UTC ISO instant; returns another ISO string or null if invalid. */
export function addMinutesToUtcIso(startIso: string, minutes: number): string | null {
  const d = new Date(startIso);
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(minutes)) return null;
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

/** `YYYY-MM-DD` in the browser’s **local** calendar for an absolute instant. */
export function localCalendarYmdFromUtcIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** `HH:mm` local wall clock from a UTC ISO instant. */
export function localHhMmFromUtcIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
