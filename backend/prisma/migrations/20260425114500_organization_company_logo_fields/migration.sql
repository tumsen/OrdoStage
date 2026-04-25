-- Add company logo fields to Organization (used for Account branding + PDF/report headers)
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "companyLogoData" BYTEA,
  ADD COLUMN IF NOT EXISTS "companyLogoMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "companyLogoUpdatedAt" TIMESTAMP(3);
