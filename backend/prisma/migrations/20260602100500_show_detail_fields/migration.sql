-- Show detail fields on Production: technical profile + tech rider upload.

ALTER TABLE "Production"
ADD COLUMN "actorCount" INTEGER,
ADD COLUMN "durationMinutes" INTEGER,
ADD COLUMN "stageSize" TEXT,
ADD COLUMN "technicalSpecs" TEXT,
ADD COLUMN "techRiderPdfData" BYTEA,
ADD COLUMN "techRiderPdfName" TEXT;
