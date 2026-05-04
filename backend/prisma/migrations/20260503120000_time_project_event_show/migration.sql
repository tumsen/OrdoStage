-- Time projects can be linked to a specific show (not only the parent event).
ALTER TABLE "TimeProject" ADD COLUMN "eventShowId" TEXT;
ALTER TABLE "TimeProject" ADD CONSTRAINT "TimeProject_eventShowId_fkey" FOREIGN KEY ("eventShowId") REFERENCES "EventShow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "TimeProject_eventShowId_idx" ON "TimeProject"("eventShowId");
