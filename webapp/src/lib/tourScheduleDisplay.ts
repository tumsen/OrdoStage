import type { TourScheduleEvent, TourScheduleEventKind } from "../../../backend/src/types";
import { durationMinutesBetween, normalizeTimeHHMM } from "./showTiming";

/** Payloads that carry merged `scheduleEvents` and optional legacy columns (public API may omit empty arrays). */
export type TourShowScheduleSource = {
  scheduleEvents?: TourScheduleEvent[] | null;
  showTime?: string | null;
  getInTime?: string | null;
  rehearsalTime?: string | null;
  soundcheckTime?: string | null;
  doorsTime?: string | null;
  travelTimeMinutes?: number | null;
};

const KIND_LABELS: Record<TourScheduleEventKind, string> = {
  get_in: "Get-in",
  get_out: "Get-out",
  show: "Show",
  rehearsal: "Rehearsal",
  soundcheck: "Soundcheck",
  travel: "Travel",
  custom: "Custom",
};

export function sortedTourScheduleEvents(show: TourShowScheduleSource): TourScheduleEvent[] {
  return [...(show.scheduleEvents ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function scheduleEventLabel(ev: TourScheduleEvent): string {
  if (ev.kind === "custom" && ev.customLabel?.trim()) return ev.customLabel.trim();
  return KIND_LABELS[ev.kind] ?? ev.kind;
}

/** Start time, or start–end when both valid and different (strict HH:mm). */
export function formatScheduleEventTimes(ev: TourScheduleEvent): string {
  const s = normalizeTimeHHMM(ev.startTime);
  const e = normalizeTimeHHMM(ev.endTime);
  if (!s) return "";
  if (e && e !== s) return `${s}–${e}`;
  return s;
}

export function tourShowHasScheduleTimeline(show: TourShowScheduleSource): boolean {
  return sortedTourScheduleEvents(show).length > 0;
}

/** Pill / sidebar time: show slot first, else earliest scheduled start. */
export function tourShowPrimaryTime(show: TourShowScheduleSource): string | null {
  const evs = sortedTourScheduleEvents(show);
  const showEv = evs.find((e) => e.kind === "show");
  if (showEv) {
    const t = normalizeTimeHHMM(showEv.startTime);
    if (t) return t;
  }
  for (const ev of evs) {
    const t = normalizeTimeHHMM(ev.startTime);
    if (t) return t;
  }
  const legacy =
    normalizeTimeHHMM(show.showTime ?? "") || normalizeTimeHHMM(show.getInTime ?? "");
  return legacy || null;
}

/** Target arrival at next city — first get-in event, else legacy get-in column. */
export function tourShowGetInTimeHHMM(show: TourShowScheduleSource): string | null {
  const evs = sortedTourScheduleEvents(show);
  const gi = evs.find((e) => e.kind === "get_in");
  if (gi) {
    const t = normalizeTimeHHMM(gi.startTime);
    if (t) return t;
  }
  return normalizeTimeHHMM(show.getInTime ?? "") || null;
}

/** Calendar grid start time (same priority as primary). */
export function tourShowCalendarStartTime(show: TourShowScheduleSource): string | null {
  return tourShowPrimaryTime(show);
}

/**
 * Duration for calendar bar width: span of show row (or first row), else legacy travel minutes after show start.
 */
export function tourShowCalendarDurationMinutes(show: TourShowScheduleSource): number | null {
  const evs = sortedTourScheduleEvents(show);
  const pick = evs.find((e) => e.kind === "show") ?? evs[0];
  if (pick) {
    const s = normalizeTimeHHMM(pick.startTime);
    const e = normalizeTimeHHMM(pick.endTime);
    if (s && e) {
      const d = durationMinutesBetween(s, e);
      if (d !== null && d > 0) return d;
    }
  }
  const st = normalizeTimeHHMM(show.showTime ?? "");
  if (st && show.travelTimeMinutes && show.travelTimeMinutes > 0) {
    return show.travelTimeMinutes;
  }
  return null;
}

/** Compact text for PDF/overview lines (labels + HH:mm ranges). */
export function tourShowScheduleSummaryCompact(show: TourShowScheduleSource): string {
  const evs = sortedTourScheduleEvents(show);
  if (evs.length === 0) return "";
  return evs
    .map((ev) => {
      const line = `${scheduleEventLabel(ev)} ${formatScheduleEventTimes(ev)}`.trim();
      return line;
    })
    .filter(Boolean)
    .join("  ");
}
