-- Speed up GET /api/schedule: org + date filters and tour show range scans.
CREATE INDEX IF NOT EXISTS "Event_organizationId_startDate_idx" ON "Event"("organizationId", "startDate");

CREATE INDEX IF NOT EXISTS "InternalBooking_organizationId_startDate_idx" ON "InternalBooking"("organizationId", "startDate");

CREATE INDEX IF NOT EXISTS "TourShow_date_idx" ON "TourShow"("date");
