-- Add per-currency follow-base and rounding preferences for admin pricing UI.
ALTER TABLE "BillingCurrencyPrice"
  ADD COLUMN IF NOT EXISTS "followBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "roundingMode" TEXT NOT NULL DEFAULT 'nearest',
  ADD COLUMN IF NOT EXISTS "roundingUnit" TEXT NOT NULL DEFAULT '00';
