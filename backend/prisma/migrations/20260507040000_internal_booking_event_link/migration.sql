-- AlterTable
ALTER TABLE "InternalBooking" ADD COLUMN "eventId" TEXT;

-- CreateIndex
CREATE INDEX "InternalBooking_eventId_idx" ON "InternalBooking"("eventId");

-- CreateIndex
CREATE INDEX "InternalBooking_venueId_startDate_idx" ON "InternalBooking"("venueId", "startDate");

-- AddForeignKey
ALTER TABLE "InternalBooking" ADD CONSTRAINT "InternalBooking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
