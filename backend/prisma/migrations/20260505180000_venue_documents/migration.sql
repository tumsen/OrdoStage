-- CreateTable
CREATE TABLE "VenueDocument" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueDocument_venueId_idx" ON "VenueDocument"("venueId");

-- AddForeignKey
ALTER TABLE "VenueDocument" ADD CONSTRAINT "VenueDocument_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
