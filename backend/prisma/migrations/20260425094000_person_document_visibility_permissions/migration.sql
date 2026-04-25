-- CreateTable
CREATE TABLE "PersonDocumentAllowedTeam" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonDocumentAllowedTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonDocumentAllowedPerson" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "allowedPersonId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonDocumentAllowedPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonDocumentAllowedTeam_documentId_teamId_key"
ON "PersonDocumentAllowedTeam"("documentId", "teamId");

-- CreateIndex
CREATE INDEX "PersonDocumentAllowedTeam_teamId_idx"
ON "PersonDocumentAllowedTeam"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonDocumentAllowedPerson_documentId_allowedPersonId_key"
ON "PersonDocumentAllowedPerson"("documentId", "allowedPersonId");

-- CreateIndex
CREATE INDEX "PersonDocumentAllowedPerson_allowedPersonId_idx"
ON "PersonDocumentAllowedPerson"("allowedPersonId");

-- AddForeignKey
ALTER TABLE "PersonDocumentAllowedTeam"
ADD CONSTRAINT "PersonDocumentAllowedTeam_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "PersonDocument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocumentAllowedTeam"
ADD CONSTRAINT "PersonDocumentAllowedTeam_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Department"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocumentAllowedPerson"
ADD CONSTRAINT "PersonDocumentAllowedPerson_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "PersonDocument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDocumentAllowedPerson"
ADD CONSTRAINT "PersonDocumentAllowedPerson_allowedPersonId_fkey"
FOREIGN KEY ("allowedPersonId") REFERENCES "Person"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
