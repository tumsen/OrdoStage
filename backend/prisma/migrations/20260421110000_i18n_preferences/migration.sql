-- User-level preference overrides
ALTER TABLE "User"
ADD COLUMN "preferredLanguage" TEXT,
ADD COLUMN "preferredTimeFormat" TEXT,
ADD COLUMN "preferredDistanceUnit" TEXT;

-- Organization defaults used when users do not override
ALTER TABLE "Organization"
ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "defaultTimeFormat" TEXT NOT NULL DEFAULT '24h',
ADD COLUMN "defaultDistanceUnit" TEXT NOT NULL DEFAULT 'km';
