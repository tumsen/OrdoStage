-- Link time entries to tour show days (parallel to eventShowJob for events).
ALTER TABLE "TimeEntry" ADD COLUMN "tourShowId" TEXT;

CREATE INDEX "TimeEntry_tourShowId_idx" ON "TimeEntry"("tourShowId");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tourShowId_fkey" FOREIGN KEY ("tourShowId") REFERENCES "TourShow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
