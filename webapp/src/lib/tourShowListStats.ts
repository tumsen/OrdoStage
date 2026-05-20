import type { TourShowListRow } from "../../../backend/src/types";
import {
  formatScheduleEventTimes,
  sortedTourScheduleEvents,
  tourShowPrimaryTime,
} from "@/lib/tourScheduleDisplay";
import { normalizeTimeHHMM } from "@/lib/showTiming";

export type TourPerformanceLine = { time: string; venue: string };

function dayKeyForShow(show: TourShowListRow): string {
  return (show.dayKey || show.date).slice(0, 10);
}

/** Scheduled performances on one calendar day (show events, or one per show-type day row). */
export function tourPerformanceCountOnDay(shows: TourShowListRow[], dayKey: string): number {
  let total = 0;
  for (const s of shows) {
    if (dayKeyForShow(s) !== dayKey) continue;
    const scheduled = sortedTourScheduleEvents(s).filter((e) => e.kind === "show").length;
    if (scheduled > 0) {
      total += scheduled;
    } else if (s.type === "show") {
      total += 1;
    }
  }
  return total;
}

function formatTourListTime(
  timeRaw: string | null,
  dayKey: string,
  locale: string,
  hour12: boolean,
): string {
  const normalized = timeRaw ? normalizeTimeHHMM(timeRaw) : null;
  if (!normalized) return "—";
  const base = new Date(`${dayKey}T12:00:00`);
  const [hh, mm] = normalized.split(":").map((x) => Number(x));
  if (Number.isFinite(hh) && Number.isFinite(mm)) base.setHours(hh, mm, 0, 0);
  return base.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12 });
}

/** Each scheduled show performance on a calendar day (time + venue per line). */
export function tourPerformanceLinesOnDay(
  shows: TourShowListRow[],
  dayKey: string,
  locale: string,
  hour12: boolean,
): TourPerformanceLine[] {
  const lines: TourPerformanceLine[] = [];
  for (const s of shows) {
    if (dayKeyForShow(s) !== dayKey || s.type !== "show") continue;
    const venue = tourShowVenueLabel(s);
    const showEvents = sortedTourScheduleEvents(s).filter((e) => e.kind === "show");
    if (showEvents.length > 0) {
      for (const ev of showEvents) {
        const range = formatScheduleEventTimes(ev);
        const time = range.includes("–")
          ? range
          : formatTourListTime(range || ev.startTime, dayKey, locale, hour12);
        lines.push({ time: time || "—", venue });
      }
    } else {
      lines.push({
        time: formatTourListTime(tourShowPrimaryTime(s), dayKey, locale, hour12),
        venue,
      });
    }
  }
  return lines;
}

export function tourShowVenueLabel(show: TourShowListRow): string {
  if (show.type === "travel") {
    const from = show.fromLocation?.trim();
    const to = show.toLocation?.trim();
    if (from && to) return `${from} → ${to}`;
    return from || to || "Travel";
  }
  if (show.type === "day_off") return "Day off";
  const name = show.venueName?.trim();
  const city = show.venueCity?.trim();
  if (name && city) return `${name}, ${city}`;
  return name || city || show.venueCountry?.trim() || "Venue TBD";
}

export function tourShowPeopleOnDay(show: TourShowListRow, tourPeopleCount: number): number {
  return show.showPeopleCount > 0 ? show.showPeopleCount : tourPeopleCount;
}

export function computeTourShowCrewStats(
  show: TourShowListRow,
  tourHandsNeeded: number | null,
  tourPeopleCount: number,
) {
  const people = tourShowPeopleOnDay(show, tourPeopleCount);
  const needed = show.handsNeeded ?? tourHandsNeeded;
  return { people, needed };
}

export function computeTourCrewTotals(
  shows: TourShowListRow[],
  tourHandsNeeded: number | null,
  tourPeopleCount: number,
) {
  let maxPeople = 0;
  for (const show of shows) {
    maxPeople = Math.max(maxPeople, tourShowPeopleOnDay(show, tourPeopleCount));
  }
  return { people: maxPeople, handsNeeded: tourHandsNeeded };
}
