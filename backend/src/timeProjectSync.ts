import { prisma } from "./prisma";

/** One TimeProject per tour (not per tour day). */
export async function ensureTourTimeProject(
  organizationId: string,
  tour: { id: string; name: string }
): Promise<string> {
  const tourTitle = tour.name.trim() || "Untitled tour";
  const tourProjectName = `Tour · ${tourTitle}`;
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, tourId: tour.id, tourShowId: null },
    select: { id: true, name: true },
  });
  if (existing) {
    if (existing.name !== tourProjectName) {
      await prisma.timeProject.update({
        where: { id: existing.id },
        data: { name: tourProjectName },
      });
    }
    return existing.id;
  }
  const created = await prisma.timeProject.create({
    data: {
      organizationId,
      name: tourProjectName,
      tourId: tour.id,
      tourShowId: null,
      sortOrder: 0,
    },
  });
  return created.id;
}

/** Retire per-day tour projects created by older sync logic. */
export async function archiveLegacyTourShowProjects(
  organizationId: string,
  tourId: string,
  tourProjectId: string
): Promise<void> {
  const legacy = await prisma.timeProject.findMany({
    where: {
      organizationId,
      tourId,
      tourShowId: { not: null },
      isArchived: false,
    },
    select: { id: true },
  });
  if (legacy.length === 0) return;
  const legacyIds = legacy.map((p) => p.id);
  await prisma.timeEntry.updateMany({
    where: { timeProjectId: { in: legacyIds } },
    data: { timeProjectId: tourProjectId },
  });
  await prisma.timeProject.updateMany({
    where: { id: { in: legacyIds } },
    data: { isArchived: true },
  });
}

export async function resolveTourTimeProjectId(
  organizationId: string,
  tourId: string
): Promise<string | null> {
  const tourProject = await prisma.timeProject.findFirst({
    where: { organizationId, tourId, tourShowId: null },
    select: { id: true },
  });
  return tourProject?.id ?? null;
}

export async function loadTourProjectIdByTourId(
  organizationId: string,
  tourIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(tourIds)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.timeProject.findMany({
    where: { organizationId, tourId: { in: unique }, tourShowId: null },
    select: { id: true, tourId: true },
  });
  return new Map(rows.map((r) => [r.tourId!, r.id]));
}
