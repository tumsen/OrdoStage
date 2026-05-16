import { z } from "zod";

export const FixedPlanPricingConfigSchema = z.object({
  firstSeatAnnualMonthlyMajor: z.number().finite().min(0).max(10_000).optional(),
  discountPercentMin: z.number().int().min(0).max(100).optional(),
  discountPercentMax: z.number().int().min(0).max(100).optional(),
  discountCapSeats: z.number().int().min(1).max(500).optional(),
  selfServeMaxSeats: z.number().int().min(1).max(500).optional(),
});

export type FixedPlanPricingConfig = {
  firstSeatAnnualMonthlyMajor: number;
  discountPercentMin: number;
  discountPercentMax: number;
  discountCapSeats: number;
  selfServeMaxSeats: number;
};

export const DEFAULT_FIXED_PLAN_PRICING: FixedPlanPricingConfig = {
  firstSeatAnnualMonthlyMajor: 30,
  discountPercentMin: 15,
  discountPercentMax: 42,
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
  const min = partial.discountPercentMin ?? DEFAULT_FIXED_PLAN_PRICING.discountPercentMin;
  const max = partial.discountPercentMax ?? DEFAULT_FIXED_PLAN_PRICING.discountPercentMax;
  return {
    firstSeatAnnualMonthlyMajor:
      partial.firstSeatAnnualMonthlyMajor ?? DEFAULT_FIXED_PLAN_PRICING.firstSeatAnnualMonthlyMajor,
    discountPercentMin: min,
    discountPercentMax: Math.max(min, max),
    discountCapSeats: partial.discountCapSeats ?? DEFAULT_FIXED_PLAN_PRICING.discountCapSeats,
    selfServeMaxSeats: partial.selfServeMaxSeats ?? DEFAULT_FIXED_PLAN_PRICING.selfServeMaxSeats,
  };
}

export function serializeFixedPlanPricingJson(
  partial: z.infer<typeof FixedPlanPricingConfigSchema>,
): string {
  return JSON.stringify(mergeFixedPlanPricing(partial));
}
