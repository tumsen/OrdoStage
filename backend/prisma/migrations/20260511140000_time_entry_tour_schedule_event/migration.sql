-- Link time entries to a specific tour day schedule line (multiple slots per TourShow).
ALTER TABLE "TimeEntry" ADD COLUMN "tourScheduleEventId" TEXT;

CREATE INDEX "TimeEntry_tourScheduleEventId_idx" ON "TimeEntry"("tourScheduleEventId");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tourScheduleEventId_fkey" FOREIGN KEY ("tourScheduleEventId") REFERENCES "TourScheduleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
