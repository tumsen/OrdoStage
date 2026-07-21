import { prisma } from "../prisma";
import {
  isLeaveAutoProjectCategory,
  isVacationNoteOnlyCategory,
  resolveEntryTimeProjectId,
} from "./leaveTimeProjects";

export const UNASSIGNED_HOURS_PROJECT_SYSTEM_KEY = "unassigned_hours";

/** Categories that may have null timeProjectId (vacation is note-only). */
export function categoryRequiresTimeProject(category: string): boolean {
  return !isVacationNoteOnlyCategory(category);
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
  for (const category of ["extra_vacation", "sick", "comp_time"] as const) {
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
      NOT: { category: "vacation" },
    },
    data: { timeProjectId: orphanProjectId },
  });

  // Travel / mileage claims without a project → same bucket
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
}): Promise<{ entries: number; travelClaims: number; mileageClaims: number }> {
  const [to, from] = await Promise.all([
    prisma.timeProject.findFirst({
      where: {
        id: input.toProjectId,
        organizationId: input.organizationId,
        isArchived: false,
      },
      select: { id: true },
    }),
    prisma.timeProject.findFirst({
      where: { id: input.fromProjectId, organizationId: input.organizationId },
      select: { id: true },
    }),
  ]);
  if (!from) throw new Error("SOURCE_NOT_FOUND");
  if (!to) throw new Error("TARGET_NOT_FOUND");
  if (input.fromProjectId === input.toProjectId) throw new Error("SAME_PROJECT");

  const [entries, travelClaims, mileageClaims] = await prisma.$transaction([
    prisma.timeEntry.updateMany({
      where: { organizationId: input.organizationId, timeProjectId: input.fromProjectId },
      data: { timeProjectId: input.toProjectId },
    }),
    prisma.timeTravelClaim.updateMany({
      where: { organizationId: input.organizationId, timeProjectId: input.fromProjectId },
      data: { timeProjectId: input.toProjectId },
    }),
    prisma.timeMileageClaim.updateMany({
      where: { organizationId: input.organizationId, timeProjectId: input.fromProjectId },
      data: { timeProjectId: input.toProjectId },
    }),
  ]);

  return {
    entries: entries.count,
    travelClaims: travelClaims.count,
    mileageClaims: mileageClaims.count,
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
