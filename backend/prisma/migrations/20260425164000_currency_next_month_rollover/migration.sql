-- Add next-month currency price slot and rollover marker.
ALTER TABLE "BillingConfig"
  ADD COLUMN IF NOT EXISTS "priceRolloverMonthKey" TEXT;

ALTER TABLE "BillingCurrencyPrice"
  ADD COLUMN IF NOT EXISTS "nextMonthUserDailyRateCents" INTEGER;
