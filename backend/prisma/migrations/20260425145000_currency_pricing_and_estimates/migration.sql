ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "billingCurrencyCode" TEXT NOT NULL DEFAULT 'EUR';

ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "customUserDailyRateCents";

ALTER TABLE "BillingConfig"
  DROP COLUMN IF EXISTS "defaultUserDailyRateCents",
  DROP COLUMN IF EXISTS "defaultDiscountPercent",
  DROP COLUMN IF EXISTS "defaultFlatRateCents",
  DROP COLUMN IF EXISTS "defaultFlatRateMaxUsers";

CREATE TABLE IF NOT EXISTS "BillingCurrencyPrice" (
  "currencyCode" TEXT NOT NULL,
  "userDailyRateCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingCurrencyPrice_pkey" PRIMARY KEY ("currencyCode")
);

ALTER TABLE "BillingUsageSnapshot"
  ADD COLUMN IF NOT EXISTS "currencyCode" TEXT NOT NULL DEFAULT 'EUR';

INSERT INTO "BillingCurrencyPrice" ("currencyCode", "userDailyRateCents")
VALUES
  ('EUR', 1500),
  ('USD', 1700),
  ('DKK', 11000),
  ('SEK', 17000),
  ('NOK', 17000),
  ('GBP', 1300),
  ('CHF', 1500),
  ('PLN', 6500),
  ('CZK', 37000),
  ('HUF', 600000),
  ('RON', 7500),
  ('BGN', 3000),
  ('HRK', 11300)
ON CONFLICT ("currencyCode") DO NOTHING;
