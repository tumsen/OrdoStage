import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import { calcMonthlyTotal, DEFAULT_TIERED_SEAT_MODEL, type TieredSeatModel } from "@/lib/tieredSeatPricing";

/** Mirrors `backend/src/postpaidBilling.ts` seat + discount + flat-cap logic (amounts in cents). */
export function seatCurveSubtotalCents(input: {
  billableUsers: number;
  customUserMonthlyRateCents: number | null | undefined;
  orgSeatCalculatorJson: string | null | undefined;
  globalSeatCalculatorJson: string | null | undefined;
  tablePerUserMonthlyRateCents: number;
}): number {
  const u = input.billableUsers;
  if (u <= 0) return 0;
  if (input.customUserMonthlyRateCents != null && input.customUserMonthlyRateCents > 0) {
    return u * input.customUserMonthlyRateCents;
  }
  const g = parseSeatCalculatorJson(input.globalSeatCalculatorJson);
  const o = parseSeatCalculatorJson(input.orgSeatCalculatorJson);
  if (g?.model == null && o?.model == null) {
    return u * input.tablePerUserMonthlyRateCents;
  }
  const model: TieredSeatModel = { ...DEFAULT_TIERED_SEAT_MODEL };
  if (g?.model) Object.assign(model, g.model);
  if (o?.model) Object.assign(model, o.model);
  return Math.round(calcMonthlyTotal(u, model.base, model.start, model.floor, model.floorAt) * 100);
}

export function estimateMonthlyOrgAmountCents(input: {
  billableUsers: number;
  perUserMonthlyRateCents: number;
  customUserMonthlyRateCents?: number | null;
  customDiscountPercent: number | null;
  customFlatRateCents: number | null;
  customFlatRateMaxUsers: number | null;
  activeMemberCount: number;
  orgSeatCalculatorJson?: string | null;
  globalSeatCalculatorJson?: string | null;
}): number {
  const subtotal = seatCurveSubtotalCents({
    billableUsers: input.billableUsers,
    customUserMonthlyRateCents: input.customUserMonthlyRateCents,
    orgSeatCalculatorJson: input.orgSeatCalculatorJson,
    globalSeatCalculatorJson: input.globalSeatCalculatorJson,
    tablePerUserMonthlyRateCents: input.perUserMonthlyRateCents,
  });
  const discountPercent = Math.min(Math.max(input.customDiscountPercent ?? 0, 0), 100);
  const flatRateApplicable =
    input.customFlatRateCents != null &&
    input.customFlatRateMaxUsers != null &&
    input.customFlatRateMaxUsers > 0 &&
    input.activeMemberCount <= input.customFlatRateMaxUsers;
  if (flatRateApplicable) return input.customFlatRateCents!;
  const discountCents = Math.round((subtotal * discountPercent) / 100);
  return Math.max(subtotal - discountCents, 0);
}
