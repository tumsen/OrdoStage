-- AlterTable
ALTER TABLE "Event" ADD COLUMN "leadPersonId" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_leadPersonId_fkey" FOREIGN KEY ("leadPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
