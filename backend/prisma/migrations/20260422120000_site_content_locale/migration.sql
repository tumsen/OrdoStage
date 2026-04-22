-- SiteContent: support per-locale rows (translations for Owner Admin)

CREATE TABLE "SiteContent_new" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_new_pkey" PRIMARY KEY ("key","locale")
);

INSERT INTO "SiteContent_new" ("key", "locale", "value", "updatedAt")
SELECT "key", 'en', "value", "updatedAt" FROM "SiteContent";

DROP TABLE "SiteContent";

ALTER TABLE "SiteContent_new" RENAME TO "SiteContent";
