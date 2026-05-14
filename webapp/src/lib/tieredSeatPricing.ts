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

/** Marginal monthly EUR for the n-th billable seat (1-based): seat 1 = base platform fee; seat 2+ = tier marginal. */
export function marginalSeatMajorForIndex1Based(seatIndex: number, m: TieredSeatModel): number {
  if (seatIndex < 1 || !Number.isFinite(seatIndex)) return 0;
  if (seatIndex === 1) return m.base;
  const safeFloorAt = Math.max(3, Math.floor(m.floorAt));
  return perUserRate(seatIndex, m.start, m.floor, safeFloorAt);
}

/** English ordinal for seat counts (1 → 1st, 11 → 11th). */
export function ordinalEn(n: number): string {
  const v = Math.floor(Math.abs(n));
  const j = v % 10;
  const k = v % 100;
  if (j === 1 && k !== 11) return `${v}st`;
  if (j === 2 && k !== 12) return `${v}nd`;
  if (j === 3 && k !== 13) return `${v}rd`;
  return `${v}th`;
}

/** Format whole euros when possible (e.g. €80, €19.50). */
export function formatEuroMajor(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const maxFrac = Number.isInteger(rounded) ? 0 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  }).format(rounded);
}
