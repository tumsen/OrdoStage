import { prisma } from "../prisma";
import {
  isLeaveAutoProjectCategory,
  isLeaveSystemProjectKey,
  leaveCategoryFromSystemKey,
  resolveEntryTimeProjectId,
  type LeaveAutoProjectCategory,
} from "./leaveTimeProjects";

export const UNASSIGNED_HOURS_PROJECT_SYSTEM_KEY = "unassigned_hours";

/** All tracked work/leave entries should have a project (vacation uses leave_vacation). */
export function categoryRequiresTimeProject(category: string): boolean {
  return category !== "comp_settlement_earned" && category !== "comp_settlement_used";
}

export async function ensureUnassignedHoursProject(organizationId: string): Promise<string> {
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, systemKey: UNASSIGNED_HOURS_PROJECT_SYSTEM_KEY },
    select: { id: true, isArchived: true },
  });
  if (existing) {
    if (existing.isArchived) {
      await prisma.timeProject.update({
        where: { id: existing.id },
        data: { isArchived: false },
      });
    }
    return existing.id;
  }
  const maxSort = await prisma.timeProject.aggregate({
    where: { organizationId },
    _max: { sortOrder: true },
  });
  const created = await prisma.timeProject.create({
    data: {
      organizationId,
      name: "Ukendt projekt",
      systemKey: UNASSIGNED_HOURS_PROJECT_SYSTEM_KEY,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      isArchived: false,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Assign leave system projects where needed, and put remaining orphan entries
 * (work / travel / etc. with null project) onto "Ukendt projekt".
 */
export async function backfillMissingTimeProjects(organizationId: string): Promise<{
  leaveAssigned: number;
  orphanAssigned: number;
}> {
  let leaveAssigned = 0;
  for (const category of [
    "vacation",
    "extra_vacation",
    "sick",
    "holiday",
    "comp_time",
  ] as const) {
    if (!isLeaveAutoProjectCategory(category)) continue;
    const projectId = await resolveEntryTimeProjectId(organizationId, category, null);
    if (!projectId) continue;
    const result = await prisma.timeEntry.updateMany({
      where: { organizationId, category, timeProjectId: null },
      data: { timeProjectId: projectId },
    });
    leaveAssigned += result.count;
  }

  const orphanProjectId = await ensureUnassignedHoursProject(organizationId);
  const orphan = await prisma.timeEntry.updateMany({
    where: {
      organizationId,
      timeProjectId: null,
      NOT: {
        category: {
          in: [
            "vacation",
            "extra_vacation",
            "sick",
            "holiday",
            "comp_time",
            "comp_settlement_earned",
            "comp_settlement_used",
          ],
        },
      },
    },
    data: { timeProjectId: orphanProjectId },
  });

  await prisma.timeTravelClaim.updateMany({
    where: { organizationId, timeProjectId: null },
    data: { timeProjectId: orphanProjectId },
  });
  await prisma.timeMileageClaim.updateMany({
    where: { organizationId, timeProjectId: null },
    data: { timeProjectId: orphanProjectId },
  });

  return { leaveAssigned, orphanAssigned: orphan.count };
}

export async function reassignProjectReferences(input: {
  organizationId: string;
  fromProjectId: string;
  toProjectId: string;
  /** Called after each time entry is moved (and category possibly changed). */
  onEntryMoved?: (entry: {
    id: string;
    organizationId: string;
    personId: string;
    startsAt: Date;
    endsAt: Date;
    category: string;
  }) => Promise<void>;
}): Promise<{
  entries: number;
  travelClaims: number;
  mileageClaims: number;
  categoryUpdates: number;
}> {
  const [to, from] = await Promise.all([
    prisma.timeProject.findFirst({
      where: {
        id: input.toProjectId,
        organizationId: input.organizationId,
        isArchived: false,
      },
      select: { id: true, systemKey: true },
    }),
    prisma.timeProject.findFirst({
      where: { id: input.fromProjectId, organizationId: input.organizationId },
      select: { id: true, systemKey: true },
    }),
  ]);
  if (!from) throw new Error("SOURCE_NOT_FOUND");
  if (!to) throw new Error("TARGET_NOT_FOUND");
  if (input.fromProjectId === input.toProjectId) throw new Error("SAME_PROJECT");

  const toLeaveCategory = leaveCategoryFromSystemKey(to.systemKey);
  const fromIsLeave = isLeaveSystemProjectKey(from.systemKey);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      timeProjectId: input.fromProjectId,
      category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
    },
    select: {
      id: true,
      organizationId: true,
      personId: true,
      startsAt: true,
      endsAt: true,
      category: true,
    },
  });

  let categoryUpdates = 0;
  for (const entry of entries) {
    let nextCategory = entry.category;
    if (toLeaveCategory) {
      nextCategory = toLeaveCategory;
    } else if (fromIsLeave && isLeaveAutoProjectCategory(entry.category)) {
      nextCategory = "work";
    }
    const categoryChanged = nextCategory !== entry.category;
    if (categoryChanged) categoryUpdates += 1;

    await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        timeProjectId: input.toProjectId,
        category: nextCategory,
      },
    });

    if (nextCategory === "vacation") {
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: entry.id } });
    }

    if (input.onEntryMoved) {
      await input.onEntryMoved({
        ...entry,
        category: nextCategory,
      });
    }
  }

  // Travel/mileage do not belong on leave projects — park on Ukendt when moving into leave.
  let travelClaims = 0;
  let mileageClaims = 0;
  if (toLeaveCategory) {
    const unassignedId = await ensureUnassignedHoursProject(input.organizationId);
    const [travel, mileage] = await prisma.$transaction([
      prisma.timeTravelClaim.updateMany({
        where: {
          organizationId: input.organizationId,
          timeProjectId: input.fromProjectId,
        },
        data: { timeProjectId: unassignedId },
      }),
      prisma.timeMileageClaim.updateMany({
        where: {
          organizationId: input.organizationId,
          timeProjectId: input.fromProjectId,
        },
        data: { timeProjectId: unassignedId },
      }),
    ]);
    travelClaims = travel.count;
    mileageClaims = mileage.count;
  } else {
    const [travel, mileage] = await prisma.$transaction([
      prisma.timeTravelClaim.updateMany({
        where: {
          organizationId: input.organizationId,
          timeProjectId: input.fromProjectId,
        },
        data: { timeProjectId: input.toProjectId },
      }),
      prisma.timeMileageClaim.updateMany({
        where: {
          organizationId: input.organizationId,
          timeProjectId: input.fromProjectId,
        },
        data: { timeProjectId: input.toProjectId },
      }),
    ]);
    travelClaims = travel.count;
    mileageClaims = mileage.count;
  }

  return {
    entries: entries.length,
    travelClaims,
    mileageClaims,
    categoryUpdates,
  };
}

export async function countProjectUsages(
  organizationId: string,
  projectId: string
): Promise<number> {
  const [entries, travel, mileage] = await Promise.all([
    prisma.timeEntry.count({ where: { organizationId, timeProjectId: projectId } }),
    prisma.timeTravelClaim.count({ where: { organizationId, timeProjectId: projectId } }),
    prisma.timeMileageClaim.count({ where: { organizationId, timeProjectId: projectId } }),
  ]);
  return entries + travel + mileage;
}

export type { LeaveAutoProjectCategory };
