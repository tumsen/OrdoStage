-- CreateTable
CREATE TABLE "TimeMileageClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "fromPlace" TEXT NOT NULL,
    "toPlace" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DK',
    "vehicleType" TEXT NOT NULL DEFAULT 'car',
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "rateYear" INTEGER NOT NULL DEFAULT 2026,
    "rateCentsPerKmHigh" INTEGER NOT NULL DEFAULT 394,
    "rateCentsPerKmLow" INTEGER NOT NULL DEFAULT 228,
    "bicycleRateCentsPerKm" INTEGER NOT NULL DEFAULT 64,
    "highRateKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowRateKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryReductionAgreement" BOOLEAN NOT NULL DEFAULT false,
    "receivesBIncome" BOOLEAN NOT NULL DEFAULT false,
    "timeProjectId" TEXT,
    "eventId" TEXT,
    "notes" TEXT,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeMileageClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeMileageClaim_organizationId_personId_tripDate_idx" ON "TimeMileageClaim"("organizationId", "personId", "tripDate");

-- CreateIndex
CREATE INDEX "TimeMileageClaim_eventId_idx" ON "TimeMileageClaim"("eventId");

-- CreateIndex
CREATE INDEX "TimeMileageClaim_timeProjectId_idx" ON "TimeMileageClaim"("timeProjectId");

-- AddForeignKey
ALTER TABLE "TimeMileageClaim" ADD CONSTRAINT "TimeMileageClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeMileageClaim" ADD CONSTRAINT "TimeMileageClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
