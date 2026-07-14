import { prisma } from "../prisma";

export const LEAVE_AUTO_PROJECT_CATEGORIES = [
  "extra_vacation",
  "sick",
  "comp_time",
] as const;

export type LeaveAutoProjectCategory = (typeof LEAVE_AUTO_PROJECT_CATEGORIES)[number];

export function isVacationNoteOnlyCategory(cat: string): boolean {
  return cat === "vacation";
}

/** Vacation: note only. Other leave types may use system projects. */
export function normalizeEntryProjectAndTags(
  category: string,
  timeProjectId: string | null,
  tagIds: string[]
): { timeProjectId: string | null; tagIds: string[] } {
  if (isVacationNoteOnlyCategory(category)) {
    return { timeProjectId: null, tagIds: [] };
  }
  return { timeProjectId, tagIds };
}

const LEAVE_PROJECT_DEFS: Record<
  LeaveAutoProjectCategory,
  { systemKey: string; name: string; color: string; sortOrder: number }
> = {
  extra_vacation: {
    systemKey: "leave_extra_vacation",
    name: "Feriefridage",
    color: "#2dd4bf",
    sortOrder: -39,
  },
  sick: { systemKey: "leave_sick", name: "Sygdom", color: "#fb923c", sortOrder: -38 },
  comp_time: {
    systemKey: "leave_comp_time",
    name: "Afspadsering",
    color: "#22d3ee",
    sortOrder: -37,
  },
};

export function isLeaveAutoProjectCategory(cat: string): cat is LeaveAutoProjectCategory {
  return (LEAVE_AUTO_PROJECT_CATEGORIES as readonly string[]).includes(cat);
}

export function isLeaveSystemProjectKey(systemKey: string | null | undefined): boolean {
  return typeof systemKey === "string" && systemKey.startsWith("leave_");
}

export async function ensureLeaveTimeProject(
  organizationId: string,
  category: LeaveAutoProjectCategory
): Promise<string> {
  const def = LEAVE_PROJECT_DEFS[category];
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, systemKey: def.systemKey },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.timeProject.create({
    data: {
      organizationId,
      name: def.name,
      color: def.color,
      systemKey: def.systemKey,
      sortOrder: def.sortOrder,
      isArchived: false,
    },
    select: { id: true },
  });
  return created.id;
}

export async function resolveLeaveTimeProjectId(
  organizationId: string,
  category: string
): Promise<string | null> {
  if (!isLeaveAutoProjectCategory(category)) return null;
  return ensureLeaveTimeProject(organizationId, category);
}

export async function ensureAllLeaveTimeProjects(organizationId: string) {
  for (const category of LEAVE_AUTO_PROJECT_CATEGORIES) {
    await ensureLeaveTimeProject(organizationId, category);
  }
}

/** Point existing leave entries at the correct system project. */
export async function backfillLeaveEntryProjects(organizationId: string) {
  for (const category of LEAVE_AUTO_PROJECT_CATEGORIES) {
    const projectId = await ensureLeaveTimeProject(organizationId, category);
    await prisma.timeEntry.updateMany({
      where: {
        organizationId,
        category,
        NOT: { timeProjectId: projectId },
      },
      data: { timeProjectId: projectId },
    });
  }
}

export async function resolveEntryTimeProjectId(
  organizationId: string,
  category: string,
  requested: string | null | undefined
): Promise<string | null> {
  const leaveProjectId = await resolveLeaveTimeProjectId(organizationId, category);
  if (leaveProjectId) return leaveProjectId;
  return requested ?? null;
}
