import { parseISO, format } from "date-fns";

export type GanttDragMode = "move" | "resize-start" | "resize-end";

const MS_DAY = 86_400_000;

export function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

export function dateToPct(d: Date, rangeStart: Date, rangeEnd: Date): number {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return 0;
  return clampPct(((d.getTime() - rangeStart.getTime()) / totalMs) * 100);
}

export function pctToDate(pct: number, rangeStart: Date, rangeEnd: Date): Date {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  return new Date(rangeStart.getTime() + (pct / 100) * totalMs);
}

export function snapToDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function toYmdDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function dayEnd(d: Date): Date {
  return new Date(snapToDay(d).getTime() + MS_DAY - 60_000);
}

export function durationDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((snapToDay(end).getTime() - snapToDay(start).getTime()) / MS_DAY) + 1);
}

export function deltaDaysFromPointerDelta(
  deltaPx: number,
  timelineWidthPx: number,
  rangeStart: Date,
  rangeEnd: Date
): number {
  if (timelineWidthPx <= 0) return 0;
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const msPerPx = totalMs / timelineWidthPx;
  return Math.round((deltaPx * msPerPx) / MS_DAY);
}

export function barDatesFromDrag(
  mode: GanttDragMode,
  origStart: Date,
  origEnd: Date,
  deltaDays: number,
  phaseKind: "span" | "milestone" | "deadline"
): { start: Date; end: Date } | null {
  const isSingleDay = phaseKind === "milestone" || phaseKind === "deadline";

  if (mode === "move") {
    const start = snapToDay(new Date(origStart.getTime() + deltaDays * MS_DAY));
    if (isSingleDay) {
      return { start, end: new Date(start.getTime() + MS_DAY) };
    }
    const dur = durationDays(origStart, origEnd);
    const end = snapToDay(new Date(start.getTime() + (dur - 1) * MS_DAY));
    end.setHours(23, 59, 0, 0);
    return { start, end };
  }

  if (isSingleDay) return null;

  if (mode === "resize-start") {
    const start = snapToDay(new Date(origStart.getTime() + deltaDays * MS_DAY));
    const end = snapToDay(origEnd);
    if (start.getTime() > end.getTime()) return null;
    return { start, end };
  }

  // resize-end
  const start = snapToDay(origStart);
  const end = snapToDay(new Date(origEnd.getTime() + deltaDays * MS_DAY));
  if (end.getTime() < start.getTime()) return null;
  return { start, end };
}

export function taskBarStyle(
  startIso: string,
  endIso: string,
  rangeStart: Date,
  rangeEnd: Date,
  dayCount: number
): { left: string; width: string } | null {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return null;

  const leftPct = clampPct(((start.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const rightPct = clampPct(((end.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const widthPct = Math.max((100 / dayCount) * 0.25, rightPct - leftPct);

  return { left: `${leftPct}%`, width: `${widthPct}%` };
}

export function isoFromYmd(ymd: string): string {
  return `${ymd}T12:00:00.000Z`;
}
