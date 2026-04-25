ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "paddleCustomerId" TEXT;

ALTER TABLE "BillingInvoice"
  ADD COLUMN IF NOT EXISTS "paddleTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "paddleInvoiceUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Organization_paddleCustomerId_idx"
  ON "Organization"("paddleCustomerId");

CREATE INDEX IF NOT EXISTS "BillingInvoice_paddleTransactionId_idx"
  ON "BillingInvoice"("paddleTransactionId");
