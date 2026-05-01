-- Venue-specific tech rider PDF stored in-app (replaces external object storage).

ALTER TABLE "TourShow" ADD COLUMN "venueTechRiderPdfData" BYTEA;
ALTER TABLE "TourShow" ADD COLUMN "venueTechRiderPdfName" TEXT;
