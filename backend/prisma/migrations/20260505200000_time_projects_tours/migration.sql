-- AlterTable
ALTER TABLE "TimeProject"
  ADD COLUMN "tourId" TEXT,
  ADD COLUMN "tourShowId" TEXT;

-- AddForeignKey
ALTER TABLE "TimeProject"
  ADD CONSTRAINT "TimeProject_tourId_fkey"
  FOREIGN KEY ("tourId") REFERENCES "Tour"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeProject"
  ADD CONSTRAINT "TimeProject_tourShowId_fkey"
  FOREIGN KEY ("tourShowId") REFERENCES "TourShow"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TimeProject_tourId_idx" ON "TimeProject"("tourId");

-- CreateIndex
CREATE INDEX "TimeProject_tourShowId_idx" ON "TimeProject"("tourShowId");
