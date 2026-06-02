-- Show-level document library for productions.

CREATE TABLE "ProductionDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionDocument_productionId_createdAt_idx" ON "ProductionDocument"("productionId", "createdAt");
CREATE INDEX "ProductionDocument_organizationId_idx" ON "ProductionDocument"("organizationId");

ALTER TABLE "ProductionDocument" ADD CONSTRAINT "ProductionDocument_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionDocument" ADD CONSTRAINT "ProductionDocument_productionId_fkey"
FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;
