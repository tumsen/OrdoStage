-- Add department scoping to per-show jobs
ALTER TABLE "EventShowJob" ADD COLUMN "departmentId" TEXT;

-- Add department section + section lead marker to show staffing
ALTER TABLE "EventShowStaffing" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "EventShowStaffing" ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false;

-- Indexes to support staffing-by-department queries and lead lookup
CREATE INDEX "EventShowJob_departmentId_idx" ON "EventShowJob"("departmentId");
CREATE INDEX "EventShowStaffing_departmentId_idx" ON "EventShowStaffing"("departmentId");
CREATE INDEX "EventShowStaffing_showId_departmentId_isLead_idx" ON "EventShowStaffing"("showId", "departmentId", "isLead");

-- Foreign keys
ALTER TABLE "EventShowJob"
  ADD CONSTRAINT "EventShowJob_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventShowStaffing"
  ADD CONSTRAINT "EventShowStaffing_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
