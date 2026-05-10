-- TourScheduleEvent + TourShow.dayKey; dedupe duplicate calendar days per tour

CREATE TABLE "TourScheduleEvent" (
    "id" TEXT NOT NULL,
    "tourShowId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customLabel" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourScheduleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TourScheduleEvent_tourShowId_sortOrder_idx" ON "TourScheduleEvent"("tourShowId", "sortOrder");

ALTER TABLE "TourScheduleEvent" ADD CONSTRAINT "TourScheduleEvent_tourShowId_fkey" FOREIGN KEY ("tourShowId") REFERENCES "TourShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TourShow" ADD COLUMN "dayKey" TEXT;

UPDATE "TourShow" SET "dayKey" = to_char(("date" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') WHERE "dayKey" IS NULL;

CREATE TEMP TABLE "_tour_show_losers" AS
WITH canon AS (
  SELECT DISTINCT ON ("tourId", "dayKey")
    id AS canon_id,
    "tourId",
    "dayKey"
  FROM "TourShow"
  WHERE "dayKey" IS NOT NULL
  ORDER BY "tourId", "dayKey", "createdAt" ASC
)
SELECT ts.id AS loser_id, c.canon_id
FROM "TourShow" ts
INNER JOIN canon c ON ts."tourId" = c."tourId" AND ts."dayKey" = c."dayKey"
WHERE ts.id <> c.canon_id;

DELETE FROM "TourPersonNote" n
USING "_tour_show_losers" l
WHERE n."showId" = l.loser_id
AND EXISTS (
  SELECT 1 FROM "TourPersonNote" x
  WHERE x."showId" = l.canon_id AND x."personId" = n."personId"
);

DELETE FROM "TourShowPerson" tsp
USING "_tour_show_losers" l
WHERE tsp."showId" = l.loser_id
AND EXISTS (
  SELECT 1 FROM "TourShowPerson" x
  WHERE x."showId" = l.canon_id AND x."personId" = tsp."personId"
);

UPDATE "TourShowPerson" tsp
SET "showId" = l.canon_id
FROM "_tour_show_losers" l
WHERE tsp."showId" = l.loser_id;

UPDATE "TourPersonNote" n
SET "showId" = l.canon_id
FROM "_tour_show_losers" l
WHERE n."showId" = l.loser_id;

UPDATE "TimeProject" tp
SET "tourShowId" = l.canon_id
FROM "_tour_show_losers" l
WHERE tp."tourShowId" = l.loser_id;

DELETE FROM "TourShow" ts
USING "_tour_show_losers" l
WHERE ts.id = l.loser_id;

DROP TABLE "_tour_show_losers";

ALTER TABLE "TourShow" ALTER COLUMN "dayKey" SET NOT NULL;

CREATE UNIQUE INDEX "TourShow_tourId_dayKey_key" ON "TourShow"("tourId", "dayKey");
