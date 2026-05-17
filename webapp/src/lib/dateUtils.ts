export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hasTime = /T\d{2}:\d{2}/.test(dateStr);
  if (!hasTime) return `${weekday} ${day}/${month}/${year}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${weekday} ${day}/${month}/${year} ${hh}:${mm}`;
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${weekday} ${day}/${month}/${year}`;
}

export function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr) >= new Date();
}

export function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function isNext30Days(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return d >= now && d <= future;
}

/** True when `startDate` has a `YYYY-MM-DD` on or after local today (calendar day). */
export function eventStartsOnOrAfterToday(startDate: string | null | undefined): boolean {
  if (!startDate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
  const eventDay = new Date(y, mo - 1, d);
  if (Number.isNaN(eventDay.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return eventDay >= today;
}

export function formatWeekdayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return "—";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return "—";
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return "—";
  const weekday = dt.toLocaleDateString("en-US", { weekday: "long" });
  return `${weekday} ${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${String(y)}`;
}

export function formatWeekdayOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return "—";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return "—";
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { weekday: "long" });
}

/** Local calendar date as `YYYY-MM-DD` (for `<input type="date">`). */
/** `DD/MM/YYYY` from ISO `YYYY-MM-DD` prefix; invalid or empty → em dash. */
export function formatDdMmYyyy(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return "—";
  const y = m[1];
  const mo = m[2];
  const d = m[3];
  return `${d}/${mo}/${y}`;
}

/** `YYYY-MM-DD` prefix from ISO or date-only strings (for date inputs). */
export function isoDatePrefix(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return m ? m[1]! : "";
}

export function todayIsoDate(): string {
  const now = new Date();
  return localDateToIso(now);
}

/** Parse `YYYY-MM-DD` (or ISO prefix) as local calendar midnight. */
export function isoDateToLocalDate(value: string | null | undefined): Date | undefined {
  const ymd = isoDatePrefix(value);
  if (!ymd) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return undefined;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export function localDateToIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
