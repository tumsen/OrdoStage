-- Wall-clock IANA zone for ICS generation (public feeds have no browser headers).
ALTER TABLE "Calendar" ADD COLUMN "icsWallClockZone" TEXT NOT NULL DEFAULT 'UTC';
