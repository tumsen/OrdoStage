-- Per-show ticket inventory / sales tracking (manual counts).
ALTER TABLE "EventShow" ADD COLUMN "ticketsOnSale" INTEGER;
ALTER TABLE "EventShow" ADD COLUMN "soldTickets" INTEGER;
ALTER TABLE "EventShow" ADD COLUMN "soldTicketsRecordedAt" TIMESTAMP(3);
