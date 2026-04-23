-- Add person profile photo fields
ALTER TABLE "Person"
ADD COLUMN "photoData" BYTEA,
ADD COLUMN "photoFilename" TEXT,
ADD COLUMN "photoMimeType" TEXT,
ADD COLUMN "photoUpdatedAt" TIMESTAMP(3);

-- Add person documents table
CREATE TABLE "PersonDocument" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'other',
  "filename" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonDocument_personId_idx" ON "PersonDocument"("personId");

ALTER TABLE "PersonDocument"
ADD CONSTRAINT "PersonDocument_personId_fkey"
FOREIGN KEY ("personId")
REFERENCES "Person"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
