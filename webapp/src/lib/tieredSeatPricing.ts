/** Default illustrative USD seat curve (matches legacy calculator defaults). */
export const DEFAULT_TIERED_SEAT_MODEL = {
  base: 99,
  start: 30,
  floorAt: 100,
  floor: 5,
} as const;

export const TIERED_SEAT_MAX_USERS = 150;

/** Monthly multiplier when annual billing is on (1 = no discount). */
export function annualMonthlyMultiplier(discountPercent: number, discountEnabled: boolean): number {
  if (!discountEnabled) return 1;
  const p = Math.min(100, Math.max(0, discountPercent));
  return 1 - p / 100;
}

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

export type TieredSeatModel = {
  base: number;
  start: number;
  floorAt: number;
  floor: number;
};
