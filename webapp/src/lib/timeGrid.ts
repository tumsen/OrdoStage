/** Rolling 24h window per column: column `dayYmd` is [local midnight for day + startHour] through +24h. */

export const MINUTES_PER_DAY = 24 * 60;

export function windowStartForColumnDay(dayYmd: string, startHour: number): Date {
  const [y, mo, d] = dayYmd.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1, startHour, 0, 0, 0);
}

/** Which week column owns this instant (rolling window). */
export function columnDayYmdForInstant(t: Date, startHour: number): string {
  let ws = new Date(t.getFullYear(), t.getMonth(), t.getDate(), startHour, 0, 0, 0);
  if (t < ws) {
    ws = new Date(ws.getTime() - 24 * 60 * 60 * 1000);
  }
  const y = ws.getFullYear();
  const mo = ws.getMonth() + 1;
  const d = ws.getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function minutesFromWindowStart(t: Date, columnDayYmd: string, startHour: number): number {
  const ws = windowStartForColumnDay(columnDayYmd, startHour);
  return (t.getTime() - ws.getTime()) / 60000;
}

export function dateFromColumnAndWindowMinutes(
  columnDayYmd: string,
  minutesFromStart: number,
  startHour: number
): Date {
  const ws = windowStartForColumnDay(columnDayYmd, startHour);
  return new Date(ws.getTime() + minutesFromStart * 60000);
}

export function clampMinutesToDay(m: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, m));
}

export function formatHourLabel(hour24: number, timeFormat: "12h" | "24h"): string {
  const h = ((hour24 % 24) + 24) % 24;
  if (timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:00`;
  }
  const period = h >= 12 ? "PM" : "AM";
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x} ${period}`;
}

export function bottomBoundaryLabel(startHour: number, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h" && startHour === 0) {
    return "24:00";
  }
  return formatHourLabel(startHour, timeFormat);
}
