-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "segmentGroupId" TEXT;

-- CreateIndex
CREATE INDEX "TimeEntry_organizationId_personId_segmentGroupId_idx" ON "TimeEntry"("organizationId", "personId", "segmentGroupId");
