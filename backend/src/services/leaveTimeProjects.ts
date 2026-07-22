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

const LEAVE_PROJECT_NAME_ALIASES: Record<LeaveAutoProjectCategory, readonly string[]> = {
  vacation: ["ferie", "vacation", "feriedag", "feriedage"],
  extra_vacation: ["feriefridage", "feriefridag", "extra vacation", "extra vacation day", "extra vacation days"],
  sick: ["sygdom", "sygedag", "sygedage", "sick", "sick leave"],
  holiday: ["helligdag", "helligdage", "holiday", "public holiday"],
  comp_time: ["afspadsering", "afsp", "comp time", "compensatory time"],
};

/** Match Fravær project names (Ferie / Sygdom / …) even without systemKey. */
export function leaveCategoryFromProjectName(name: string | null | undefined): LeaveAutoProjectCategory | null {
  if (!name?.trim()) return null;
  const n = name.trim().toLowerCase();
  for (const category of LEAVE_AUTO_PROJECT_CATEGORIES) {
    if (LEAVE_PROJECT_DEFS[category].name.toLowerCase() === n) return category;
    if (LEAVE_PROJECT_NAME_ALIASES[category].includes(n)) return category;
  }
  return null;
}

export function leaveCategoryFromSystemKey(
  systemKey: string | null | undefined
): LeaveAutoProjectCategory | null {
  if (!systemKey) return null;
  return SYSTEM_KEY_TO_LEAVE_CATEGORY[systemKey] ?? null;
}

/** When an entry is assigned to Ferie / Sygdom / Feriefridage / …, use that leave category. */
export async function leaveCategoryForProjectId(
  organizationId: string,
  projectId: string | null | undefined
): Promise<LeaveAutoProjectCategory | null> {
  if (!projectId) return null;
  const project = await prisma.timeProject.findFirst({
    where: { id: projectId, organizationId },
    select: { systemKey: true, name: true },
  });
  if (!project) return null;
  return (
    leaveCategoryFromSystemKey(project.systemKey) ?? leaveCategoryFromProjectName(project.name)
  );
}

/**
 * Resolve a mapped/selected project to the canonical leave system project when it is
 * (or is named like) Ferie / Sygdom / Feriefridage / …
 */
export async function resolveCanonicalLeaveProject(
  organizationId: string,
  project: { id: string; systemKey?: string | null; name?: string | null }
): Promise<{ projectId: string; category: LeaveAutoProjectCategory } | null> {
  const category =
    leaveCategoryFromSystemKey(project.systemKey) ?? leaveCategoryFromProjectName(project.name);
  if (!category) return null;
  const projectId = await ensureLeaveTimeProject(organizationId, category);
  return { projectId, category };
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
  await sanitizeLeaveParentProjects(organizationId);
}

/** True when this parent category id is the Fravær (absence) system category. */
export async function isLeaveParentCategoryId(
  organizationId: string,
  parentCategoryId: string | null | undefined
): Promise<boolean> {
  if (!parentCategoryId) return false;
  const row = await prisma.timeParentCategory.findFirst({
    where: { id: parentCategoryId, organizationId },
    select: { systemKey: true },
  });
  return isLeaveParentCategoryKey(row?.systemKey);
}

/**
 * Fravær may only contain the five leave_* system projects.
 * Name-matched duplicates are merged into the system project; other projects are unlinked.
 */
export async function sanitizeLeaveParentProjects(organizationId: string): Promise<void> {
  const parentId = await ensureLeaveParentCategory(organizationId);
  const underFravaer = await prisma.timeProject.findMany({
    where: {
      organizationId,
      timeParentCategoryId: parentId,
      NOT: { systemKey: { startsWith: "leave_" } },
    },
    select: { id: true, name: true, systemKey: true },
  });

  for (const project of underFravaer) {
    const canonical = await resolveCanonicalLeaveProject(organizationId, project);
    if (canonical && canonical.projectId !== project.id) {
      await prisma.timeEntry.updateMany({
        where: {
          organizationId,
          timeProjectId: project.id,
          category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
        },
        data: { timeProjectId: canonical.projectId, category: canonical.category },
      });
      if (canonical.category === "vacation") {
        const ids = (
          await prisma.timeEntry.findMany({
            where: { organizationId, timeProjectId: canonical.projectId, category: "vacation" },
            select: { id: true },
            take: 5000,
          })
        ).map((e) => e.id);
        if (ids.length) {
          await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: { in: ids } } });
        }
      }
      const stillUsed = await prisma.timeEntry.count({
        where: { organizationId, timeProjectId: project.id },
      });
      if (stillUsed === 0) {
        await prisma.timeProject.update({
          where: { id: project.id },
          data: { timeParentCategoryId: null, isArchived: true },
        });
      } else {
        await prisma.timeProject.update({
          where: { id: project.id },
          data: { timeParentCategoryId: null },
        });
      }
      continue;
    }
    await prisma.timeProject.update({
      where: { id: project.id },
      data: { timeParentCategoryId: null },
    });
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

/**
 * Fix entries that sit on Ferie / Sygdom / Feriefridage (system or name-matched)
 * but still have category "work" (common after Timerly import).
 * Returns ids of entries whose category changed (for leave-ledger sync).
 */
export async function backfillLeaveEntryCategories(organizationId: string): Promise<string[]> {
  await ensureAllLeaveTimeProjects(organizationId);
  const changedIds: string[] = [];

  // 1) Canonical leave_* projects: force matching category
  for (const category of LEAVE_AUTO_PROJECT_CATEGORIES) {
    const projectId = await ensureLeaveTimeProject(organizationId, category);
    const wrong = await prisma.timeEntry.findMany({
      where: {
        organizationId,
        timeProjectId: projectId,
        NOT: { category },
        category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
      },
      select: { id: true },
    });
    if (wrong.length === 0) continue;
    await prisma.timeEntry.updateMany({
      where: { id: { in: wrong.map((r) => r.id) } },
      data: { category },
    });
    if (category === "vacation") {
      await prisma.timeEntryTag.deleteMany({
        where: { timeEntryId: { in: wrong.map((r) => r.id) } },
      });
    }
    changedIds.push(...wrong.map((r) => r.id));
  }

  // 2) Non-system projects named like leave: move entries → system project + category
  const projects = await prisma.timeProject.findMany({
    where: {
      organizationId,
      NOT: { systemKey: { startsWith: "leave_" } },
    },
    select: { id: true, name: true, systemKey: true },
  });

  for (const project of projects) {
    const canonical = await resolveCanonicalLeaveProject(organizationId, project);
    if (!canonical) continue;
    if (canonical.projectId === project.id) continue;

    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId,
        timeProjectId: project.id,
        category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
      },
      select: { id: true },
    });
    if (entries.length === 0) continue;

    const ids = entries.map((e) => e.id);
    await prisma.timeEntry.updateMany({
      where: { id: { in: ids } },
      data: { timeProjectId: canonical.projectId, category: canonical.category },
    });
    if (canonical.category === "vacation") {
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: { in: ids } } });
    }
    changedIds.push(...ids);
  }

  return [...new Set(changedIds)];
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
