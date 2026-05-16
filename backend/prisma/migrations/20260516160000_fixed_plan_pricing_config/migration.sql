ALTER TABLE "BillingConfig"
  ADD COLUMN IF NOT EXISTS "fixedPlanPricingJson" TEXT;
