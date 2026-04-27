ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "ownerTeamId" TEXT;

CREATE INDEX IF NOT EXISTS "Event_ownerTeamId_idx"
  ON "Event"("ownerTeamId");

CREATE TABLE IF NOT EXISTS "EventTeam" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "isOwner" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventTeam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventTeam_eventId_teamId_key"
  ON "EventTeam"("eventId", "teamId");

CREATE INDEX IF NOT EXISTS "EventTeam_teamId_idx"
  ON "EventTeam"("teamId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Event_ownerTeamId_fkey'
  ) THEN
    ALTER TABLE "Event"
      ADD CONSTRAINT "Event_ownerTeamId_fkey"
      FOREIGN KEY ("ownerTeamId") REFERENCES "Department"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeam_eventId_fkey'
  ) THEN
    ALTER TABLE "EventTeam"
      ADD CONSTRAINT "EventTeam_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "Event"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EventTeam_teamId_fkey'
  ) THEN
    ALTER TABLE "EventTeam"
      ADD CONSTRAINT "EventTeam_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Department"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
