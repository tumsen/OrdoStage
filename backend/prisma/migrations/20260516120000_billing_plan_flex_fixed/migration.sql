-- Flex (monthly postpaid) vs Fixed (annual commitment) billing plan on organizations.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "billingPlan" TEXT NOT NULL DEFAULT 'flex',
  ADD COLUMN IF NOT EXISTS "committedSeats" INTEGER,
  ADD COLUMN IF NOT EXISTS "annualRenewalDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "annualInvoiceAmountCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "paddleSubscriptionId" TEXT;

CREATE INDEX IF NOT EXISTS "Organization_billingPlan_idx" ON "Organization"("billingPlan");
CREATE INDEX IF NOT EXISTS "Organization_paddleSubscriptionId_idx" ON "Organization"("paddleSubscriptionId");
