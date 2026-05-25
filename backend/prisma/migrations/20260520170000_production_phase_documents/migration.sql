-- CreateTable
CREATE TABLE "ProductionPhaseDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionPhaseDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionPhaseDocument_phaseId_createdAt_idx" ON "ProductionPhaseDocument"("phaseId", "createdAt");
CREATE INDEX "ProductionPhaseDocument_organizationId_idx" ON "ProductionPhaseDocument"("organizationId");

ALTER TABLE "ProductionPhaseDocument" ADD CONSTRAINT "ProductionPhaseDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionPhaseDocument" ADD CONSTRAINT "ProductionPhaseDocument_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProductionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
