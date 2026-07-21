import { prisma } from "../prisma";

/** System parent category that holds leave/absence projects. */
export const LEAVE_PARENT_CATEGORY_SYSTEM_KEY = "absence";

export const LEAVE_AUTO_PROJECT_CATEGORIES = [
  "vacation",
  "extra_vacation",
  "sick",
  "holiday",
  "comp_time",
] as const;

export type LeaveAutoProjectCategory = (typeof LEAVE_AUTO_PROJECT_CATEGORIES)[number];

export function isVacationNoteOnlyCategory(cat: string): boolean {
  return cat === "vacation";
}

/** Vacation: no tags. Project comes from resolveEntryTimeProjectId. */
export function normalizeEntryProjectAndTags(
  category: string,
  timeProjectId: string | null,
  tagIds: string[]
): { timeProjectId: string | null; tagIds: string[] } {
  if (isVacationNoteOnlyCategory(category)) {
    return { timeProjectId, tagIds: [] };
  }
  return { timeProjectId, tagIds };
}

const LEAVE_PROJECT_DEFS: Record<
  LeaveAutoProjectCategory,
  { systemKey: string; name: string; color: string; sortOrder: number }
> = {
  vacation: {
    systemKey: "leave_vacation",
    name: "Ferie",
    color: "#34d399",
    sortOrder: -45,
  },
  extra_vacation: {
    systemKey: "leave_extra_vacation",
    name: "Feriefridage",
    color: "#2dd4bf",
    sortOrder: -44,
  },
  sick: { systemKey: "leave_sick", name: "Sygdom", color: "#fb923c", sortOrder: -43 },
  holiday: {
    systemKey: "leave_holiday",
    name: "Helligdag",
    color: "#c084fc",
    sortOrder: -42,
  },
  comp_time: {
    systemKey: "leave_comp_time",
    name: "Afspadsering",
    color: "#22d3ee",
    sortOrder: -41,
  },
};

const SYSTEM_KEY_TO_LEAVE_CATEGORY = Object.fromEntries(
  (Object.keys(LEAVE_PROJECT_DEFS) as LeaveAutoProjectCategory[]).map((cat) => [
    LEAVE_PROJECT_DEFS[cat].systemKey,
    cat,
  ])
) as Record<string, LeaveAutoProjectCategory>;

export function isLeaveAutoProjectCategory(cat: string): cat is LeaveAutoProjectCategory {
  return (LEAVE_AUTO_PROJECT_CATEGORIES as readonly string[]).includes(cat);
}

export function isLeaveSystemProjectKey(systemKey: string | null | undefined): boolean {
  return typeof systemKey === "string" && systemKey.startsWith("leave_");
}

export function isLeaveParentCategoryKey(systemKey: string | null | undefined): boolean {
  return systemKey === LEAVE_PARENT_CATEGORY_SYSTEM_KEY;
}

export function leaveCategoryFromSystemKey(
  systemKey: string | null | undefined
): LeaveAutoProjectCategory | null {
  if (!systemKey) return null;
  return SYSTEM_KEY_TO_LEAVE_CATEGORY[systemKey] ?? null;
}

export async function ensureLeaveParentCategory(organizationId: string): Promise<string> {
  const existing = await prisma.timeParentCategory.findFirst({
    where: { organizationId, systemKey: LEAVE_PARENT_CATEGORY_SYSTEM_KEY },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.timeParentCategory.create({
    data: {
      organizationId,
      name: "Fravær",
      color: "#f87171",
      systemKey: LEAVE_PARENT_CATEGORY_SYSTEM_KEY,
      sortOrder: -50,
    },
    select: { id: true },
  });
  return created.id;
}

export async function ensureLeaveTimeProject(
  organizationId: string,
  category: LeaveAutoProjectCategory
): Promise<string> {
  const def = LEAVE_PROJECT_DEFS[category];
  const parentId = await ensureLeaveParentCategory(organizationId);
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, systemKey: def.systemKey },
    select: { id: true, timeParentCategoryId: true, name: true, isArchived: true },
  });
  if (existing) {
    const patch: {
      timeParentCategoryId?: string;
      name?: string;
      color?: string;
      sortOrder?: number;
      isArchived?: boolean;
    } = {};
    if (existing.timeParentCategoryId !== parentId) patch.timeParentCategoryId = parentId;
    if (existing.name !== def.name) patch.name = def.name;
    if (existing.isArchived) patch.isArchived = false;
    if (Object.keys(patch).length) {
      await prisma.timeProject.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }

  const created = await prisma.timeProject.create({
    data: {
      organizationId,
      name: def.name,
      color: def.color,
      systemKey: def.systemKey,
      sortOrder: def.sortOrder,
      timeParentCategoryId: parentId,
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
  await ensureLeaveParentCategory(organizationId);
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
