-- Multiple assignees per event show job.
CREATE TABLE "EventShowJobPerson" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventShowJobPerson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventShowJobPerson_jobId_personId_key" ON "EventShowJobPerson"("jobId", "personId");
CREATE INDEX "EventShowJobPerson_personId_idx" ON "EventShowJobPerson"("personId");

ALTER TABLE "EventShowJobPerson" ADD CONSTRAINT "EventShowJobPerson_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EventShowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventShowJobPerson" ADD CONSTRAINT "EventShowJobPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EventShowJobPerson" ("id", "jobId", "personId", "createdAt")
SELECT
    'c' || substr(md5(random()::text || j."id" || j."personId"), 1, 24),
    j."id",
    j."personId",
    NOW()
FROM "EventShowJob" j
WHERE j."personId" IS NOT NULL;
