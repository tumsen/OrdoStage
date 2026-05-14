import { z } from "zod";

export const SEAT_CALCULATOR_JSON_MAX_CHARS = 16_384;

export const SeatCalculatorJsonSchema = z.object({
  model: z
    .object({
      base: z.number().finite().min(0).max(1_000_000).optional(),
      start: z.number().finite().min(0).max(1_000_000).optional(),
      floorAt: z.number().int().min(3).max(150).optional(),
      floor: z.number().finite().min(0).max(1_000_000).optional(),
    })
    .optional(),
  yearlyDiscountPercent: z.number().int().min(0).max(100).optional(),
  yearlyDiscountEnabled: z.boolean().optional(),
});

export type SeatCalculatorJson = z.infer<typeof SeatCalculatorJsonSchema>;

export function parseSeatCalculatorJson(raw: string | null | undefined): SeatCalculatorJson | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const data = JSON.parse(String(raw)) as unknown;
    const r = SeatCalculatorJsonSchema.safeParse(data);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
