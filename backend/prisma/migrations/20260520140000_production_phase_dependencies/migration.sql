-- Phase dependencies for Gantt finish-to-start links

ALTER TABLE "ProductionPhase" ADD COLUMN "dependsOnPhaseId" TEXT;

CREATE INDEX "ProductionPhase_dependsOnPhaseId_idx" ON "ProductionPhase"("dependsOnPhaseId");

ALTER TABLE "ProductionPhase" ADD CONSTRAINT "ProductionPhase_dependsOnPhaseId_fkey" FOREIGN KEY ("dependsOnPhaseId") REFERENCES "ProductionPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
