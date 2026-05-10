-- CreateTable
CREATE TABLE "TimeTravelClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'DK',
    "allowanceType" TEXT NOT NULL DEFAULT 'standard',
    "rateYear" INTEGER NOT NULL DEFAULT 2026,
    "foodRateCents" INTEGER NOT NULL DEFAULT 62500,
    "lodgingRateCents" INTEGER NOT NULL DEFAULT 26800,
    "breakfastProvided" BOOLEAN NOT NULL DEFAULT false,
    "lunchProvided" BOOLEAN NOT NULL DEFAULT false,
    "dinnerProvided" BOOLEAN NOT NULL DEFAULT false,
    "lodgingAllowance" BOOLEAN NOT NULL DEFAULT false,
    "lodgingCovered" BOOLEAN NOT NULL DEFAULT false,
    "foodCoveredByReceipts" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT,
    "eventShowJobId" TEXT,
    "timeProjectId" TEXT,
    "notes" TEXT,
    "foodAmountCents" INTEGER NOT NULL DEFAULT 0,
    "lodgingAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeTravelClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeTravelClaim_organizationId_personId_startsAt_idx" ON "TimeTravelClaim"("organizationId", "personId", "startsAt");

-- CreateIndex
CREATE INDEX "TimeTravelClaim_eventId_idx" ON "TimeTravelClaim"("eventId");

-- CreateIndex
CREATE INDEX "TimeTravelClaim_eventShowJobId_idx" ON "TimeTravelClaim"("eventShowJobId");

-- CreateIndex
CREATE INDEX "TimeTravelClaim_timeProjectId_idx" ON "TimeTravelClaim"("timeProjectId");

-- CreateIndex
CREATE INDEX "TimesheetApproval_organizationId_personId_status_idx" ON "TimesheetApproval"("organizationId", "personId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetApproval_organizationId_personId_periodStart_periodEnd_key" ON "TimesheetApproval"("organizationId", "personId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "TimeTravelClaim" ADD CONSTRAINT "TimeTravelClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeTravelClaim" ADD CONSTRAINT "TimeTravelClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetApproval" ADD CONSTRAINT "TimesheetApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetApproval" ADD CONSTRAINT "TimesheetApproval_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
