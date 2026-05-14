-- Global defaults for public seat calculator (annual prepaid discount)
ALTER TABLE "BillingConfig" ADD COLUMN IF NOT EXISTS "yearlyDiscountPercent" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "BillingConfig" ADD COLUMN IF NOT EXISTS "yearlyDiscountEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Per-organization postpaid daily rate override + optional seat-calculator JSON (tier + yearly overrides)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customUserDailyRateCents" INTEGER;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "customSeatCalculatorJson" TEXT;
