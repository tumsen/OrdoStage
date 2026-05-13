/**
 * Prisma `where` fragment: internal bookings that overlap `[from, toExclusive)` in time.
 * Bookings with `endDate: null` are treated as point-in-time (start only) and match if start falls in the range.
 */
export function internalBookingOverlapsRangeWhere(
  fromDate: Date | null,
  toDateExclusive: Date | null
): Record<string, unknown> | undefined {
  if (!fromDate && !toDateExclusive) return undefined;
  const from = fromDate ?? new Date(-8640000000000000);
  const toEx = toDateExclusive ?? new Date(8640000000000000);
  return {
    OR: [
      {
        AND: [{ startDate: { lt: toEx } }, { endDate: { not: null } }, { endDate: { gt: from } }],
      },
      {
        AND: [{ endDate: null }, { startDate: { gte: from } }, { startDate: { lt: toEx } }],
      },
    ],
  };
}
