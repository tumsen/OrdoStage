-- Headcount per job + ordered assignment slots.
ALTER TABLE "EventShowJob" ADD COLUMN "peopleNeeded" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventShowJobPerson" ADD COLUMN "slotIndex" INTEGER NOT NULL DEFAULT 0;

-- Backfill slot order from createdAt; headcount at least assignment count.
WITH ordered AS (
  SELECT
    id,
    "jobId",
    ROW_NUMBER() OVER (PARTITION BY "jobId" ORDER BY "createdAt" ASC) - 1 AS idx
  FROM "EventShowJobPerson"
)
UPDATE "EventShowJobPerson" AS p
SET "slotIndex" = ordered.idx
FROM ordered
WHERE p.id = ordered.id;

UPDATE "EventShowJob" AS j
SET "peopleNeeded" = GREATEST(
  1,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM "EventShowJobPerson" p WHERE p."jobId" = j.id
  ), 0)
);

CREATE UNIQUE INDEX "EventShowJobPerson_jobId_slotIndex_key" ON "EventShowJobPerson"("jobId", "slotIndex");
