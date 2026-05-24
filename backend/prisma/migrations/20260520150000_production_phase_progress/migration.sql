-- Progress percent on production phases for Gantt bar fill

ALTER TABLE "ProductionPhase" ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0;
