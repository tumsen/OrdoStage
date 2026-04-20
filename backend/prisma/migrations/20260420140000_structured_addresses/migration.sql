-- Structured address fields for Person
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "addressStreet"  TEXT,
  ADD COLUMN IF NOT EXISTS "addressNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "addressZip"     TEXT,
  ADD COLUMN IF NOT EXISTS "addressCity"    TEXT,
  ADD COLUMN IF NOT EXISTS "addressState"   TEXT,
  ADD COLUMN IF NOT EXISTS "addressCountry" TEXT;

-- Migrate old single-string address into addressStreet
UPDATE "Person"
  SET "addressStreet" = "address"
  WHERE "address" IS NOT NULL AND "addressStreet" IS NULL;

ALTER TABLE "Person" DROP COLUMN IF EXISTS "address";

-- Structured address fields for Venue
ALTER TABLE "Venue"
  ADD COLUMN IF NOT EXISTS "addressStreet"  TEXT,
  ADD COLUMN IF NOT EXISTS "addressNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "addressZip"     TEXT,
  ADD COLUMN IF NOT EXISTS "addressCity"    TEXT,
  ADD COLUMN IF NOT EXISTS "addressState"   TEXT,
  ADD COLUMN IF NOT EXISTS "addressCountry" TEXT;

UPDATE "Venue"
  SET "addressStreet" = "address"
  WHERE "address" IS NOT NULL AND "addressStreet" IS NULL;

ALTER TABLE "Venue" DROP COLUMN IF EXISTS "address";

-- Structured invoice address for Organization
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "invoiceStreet"  TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceZip"     TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceCity"    TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceState"   TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceCountry" TEXT;

UPDATE "Organization"
  SET "invoiceStreet" = "invoiceAddress"
  WHERE "invoiceAddress" IS NOT NULL AND "invoiceStreet" IS NULL;

ALTER TABLE "Organization" DROP COLUMN IF EXISTS "invoiceAddress";

-- Structured venue address for TourShow (venueCity already exists, add the rest)
ALTER TABLE "TourShow"
  ADD COLUMN IF NOT EXISTS "venueStreet"  TEXT,
  ADD COLUMN IF NOT EXISTS "venueNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "venueZip"     TEXT,
  ADD COLUMN IF NOT EXISTS "venueState"   TEXT,
  ADD COLUMN IF NOT EXISTS "venueCountry" TEXT;

UPDATE "TourShow"
  SET "venueStreet" = "venueAddress"
  WHERE "venueAddress" IS NOT NULL AND "venueStreet" IS NULL;

ALTER TABLE "TourShow" DROP COLUMN IF EXISTS "venueAddress";

-- Structured hotel address for TourShow
ALTER TABLE "TourShow"
  ADD COLUMN IF NOT EXISTS "hotelStreet"  TEXT,
  ADD COLUMN IF NOT EXISTS "hotelNumber"  TEXT,
  ADD COLUMN IF NOT EXISTS "hotelZip"     TEXT,
  ADD COLUMN IF NOT EXISTS "hotelCity"    TEXT,
  ADD COLUMN IF NOT EXISTS "hotelState"   TEXT,
  ADD COLUMN IF NOT EXISTS "hotelCountry" TEXT;

UPDATE "TourShow"
  SET "hotelStreet" = "hotelAddress"
  WHERE "hotelAddress" IS NOT NULL AND "hotelStreet" IS NULL;

ALTER TABLE "TourShow" DROP COLUMN IF EXISTS "hotelAddress";
