ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "temporarySeatsBoost" INTEGER,
  ADD COLUMN IF NOT EXISTS "temporarySeatsBoostExpiresAt" TIMESTAMP(3);
