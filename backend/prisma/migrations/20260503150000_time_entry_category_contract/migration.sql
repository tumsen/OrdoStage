-- Time entry category (work | vacation | sick | holiday) for time reports
ALTER TABLE "TimeEntry" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'work';
CREATE INDEX "TimeEntry_organizationId_category_idx" ON "TimeEntry"("organizationId", "category");

-- Weekly contract hours on Person (used for overtime calculation in reports)
ALTER TABLE "Person" ADD COLUMN "weeklyContractHours" DOUBLE PRECISION;
