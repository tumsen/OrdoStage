ALTER TABLE "TimeParentCategory" ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "TimeParentCategory_organizationId_systemKey_key"
  ON "TimeParentCategory"("organizationId", "systemKey")
  WHERE "systemKey" IS NOT NULL;
