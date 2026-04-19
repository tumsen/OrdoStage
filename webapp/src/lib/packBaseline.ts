/** Shared pricing math: "smallest" pack = fewest credit-days, then cheapest if tied. */

export type PackLike = { days: number; amountCents: number };

export function pickBaselinePack<T extends PackLike>(packs: T[]): T | null {
  if (!packs.length) return null;
  return [...packs].sort((a, b) => a.days - b.days || a.amountCents - b.amountCents)[0];
}

/** List price (cents) if this many days were sold at the baseline per-day rate. */
export function listPriceCents(packDays: number, baseline: PackLike): number {
  if (baseline.days <= 0 || packDays <= 0) return 0;
  return Math.round((baseline.amountCents / baseline.days) * packDays);
}

/**
 * Signed % vs list at baseline rate: positive = discount, negative = markup.
 * e.g. +15 = 15% below list, -5 = 5% above list.
 */
export function savingsPercentFromPrice(amountCents: number, packDays: number, baseline: PackLike): number {
  const list = listPriceCents(packDays, baseline);
  if (list <= 0) return 0;
  return Math.round((1 - amountCents / list) * 1000) / 10;
}

export function priceCentsFromDiscountPercent(percent: number, packDays: number, baseline: PackLike): number {
  const list = listPriceCents(packDays, baseline);
  if (list <= 0) return 1;
  const p = Math.min(150, Math.max(-100, percent));
  return Math.max(1, Math.round(list * (1 - p / 100)));
}

export function formatPercentLabel(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const abs = Math.abs(pct).toFixed(pct % 1 === 0 ? 0 : 1);
  if (pct > 0.05) return `${abs}% below list`;
  if (pct < -0.05) return `${abs}% above list`;
  return "List price";
}
