/** Default illustrative USD seat curve (matches legacy calculator defaults). */
export const DEFAULT_TIERED_SEAT_MODEL = {
  base: 99,
  start: 30,
  floorAt: 100,
  floor: 5,
} as const;

export const TIERED_SEAT_MAX_USERS = 150;
export const TIERED_SEAT_ANNUAL_DISCOUNT = 0.85;
/** Rough competitor benchmark for “vs Planday” row ($/user/mo). */
export const TIERED_SEAT_PLANDAY_ESTIMATE_PER_USER = 4;

export function perUserRate(n: number, start: number, floor: number, floorAt: number): number {
  if (n <= 1) return 0;
  if (n >= floorAt) return floor;
  return start - ((start - floor) * (n - 2)) / (floorAt - 2);
}

export function calcMonthlyTotal(users: number, base: number, start: number, floor: number, floorAt: number): number {
  const safeFloorAt = Math.max(3, floorAt);
  let total = base;
  for (let n = 2; n <= users; n++) {
    total += perUserRate(n, start, floor, safeFloorAt);
  }
  return total;
}

export type TieredSeatModel = {
  base: number;
  start: number;
  floorAt: number;
  floor: number;
};
