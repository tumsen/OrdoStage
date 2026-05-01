-- Per-show confirmation; seed from parent event then rollup stays in sync via app logic.
ALTER TABLE "EventShow" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';

UPDATE "EventShow" AS s
SET "status" = e."status"
FROM "Event" AS e
WHERE s."eventId" = e."id";
