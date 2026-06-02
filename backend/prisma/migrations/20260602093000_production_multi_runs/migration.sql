-- Allow one Production to link multiple in-house events and tours.
-- Keep legacy one-to-one links (Production.eventId / Production.tourId) intact.

ALTER TABLE "Event"
ADD COLUMN "productionId" TEXT;

ALTER TABLE "Tour"
ADD COLUMN "productionId" TEXT;

CREATE INDEX "Event_productionId_idx" ON "Event"("productionId");
CREATE INDEX "Tour_productionId_idx" ON "Tour"("productionId");

ALTER TABLE "Event"
ADD CONSTRAINT "Event_productionId_fkey"
FOREIGN KEY ("productionId") REFERENCES "Production"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tour"
ADD CONSTRAINT "Tour_productionId_fkey"
FOREIGN KEY ("productionId") REFERENCES "Production"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
