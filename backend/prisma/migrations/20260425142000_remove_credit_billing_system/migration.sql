-- Remove legacy credit-based billing schema.

DROP TABLE IF EXISTS "CreditLog";
DROP TABLE IF EXISTS "PricePack";
DROP TABLE IF EXISTS "CreditPurchase";

ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "creditBalance",
  DROP COLUMN IF EXISTS "lastDeductedAt",
  DROP COLUMN IF EXISTS "freeTrialUsed",
  DROP COLUMN IF EXISTS "unlimitedCredits",
  DROP COLUMN IF EXISTS "discountPercent",
  DROP COLUMN IF EXISTS "discountNote",
  DROP COLUMN IF EXISTS "autoTopUpEnabled",
  DROP COLUMN IF EXISTS "autoTopUpPackId",
  DROP COLUMN IF EXISTS "autoTopUpThreshold",
  DROP COLUMN IF EXISTS "autoTopUpLastAttemptAt",
  DROP COLUMN IF EXISTS "pendingAutoTopUpUrl",
  DROP COLUMN IF EXISTS "pendingAutoTopUpCreatedAt",
  DROP COLUMN IF EXISTS "deactivatePersonCredits";
