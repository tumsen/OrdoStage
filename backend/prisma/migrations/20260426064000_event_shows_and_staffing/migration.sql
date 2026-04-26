CREATE TABLE IF NOT EXISTS "EventShow" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "showDate" TIMESTAMP(3) NOT NULL,
  "showTime" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "venueId" TEXT NOT NULL,
  "technicalNotes" TEXT,
  "fohNotes" TEXT,
  "ticketNotes" TEXT,
  "hospitalityNotes" TEXT,
  "teamResponsibleId" TEXT,
  "getInTime" TEXT,
  "getInDurationMinutes" INTEGER,
  "getOutTime" TEXT,
  "getOutDurationMinutes" INTEGER,
  "rehearsalTime" TEXT,
  "rehearsalDurationMinutes" INTEGER,
  "soundcheckTime" TEXT,
  "soundcheckDurationMinutes" INTEGER,
  "breakTime" TEXT,
  "breakDurationMinutes" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventShow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventShowStaffing" (
  "id" TEXT NOT NULL,
  "showId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "role" TEXT,
  "meetingTime" TEXT,
  "meetingDurationMinutes" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventShowStaffing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventShow_eventId_showDate_idx" ON "EventShow"("eventId", "showDate");
CREATE INDEX IF NOT EXISTS "EventShow_venueId_showDate_idx" ON "EventShow"("venueId", "showDate");
CREATE INDEX IF NOT EXISTS "EventShowStaffing_personId_idx" ON "EventShowStaffing"("personId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventShowStaffing_showId_personId_key" ON "EventShowStaffing"("showId", "personId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventShow_eventId_fkey'
  ) THEN
    ALTER TABLE "EventShow"
      ADD CONSTRAINT "EventShow_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventShow_venueId_fkey'
  ) THEN
    ALTER TABLE "EventShow"
      ADD CONSTRAINT "EventShow_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventShow_teamResponsibleId_fkey'
  ) THEN
    ALTER TABLE "EventShow"
      ADD CONSTRAINT "EventShow_teamResponsibleId_fkey"
      FOREIGN KEY ("teamResponsibleId") REFERENCES "Person"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventShowStaffing_showId_fkey'
  ) THEN
    ALTER TABLE "EventShowStaffing"
      ADD CONSTRAINT "EventShowStaffing_showId_fkey"
      FOREIGN KEY ("showId") REFERENCES "EventShow"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventShowStaffing_personId_fkey'
  ) THEN
    ALTER TABLE "EventShowStaffing"
      ADD CONSTRAINT "EventShowStaffing_personId_fkey"
      FOREIGN KEY ("personId") REFERENCES "Person"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
