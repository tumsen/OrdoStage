-- Production cost lines for event/tour budget tracking in production planner
CREATE TABLE "ProductionCostLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "tourId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT NOT NULL,
    "plannedCents" INTEGER NOT NULL DEFAULT 0,
    "actualCents" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionCostLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionCostLine_organizationId_eventId_idx" ON "ProductionCostLine"("organizationId", "eventId");
CREATE INDEX "ProductionCostLine_organizationId_tourId_idx" ON "ProductionCostLine"("organizationId", "tourId");
CREATE INDEX "ProductionCostLine_organizationId_startDate_idx" ON "ProductionCostLine"("organizationId", "startDate");

ALTER TABLE "ProductionCostLine" ADD CONSTRAINT "ProductionCostLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionCostLine" ADD CONSTRAINT "ProductionCostLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionCostLine" ADD CONSTRAINT "ProductionCostLine_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
