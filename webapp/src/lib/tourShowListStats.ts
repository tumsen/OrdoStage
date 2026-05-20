import type { TourShowListRow } from "../../../backend/src/types";

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
