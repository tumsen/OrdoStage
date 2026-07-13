-- CreateTable
CREATE TABLE "OrganizationLeavePolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'DK',
    "vacationYearStartMonth" INTEGER NOT NULL DEFAULT 9,
    "vacationYearStartDay" INTEGER NOT NULL DEFAULT 1,
    "defaultVacationDaysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "defaultExtraVacationDays" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "defaultWeeklyContractHours" DOUBLE PRECISION NOT NULL DEFAULT 37,
    "hoursPerVacationDayMode" TEXT NOT NULL DEFAULT 'contract_fifth',
    "hoursPerVacationDayFixed" DOUBLE PRECISION,
    "compTimeFromOvertimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLeaveProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveCountryCode" TEXT NOT NULL DEFAULT 'DK',
    "useOrgDefaults" BOOLEAN NOT NULL DEFAULT true,
    "weeklyContractHours" DOUBLE PRECISION,
    "monthlyContractHours" DOUBLE PRECISION,
    "annualContractHours" DOUBLE PRECISION,
    "vacationDaysPerYear" DOUBLE PRECISION,
    "extraVacationDaysPerYear" DOUBLE PRECISION,
    "sickLeaveStatus" TEXT NOT NULL DEFAULT 'none',
    "sickLeaveNote" TEXT,
    "organizationLeavePolicyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonLeaveProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "vacationYearKey" TEXT NOT NULL,
    "balanceType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "vacationYearKey" TEXT NOT NULL,
    "balanceType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationLeavePolicy_organizationId_key" ON "OrganizationLeavePolicy"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLeaveProfile_personId_key" ON "PersonLeaveProfile"("personId");

-- CreateIndex
CREATE INDEX "PersonLeaveProfile_organizationId_idx" ON "PersonLeaveProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_personId_vacationYearKey_balanceType_key" ON "LeaveBalance"("personId", "vacationYearKey", "balanceType");

-- CreateIndex
CREATE INDEX "LeaveBalance_organizationId_personId_vacationYearKey_idx" ON "LeaveBalance"("organizationId", "personId", "vacationYearKey");

-- CreateIndex
CREATE INDEX "LeaveTransaction_organizationId_personId_vacationYearKey_idx" ON "LeaveTransaction"("organizationId", "personId", "vacationYearKey");

-- CreateIndex
CREATE INDEX "LeaveTransaction_timeEntryId_idx" ON "LeaveTransaction"("timeEntryId");

-- CreateIndex
CREATE INDEX "LeaveTransaction_organizationId_personId_source_periodStart__idx" ON "LeaveTransaction"("organizationId", "personId", "source", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "OrganizationLeavePolicy" ADD CONSTRAINT "OrganizationLeavePolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLeaveProfile" ADD CONSTRAINT "PersonLeaveProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLeaveProfile" ADD CONSTRAINT "PersonLeaveProfile_organizationLeavePolicyId_fkey" FOREIGN KEY ("organizationLeavePolicyId") REFERENCES "OrganizationLeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
