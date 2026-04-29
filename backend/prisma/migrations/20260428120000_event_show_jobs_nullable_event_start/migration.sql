-- AlterTable: allow events without a calendar window until shows exist
ALTER TABLE "Event" ALTER COLUMN "startDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EventShowJob" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "venueId" TEXT NOT NULL,
    "personId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventShowJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventShowJob_showId_sortOrder_idx" ON "EventShowJob"("showId", "sortOrder");

-- CreateIndex
CREATE INDEX "EventShowJob_venueId_idx" ON "EventShowJob"("venueId");

-- AddForeignKey
ALTER TABLE "EventShowJob" ADD CONSTRAINT "EventShowJob_showId_fkey" FOREIGN KEY ("showId") REFERENCES "EventShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShowJob" ADD CONSTRAINT "EventShowJob_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventShowJob" ADD CONSTRAINT "EventShowJob_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
