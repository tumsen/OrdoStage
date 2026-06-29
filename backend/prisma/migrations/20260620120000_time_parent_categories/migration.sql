-- CreateTable
CREATE TABLE "TimeParentCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeParentCategory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "timeParentCategoryId" TEXT;

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN "timeParentCategoryId" TEXT;

-- AlterTable
ALTER TABLE "TimeProject" ADD COLUMN "timeParentCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "TimeParentCategory_organizationId_sortOrder_idx" ON "TimeParentCategory"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "Event_timeParentCategoryId_idx" ON "Event"("timeParentCategoryId");

-- CreateIndex
CREATE INDEX "Tour_timeParentCategoryId_idx" ON "Tour"("timeParentCategoryId");

-- CreateIndex
CREATE INDEX "TimeProject_timeParentCategoryId_idx" ON "TimeProject"("timeParentCategoryId");

-- AddForeignKey
ALTER TABLE "TimeParentCategory" ADD CONSTRAINT "TimeParentCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_timeParentCategoryId_fkey" FOREIGN KEY ("timeParentCategoryId") REFERENCES "TimeParentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_timeParentCategoryId_fkey" FOREIGN KEY ("timeParentCategoryId") REFERENCES "TimeParentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeProject" ADD CONSTRAINT "TimeProject_timeParentCategoryId_fkey" FOREIGN KEY ("timeParentCategoryId") REFERENCES "TimeParentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
