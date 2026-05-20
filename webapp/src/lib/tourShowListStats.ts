import type { TourShowListRow } from "../../../backend/src/types";
import { sortedTourScheduleEvents } from "@/lib/tourScheduleDisplay";

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
