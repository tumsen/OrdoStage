-- External time import batches and trace fields on entries for remapping.

CREATE TABLE "TimeImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeImportBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TimeEntry" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "importExternalProject" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "importExternalTags" TEXT;

CREATE INDEX "TimeImportBatch_organizationId_createdAt_idx" ON "TimeImportBatch"("organizationId", "createdAt");
CREATE INDEX "TimeEntry_importBatchId_idx" ON "TimeEntry"("importBatchId");
CREATE INDEX "TimeEntry_organizationId_importExternalProject_idx" ON "TimeEntry"("organizationId", "importExternalProject");

ALTER TABLE "TimeImportBatch" ADD CONSTRAINT "TimeImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "TimeImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
