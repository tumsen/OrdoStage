-- Add invoice/company info fields to Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "invoiceName"    TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceVat"     TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceEmail"   TEXT,
  ADD COLUMN IF NOT EXISTS "invoicePhone"   TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceContact" TEXT;

-- Add snapshot + invoice number fields to CreditPurchase
ALTER TABLE "CreditPurchase"
  ADD COLUMN IF NOT EXISTS "invoiceNumber"          TEXT,
  ADD COLUMN IF NOT EXISTS "orgNameSnapshot"         TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNameSnapshot"     TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceAddressSnapshot"  TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceVatSnapshot"      TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceEmailSnapshot"    TEXT,
  ADD COLUMN IF NOT EXISTS "packLabelSnapshot"       TEXT;

-- Add unique index on invoiceNumber
CREATE UNIQUE INDEX IF NOT EXISTS "CreditPurchase_invoiceNumber_key" ON "CreditPurchase"("invoiceNumber");

-- Change FK on CreditPurchase.organizationId from RESTRICT to SET NULL
-- Drop old constraint first
ALTER TABLE "CreditPurchase" DROP CONSTRAINT IF EXISTS "CreditPurchase_organizationId_fkey";

-- Make column nullable
ALTER TABLE "CreditPurchase" ALTER COLUMN "organizationId" DROP NOT NULL;

-- Re-add FK with SET NULL
ALTER TABLE "CreditPurchase"
  ADD CONSTRAINT "CreditPurchase_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
