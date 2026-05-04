-- CreateTable
CREATE TABLE "TimeTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "eventShowJobId" TEXT,
    "eventId" TEXT,
    "timeProjectId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntryTag" (
    "timeEntryId" TEXT NOT NULL,
    "timeTagId" TEXT NOT NULL,

    CONSTRAINT "TimeEntryTag_pkey" PRIMARY KEY ("timeEntryId","timeTagId")
);

-- AddForeignKey
ALTER TABLE "TimeTag" ADD CONSTRAINT "TimeTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeProject" ADD CONSTRAINT "TimeProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeProject" ADD CONSTRAINT "TimeProject_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_eventShowJobId_fkey" FOREIGN KEY ("eventShowJobId") REFERENCES "EventShowJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_timeProjectId_fkey" FOREIGN KEY ("timeProjectId") REFERENCES "TimeProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryTag" ADD CONSTRAINT "TimeEntryTag_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryTag" ADD CONSTRAINT "TimeEntryTag_timeTagId_fkey" FOREIGN KEY ("timeTagId") REFERENCES "TimeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "TimeTag_organizationId_sortOrder_idx" ON "TimeTag"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "TimeProject_organizationId_sortOrder_idx" ON "TimeProject"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "TimeProject_eventId_idx" ON "TimeProject"("eventId");

-- CreateIndex
CREATE INDEX "TimeEntry_organizationId_personId_startsAt_idx" ON "TimeEntry"("organizationId", "personId", "startsAt");

-- CreateIndex
CREATE INDEX "TimeEntry_personId_startsAt_idx" ON "TimeEntry"("personId", "startsAt");

-- CreateIndex
CREATE INDEX "TimeEntry_eventShowJobId_idx" ON "TimeEntry"("eventShowJobId");

-- CreateIndex
CREATE INDEX "TimeEntryTag_timeTagId_idx" ON "TimeEntryTag"("timeTagId");
