-- Fixed plan: invoice kinds, annual rounding config, term start for proration.

ALTER TABLE "BillingConfig"
  ADD COLUMN IF NOT EXISTS "fixedAnnualRoundToTen" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "BillingInvoice"
  ADD COLUMN IF NOT EXISTS "invoiceKind" TEXT NOT NULL DEFAULT 'flex_monthly';

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "annualTermStartDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BillingInvoice_organizationId_periodKind_idx"
  ON "BillingInvoice"("organizationId", "periodStart", "periodEnd", "invoiceKind");
