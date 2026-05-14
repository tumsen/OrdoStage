-- Optional company details alongside venue contact person.
ALTER TABLE "Venue" ADD COLUMN "contactCompanyName" TEXT;
ALTER TABLE "Venue" ADD COLUMN "contactCompanyVat" TEXT;
