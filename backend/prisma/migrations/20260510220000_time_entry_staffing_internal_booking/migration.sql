-- Event show staffing + internal booking assignments for time tracking.
ALTER TABLE "TimeEntry" ADD COLUMN "eventShowStaffingId" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "internalBookingPersonId" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN "internalBookingDayKey" TEXT;

CREATE INDEX "TimeEntry_eventShowStaffingId_idx" ON "TimeEntry"("eventShowStaffingId");
CREATE INDEX "TimeEntry_internalBookingPersonId_idx" ON "TimeEntry"("internalBookingPersonId");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_eventShowStaffingId_fkey" FOREIGN KEY ("eventShowStaffingId") REFERENCES "EventShowStaffing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_internalBookingPersonId_fkey" FOREIGN KEY ("internalBookingPersonId") REFERENCES "InternalBookingPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
