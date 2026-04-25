-- Add configurable base currency for pricing calculations.
ALTER TABLE "BillingConfig"
  ADD COLUMN IF NOT EXISTS "baseCurrencyCode" TEXT NOT NULL DEFAULT 'USD';
