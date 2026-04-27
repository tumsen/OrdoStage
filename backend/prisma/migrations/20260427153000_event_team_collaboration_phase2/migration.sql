CREATE TABLE IF NOT EXISTS "EventTeamNote" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "fromTeamId" TEXT NOT NULL,
  "toTeamId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTeamNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventTeamDocument" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'other',
  "filename" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTeamDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventTeamNote_eventId_createdAt_idx"
  ON "EventTeamNote"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventTeamNote_fromTeamId_idx"
  ON "EventTeamNote"("fromTeamId");
CREATE INDEX IF NOT EXISTS "EventTeamNote_toTeamId_idx"
  ON "EventTeamNote"("toTeamId");

CREATE INDEX IF NOT EXISTS "EventTeamDocument_eventId_teamId_createdAt_idx"
  ON "EventTeamDocument"("eventId", "teamId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeamNote_eventId_fkey'
  ) THEN
    ALTER TABLE "EventTeamNote"
      ADD CONSTRAINT "EventTeamNote_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeamNote_fromTeamId_fkey'
  ) THEN
    ALTER TABLE "EventTeamNote"
      ADD CONSTRAINT "EventTeamNote_fromTeamId_fkey"
      FOREIGN KEY ("fromTeamId") REFERENCES "EventTeam"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeamNote_toTeamId_fkey'
  ) THEN
    ALTER TABLE "EventTeamNote"
      ADD CONSTRAINT "EventTeamNote_toTeamId_fkey"
      FOREIGN KEY ("toTeamId") REFERENCES "EventTeam"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeamDocument_eventId_fkey'
  ) THEN
    ALTER TABLE "EventTeamDocument"
      ADD CONSTRAINT "EventTeamDocument_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeamDocument_teamId_fkey'
  ) THEN
    ALTER TABLE "EventTeamDocument"
      ADD CONSTRAINT "EventTeamDocument_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "EventTeam"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
