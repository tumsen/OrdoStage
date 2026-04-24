-- Permission group (RoleDefinition) assigned to a person; drives app access for linked user email.
ALTER TABLE "Person" ADD COLUMN "permissionGroupId" TEXT;

ALTER TABLE "Person"
ADD CONSTRAINT "Person_permissionGroupId_fkey"
FOREIGN KEY ("permissionGroupId")
REFERENCES "RoleDefinition"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "Person_permissionGroupId_idx" ON "Person"("permissionGroupId");
CREATE INDEX "Person_org_email_idx" ON "Person"("organizationId", "email");

-- Any role that is not owner/admin is a normal (editable) template, not a protected system role.
UPDATE "RoleDefinition" SET "isSystem" = false
WHERE "slug" IN ('manager', 'member');

-- Backfill: set person's permission group from a matching org user's orgRole, when emails align.
UPDATE "Person" p
SET "permissionGroupId" = rd."id"
FROM "User" u
JOIN "RoleDefinition" rd
  ON rd."organizationId" = u."organizationId" AND rd."slug" = u."orgRole"
WHERE p."organizationId" = u."organizationId"
  AND p."email" IS NOT NULL
  AND TRIM(p."email") <> ''
  AND LOWER(TRIM(p."email")) = LOWER(TRIM(u."email"))
  AND u."organizationId" IS NOT NULL
  AND p."permissionGroupId" IS NULL;
