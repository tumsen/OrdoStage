-- Production entity: show creation timeline (set build, rehearsals, premiere) — not events/tours

CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "planningStartDate" TIMESTAMP(3),
    "premiereDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "homeVenueId" TEXT,
    "leadPersonId" TEXT,
    "tourId" TEXT,
    "eventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Production_tourId_key" ON "Production"("tourId");
CREATE UNIQUE INDEX "Production_eventId_key" ON "Production"("eventId");
CREATE INDEX "Production_organizationId_status_idx" ON "Production"("organizationId", "status");
CREATE INDEX "Production_organizationId_premiereDate_idx" ON "Production"("organizationId", "premiereDate");

ALTER TABLE "Production" ADD CONSTRAINT "Production_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Production" ADD CONSTRAINT "Production_homeVenueId_fkey" FOREIGN KEY ("homeVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Production" ADD CONSTRAINT "Production_leadPersonId_fkey" FOREIGN KEY ("leadPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Production" ADD CONSTRAINT "Production_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Production" ADD CONSTRAINT "Production_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductionPhase" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "phaseKind" TEXT NOT NULL DEFAULT 'span',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "assigneePersonId" TEXT,
    "departmentId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPhase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionPhase_productionId_startDate_idx" ON "ProductionPhase"("productionId", "startDate");
CREATE INDEX "ProductionPhase_productionId_sortOrder_idx" ON "ProductionPhase"("productionId", "sortOrder");

ALTER TABLE "ProductionPhase" ADD CONSTRAINT "ProductionPhase_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionPhase" ADD CONSTRAINT "ProductionPhase_assigneePersonId_fkey" FOREIGN KEY ("assigneePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionPhase" ADD CONSTRAINT "ProductionPhase_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Re-link cost lines to Production (drop event/tour columns from prior migration)
ALTER TABLE "ProductionCostLine" DROP CONSTRAINT IF EXISTS "ProductionCostLine_eventId_fkey";
ALTER TABLE "ProductionCostLine" DROP CONSTRAINT IF EXISTS "ProductionCostLine_tourId_fkey";
DROP INDEX IF EXISTS "ProductionCostLine_organizationId_eventId_idx";
DROP INDEX IF EXISTS "ProductionCostLine_organizationId_tourId_idx";

ALTER TABLE "ProductionCostLine" DROP COLUMN IF EXISTS "eventId";
ALTER TABLE "ProductionCostLine" DROP COLUMN IF EXISTS "tourId";

ALTER TABLE "ProductionCostLine" ADD COLUMN "productionId" TEXT;

-- Old cost lines were tied to events/tours; drop them before requiring productionId
DELETE FROM "ProductionCostLine";

ALTER TABLE "ProductionCostLine" ALTER COLUMN "productionId" SET NOT NULL;

CREATE INDEX "ProductionCostLine_organizationId_productionId_idx" ON "ProductionCostLine"("organizationId", "productionId");

ALTER TABLE "ProductionCostLine" ADD CONSTRAINT "ProductionCostLine_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
