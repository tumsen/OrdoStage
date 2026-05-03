-- Per-show staffing confirmation flags keyed by department (team) id.
ALTER TABLE "EventShow" ADD COLUMN IF NOT EXISTS "staffingOkByDepartment" JSONB;
