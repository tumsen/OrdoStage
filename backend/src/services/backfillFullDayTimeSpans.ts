import { prisma } from "../prisma";
import { workDayDurationMinutes } from "../rules/leave/danishLeave";

const DAY_OFF_CATEGORIES = ["vacation", "sick", "holiday", "extra_vacation"] as const;

/** 7h 24m — default Danish full day at 37h/week. */
export const FULL_DAY_7H24_MINUTES = workDayDurationMinutes(37);

/** Neighbours on the 5-minute drag grid around an exact full day. */
const SNAP_TOLERANCE_MIN = 4;

/** Orgs already repaired in this process (avoid repeating on every Tid load). */
const repairedOrgs = new Set<string>();

type EntryRow = {
  id: string;
  personId: string;
  category: string;
  startsAt: Date;
  endsAt: Date;
};

function durationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}

/**
 * Normalize stored end times so full-day leave (and exact 7:24 blocks) keep a clean span.
 * - Any entry whose duration is exactly 7:24 → endsAt = startsAt + 444m
 * - Day-off entries within ±4 min of the person's daily norm → endsAt = startsAt + norm
 *   (repairs 08:00–15:25 style 5-min snap of a 7:24 day)
 */
export async function backfillExactFullDayTimeSpans(
  organizationId: string
): Promise<number> {
  const people = await prisma.person.findMany({
    where: { organizationId },
    select: { id: true, weeklyContractHours: true },
  });
  const expectedByPerson = new Map(
    people.map((p) => [p.id, workDayDurationMinutes(p.weeklyContractHours)])
  );

  const lo = FULL_DAY_7H24_MINUTES - SNAP_TOLERANCE_MIN;
  const hi = FULL_DAY_7H24_MINUTES + SNAP_TOLERANCE_MIN;

  const near724 = await prisma.$queryRaw<EntryRow[]>`
    SELECT id, "personId", category, "startsAt", "endsAt"
    FROM "TimeEntry"
    WHERE "organizationId" = ${organizationId}
      AND ROUND(EXTRACT(EPOCH FROM ("endsAt" - "startsAt")) / 60) BETWEEN ${lo} AND ${hi}
  `;

  const dayOff = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      category: { in: [...DAY_OFF_CATEGORIES] },
    },
    select: {
      id: true,
      personId: true,
      category: true,
      startsAt: true,
      endsAt: true,
    },
  });

  const byId = new Map<string, EntryRow>();
  for (const row of near724) byId.set(row.id, row);
  for (const row of dayOff) byId.set(row.id, row);

  let fixed = 0;
  for (const entry of byId.values()) {
    const actual = durationMinutes(entry.startsAt, entry.endsAt);
    if (actual <= 0) continue;

    const personNorm =
      expectedByPerson.get(entry.personId) ?? FULL_DAY_7H24_MINUTES;
    const isDayOff = (DAY_OFF_CATEGORIES as readonly string[]).includes(entry.category);

    let target: number | null = null;
    if (actual === FULL_DAY_7H24_MINUTES) {
      target = FULL_DAY_7H24_MINUTES;
    } else if (isDayOff && Math.abs(actual - personNorm) <= SNAP_TOLERANCE_MIN) {
      target = personNorm;
    }

    if (target == null) continue;

    const endsAt = new Date(entry.startsAt.getTime() + target * 60_000);
    if (endsAt.getTime() === entry.endsAt.getTime()) continue;

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: { endsAt },
    });
    fixed += 1;
  }

  return fixed;
}

/** Run at most once per org per process lifetime (safe to call from list endpoints). */
export async function ensureFullDayTimeSpansBackfilled(
  organizationId: string
): Promise<number> {
  if (repairedOrgs.has(organizationId)) return 0;
  const fixed = await backfillExactFullDayTimeSpans(organizationId);
  repairedOrgs.add(organizationId);
  return fixed;
}
