-- System-owned time projects (e.g. leave types) are keyed per organization.
ALTER TABLE "TimeProject" ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "TimeProject_organizationId_systemKey_key"
  ON "TimeProject"("organizationId", "systemKey")
  WHERE "systemKey" IS NOT NULL;
