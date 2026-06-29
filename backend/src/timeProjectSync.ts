import { prisma } from "./prisma";

/** One TimeProject per event (not per performance/show). */
export async function ensureEventTimeProject(
  organizationId: string,
  event: { id: string; title: string; timeParentCategoryId?: string | null }
): Promise<string> {
  const title = event.title.trim() || "Untitled event";
  const parentCategoryId = event.timeParentCategoryId ?? null;
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, eventId: event.id, eventShowId: null },
    select: { id: true, name: true, timeParentCategoryId: true },
  });
  if (existing) {
    const updates: { name?: string; timeParentCategoryId?: string | null } = {};
    if (existing.name !== title) updates.name = title;
    if (existing.timeParentCategoryId !== parentCategoryId) {
      updates.timeParentCategoryId = parentCategoryId;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.timeProject.update({
        where: { id: existing.id },
        data: updates,
      });
    }
    return existing.id;
  }
  const created = await prisma.timeProject.create({
    data: {
      organizationId,
      name: title,
      eventId: event.id,
      eventShowId: null,
      timeParentCategoryId: parentCategoryId,
      sortOrder: 0,
    },
  });
  return created.id;
}

/** Retire per-show event projects created by older sync logic. */
export async function archiveLegacyEventShowProjects(
  organizationId: string,
  eventId: string,
  eventProjectId: string
): Promise<void> {
  const legacy = await prisma.timeProject.findMany({
    where: {
      organizationId,
      eventId,
      eventShowId: { not: null },
      isArchived: false,
    },
    select: { id: true },
  });
  if (legacy.length === 0) return;
  const legacyIds = legacy.map((p) => p.id);
  await prisma.timeEntry.updateMany({
    where: { timeProjectId: { in: legacyIds } },
    data: { timeProjectId: eventProjectId },
  });
  await prisma.timeProject.updateMany({
    where: { id: { in: legacyIds } },
    data: { isArchived: true },
  });
}

export async function resolveEventTimeProjectId(
  organizationId: string,
  eventId: string
): Promise<string | null> {
  const eventProject = await prisma.timeProject.findFirst({
    where: { organizationId, eventId, eventShowId: null },
    select: { id: true },
  });
  return eventProject?.id ?? null;
}

export async function loadEventProjectIdByEventId(
  organizationId: string,
  eventIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(eventIds)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.timeProject.findMany({
    where: { organizationId, eventId: { in: unique }, eventShowId: null },
    select: { id: true, eventId: true },
  });
  return new Map(rows.map((r) => [r.eventId!, r.id]));
}

/** One TimeProject per tour (not per tour day). */
export async function ensureTourTimeProject(
  organizationId: string,
  tour: { id: string; name: string; timeParentCategoryId?: string | null }
): Promise<string> {
  const tourTitle = tour.name.trim() || "Untitled tour";
  const tourProjectName = `Tour · ${tourTitle}`;
  const parentCategoryId = tour.timeParentCategoryId ?? null;
  const existing = await prisma.timeProject.findFirst({
    where: { organizationId, tourId: tour.id, tourShowId: null },
    select: { id: true, name: true, timeParentCategoryId: true },
  });
  if (existing) {
    const updates: { name?: string; timeParentCategoryId?: string | null } = {};
    if (existing.name !== tourProjectName) updates.name = tourProjectName;
    if (existing.timeParentCategoryId !== parentCategoryId) {
      updates.timeParentCategoryId = parentCategoryId;
    }
    if (Object.keys(updates).length > 0) {
      await prisma.timeProject.update({
        where: { id: existing.id },
        data: updates,
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
      timeParentCategoryId: parentCategoryId,
      sortOrder: 0,
    },
  });
  return created.id;
}

export async function syncEventTimeProjectParentCategory(
  organizationId: string,
  eventId: string,
  timeParentCategoryId: string | null
): Promise<void> {
  await prisma.timeProject.updateMany({
    where: { organizationId, eventId, eventShowId: null },
    data: { timeParentCategoryId },
  });
}

export async function syncTourTimeProjectParentCategory(
  organizationId: string,
  tourId: string,
  timeParentCategoryId: string | null
): Promise<void> {
  await prisma.timeProject.updateMany({
    where: { organizationId, tourId, tourShowId: null },
    data: { timeParentCategoryId },
  });
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
