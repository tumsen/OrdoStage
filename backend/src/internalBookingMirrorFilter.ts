import type { Prisma } from "@prisma/client";

/**
 * Internal bookings auto-created from event show jobs / staffing use a title prefix so
 * `events.ts` / `staffing.ts` can upsert by `startsWith`. Those rows duplicate calendar data
 * already shown as event jobs; exclude them from schedule and booking list APIs.
 */
export const excludeMirroredEventInternalBookings: Prisma.InternalBookingWhereInput = {
  NOT: {
    OR: [
      { title: { startsWith: "[event-show-job:" } },
      { title: { startsWith: "[event-show-staffing:" } },
    ],
  },
};
