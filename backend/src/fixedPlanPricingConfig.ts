import { z } from "zod";

export const FixedPlanPricingConfigSchema = z.object({
  firstSeatAnnualMonthlyMajor: z.number().finite().min(0).max(10_000).optional(),
  /** @deprecated use monthlyVolumeDiscountPercentMin */
  discountPercentMin: z.number().int().min(0).max(100).optional(),
  /** @deprecated use monthlyVolumeDiscountPercentMax */
  discountPercentMax: z.number().int().min(0).max(100).optional(),
  monthlyVolumeDiscountPercentMin: z.number().int().min(0).max(100).optional(),
  monthlyVolumeDiscountPercentMax: z.number().int().min(0).max(100).optional(),
  annualVolumeDiscountPercentMin: z.number().int().min(0).max(100).optional(),
  annualVolumeDiscountPercentMax: z.number().int().min(0).max(100).optional(),
  discountCapSeats: z.number().int().min(1).max(500).optional(),
  selfServeMaxSeats: z.number().int().min(1).max(500).optional(),
});

export type FixedPlanPricingConfig = {
  firstSeatMonthlyMajor: number;
  monthlyVolumeDiscountPercentMin: number;
  monthlyVolumeDiscountPercentMax: number;
  annualVolumeDiscountPercentMin: number;
  annualVolumeDiscountPercentMax: number;
  discountCapSeats: number;
  selfServeMaxSeats: number;
};

export const DEFAULT_FIXED_PLAN_PRICING: FixedPlanPricingConfig = {
  firstSeatMonthlyMajor: 30,
  monthlyVolumeDiscountPercentMin: 15,
  monthlyVolumeDiscountPercentMax: 42,
  annualVolumeDiscountPercentMin: 15,
  annualVolumeDiscountPercentMax: 42,
  discountCapSeats: 150,
  selfServeMaxSeats: 150,
};

export function parseFixedPlanPricingJson(raw: string | null | undefined): FixedPlanPricingConfig {
  if (raw == null || !String(raw).trim()) return { ...DEFAULT_FIXED_PLAN_PRICING };
  try {
    const data = JSON.parse(String(raw)) as unknown;
    const r = FixedPlanPricingConfigSchema.safeParse(data);
    if (!r.success) return { ...DEFAULT_FIXED_PLAN_PRICING };
    return mergeFixedPlanPricing(r.data);
  } catch {
    return { ...DEFAULT_FIXED_PLAN_PRICING };
  }
}

function mergeFixedPlanPricing(partial: z.infer<typeof FixedPlanPricingConfigSchema>): FixedPlanPricingConfig {
  const legacyMin = partial.discountPercentMin ?? DEFAULT_FIXED_PLAN_PRICING.monthlyVolumeDiscountPercentMin;
  const legacyMax = partial.discountPercentMax ?? DEFAULT_FIXED_PLAN_PRICING.monthlyVolumeDiscountPercentMax;
  const monthlyMin = partial.monthlyVolumeDiscountPercentMin ?? legacyMin;
  const monthlyMaxRaw = partial.monthlyVolumeDiscountPercentMax ?? legacyMax;
  const monthlyMax = Math.max(monthlyMin, monthlyMaxRaw);
  const annualMin = partial.annualVolumeDiscountPercentMin ?? legacyMin;
  const annualMaxRaw = partial.annualVolumeDiscountPercentMax ?? legacyMax;
  const annualMax = Math.max(annualMin, annualMaxRaw);
  return {
    firstSeatMonthlyMajor:
      partial.firstSeatAnnualMonthlyMajor ?? DEFAULT_FIXED_PLAN_PRICING.firstSeatMonthlyMajor,
    monthlyVolumeDiscountPercentMin: monthlyMin,
    monthlyVolumeDiscountPercentMax: monthlyMax,
    annualVolumeDiscountPercentMin: annualMin,
    annualVolumeDiscountPercentMax: annualMax,
    discountCapSeats: partial.discountCapSeats ?? DEFAULT_FIXED_PLAN_PRICING.discountCapSeats,
    selfServeMaxSeats: partial.selfServeMaxSeats ?? DEFAULT_FIXED_PLAN_PRICING.selfServeMaxSeats,
  };
}

export function serializeFixedPlanPricingJson(
  partial: z.infer<typeof FixedPlanPricingConfigSchema> & Partial<FixedPlanPricingConfig>,
): string {
  const merged = mergeFixedPlanPricing(partial);
  return JSON.stringify({
    firstSeatAnnualMonthlyMajor: merged.firstSeatMonthlyMajor,
    monthlyVolumeDiscountPercentMin: merged.monthlyVolumeDiscountPercentMin,
    monthlyVolumeDiscountPercentMax: merged.monthlyVolumeDiscountPercentMax,
    annualVolumeDiscountPercentMin: merged.annualVolumeDiscountPercentMin,
    annualVolumeDiscountPercentMax: merged.annualVolumeDiscountPercentMax,
    discountCapSeats: merged.discountCapSeats,
    selfServeMaxSeats: merged.selfServeMaxSeats,
  });
}
