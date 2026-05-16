/** Tier curve in major currency units (e.g. euros), matching `webapp/src/lib/tieredSeatPricing.ts`. */

/** Canonical Flex postpaid curve (EUR). */
export const DEFAULT_TIERED_SEAT_MODEL = {
  base: 60,
  start: 25,
  floorAt: 20,
  floor: 5,
} as const;

export const TIERED_SEAT_MAX_USERS = 150;

export type TieredSeatModel = {
  base: number;
  start: number;
  floorAt: number;
  floor: number;
};

export function perUserRate(n: number, start: number, floor: number, floorAt: number): number {
  const safeFloorAt = Math.max(3, Math.floor(floorAt));
  if (n <= 1) return 0;
  if (n >= safeFloorAt) return floor;
  return start - ((start - floor) * (n - 2)) / (safeFloorAt - 2);
}

export function calcMonthlyTotal(users: number, base: number, start: number, floor: number, floorAt: number): number {
  const safeFloorAt = Math.max(3, Math.floor(floorAt));
  let total = base;
  for (let n = 2; n <= users; n++) {
    total += perUserRate(n, start, floor, safeFloorAt);
  }
  return total;
}

export function tieredMonthlyTotalCents(users: number, model: TieredSeatModel): number {
  if (users <= 0) return 0;
  const major = calcMonthlyTotal(users, model.base, model.start, model.floor, model.floorAt);
  return Math.max(0, Math.round(major * 100));
}
