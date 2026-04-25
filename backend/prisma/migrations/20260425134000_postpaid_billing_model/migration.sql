-- Postpaid billing model: config, daily usage snapshots, invoices, and org-level pricing overrides.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "billingStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "billingDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "billingViewOnlySince" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customUserDailyRateCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "customDiscountPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "customFlatRateCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "customFlatRateMaxUsers" INTEGER;

CREATE TABLE IF NOT EXISTS "BillingConfig" (
  "id" TEXT NOT NULL,
  "defaultUserDailyRateCents" INTEGER NOT NULL DEFAULT 1500,
  "defaultDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  "defaultFlatRateCents" INTEGER,
  "defaultFlatRateMaxUsers" INTEGER,
  "paymentDueDays" INTEGER NOT NULL DEFAULT 7,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BillingUsageSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "activeUsers" INTEGER NOT NULL,
  "userDailyRateCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingUsageSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BillingInvoice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "subtotalCents" INTEGER NOT NULL,
  "discountPercent" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "paddleInvoiceId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BillingInvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "userEmail" TEXT,
  "daysConsumed" INTEGER NOT NULL,
  "rateCents" INTEGER NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillingUsageSnapshot_organizationId_snapshotDate_key"
  ON "BillingUsageSnapshot"("organizationId", "snapshotDate");
CREATE INDEX IF NOT EXISTS "BillingUsageSnapshot_snapshotDate_idx"
  ON "BillingUsageSnapshot"("snapshotDate");
CREATE INDEX IF NOT EXISTS "BillingInvoice_organizationId_status_idx"
  ON "BillingInvoice"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "BillingInvoice_issuedAt_idx"
  ON "BillingInvoice"("issuedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BillingUsageSnapshot_organizationId_fkey'
  ) THEN
    ALTER TABLE "BillingUsageSnapshot"
      ADD CONSTRAINT "BillingUsageSnapshot_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BillingInvoice_organizationId_fkey'
  ) THEN
    ALTER TABLE "BillingInvoice"
      ADD CONSTRAINT "BillingInvoice_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'BillingInvoiceLine_invoiceId_fkey'
  ) THEN
    ALTER TABLE "BillingInvoiceLine"
      ADD CONSTRAINT "BillingInvoiceLine_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "BillingConfig" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
