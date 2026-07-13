import { prisma } from "../prisma";
import { wallClockInstantFromDateIsoAndHHMM } from "../clientWallClock";
import type { TimeCategory } from "../types";
import {
  expandTimerlyTimeSlots,
  parseTimerlyCsv,
  type ParsedTimerlyEntry,
} from "./parseTimerlyCsv";

export type ImportProjectMapping = {
  externalName: string;
  action: "map" | "create" | "skip";
  timeProjectId?: string;
  newProjectName?: string;
  category?: TimeCategory;
};

export type ImportTagMapping = {
  externalName: string;
  action: "map" | "create" | "skip";
  timeTagId?: string;
  newTagName?: string;
};

export type ImportPersonMapping = {
  externalName: string;
  personId: string;
};

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function computeEntryTimes(
  dateIso: string,
  startHhmm: string,
  endHhmm: string,
  loggedHours: number
): { startsAt: Date; endsAt: Date } | null {
  const startsAt = wallClockInstantFromDateIsoAndHHMM(`${dateIso}T12:00:00.000Z`, startHhmm);
  if (!startsAt) return null;

  let endsAt: Date | null;
  if (startHhmm === endHhmm && loggedHours > 0) {
    endsAt = new Date(startsAt.getTime() + Math.round(loggedHours * 60 * 60_000));
  } else {
    endsAt = wallClockInstantFromDateIsoAndHHMM(`${dateIso}T12:00:00.000Z`, endHhmm);
    if (endsAt && hhmmToMinutes(endHhmm) <= hhmmToMinutes(startHhmm) && endHhmm !== "00:00") {
      endsAt = new Date(endsAt.getTime() + 86_400_000);
    } else if (endsAt && endHhmm === "00:00" && hhmmToMinutes(startHhmm) > 0) {
      endsAt = new Date(endsAt.getTime() + 86_400_000);
    }
  }
  if (!endsAt || endsAt <= startsAt) {
    if (loggedHours > 0) {
      endsAt = new Date(startsAt.getTime() + Math.round(loggedHours * 60 * 60_000));
    } else return null;
  }
  return { startsAt, endsAt };
}

function summarizeExternalValues(entries: ParsedTimerlyEntry[]) {
  const people = new Map<string, number>();
  const projects = new Map<string, number>();
  const tags = new Map<string, number>();
  let minDate = "";
  let maxDate = "";

  for (const e of entries) {
    people.set(e.personName, (people.get(e.personName) ?? 0) + 1);
    if (e.project) projects.set(e.project, (projects.get(e.project) ?? 0) + 1);
    for (const t of e.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    if (!minDate || e.dateIso < minDate) minDate = e.dateIso;
    if (!maxDate || e.dateIso > maxDate) maxDate = e.dateIso;
  }

  return {
    externalPeople: [...people.entries()]
      .map(([name, entryCount]) => ({ name, entryCount }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    externalProjects: [...projects.entries()]
      .map(([name, entryCount]) => ({ name, entryCount }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    externalTags: [...tags.entries()]
      .map(([name, entryCount]) => ({ name, entryCount }))
      .sort((a, b) => b.entryCount - a.entryCount),
    dateRange: minDate ? { from: minDate, to: maxDate } : null,
  };
}

export async function previewTimerlyImport(
  organizationId: string,
  csvText: string,
  fileName?: string
) {
  const parsed = parseTimerlyCsv(csvText);
  const expanded = parsed.entries.flatMap(expandTimerlyTimeSlots);
  const summary = summarizeExternalValues(expanded);

  const [people, projects, tags] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeProject.findMany({
      where: { organizationId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeTag.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const suggestPerson = (name: string) => {
    const lower = name.toLowerCase();
    return (
      people.find((p) => p.name.toLowerCase() === lower)?.id ??
      people.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
        ?.id ??
      null
    );
  };

  const suggestProject = (name: string) => {
    const lower = name.toLowerCase();
    return (
      projects.find((p) => p.name.toLowerCase() === lower)?.id ??
      projects.find((p) => p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase()))
        ?.id ??
      null
    );
  };

  const suggestTag = (name: string) => {
    const lower = name.toLowerCase();
    return tags.find((t) => t.name.toLowerCase() === lower)?.id ?? null;
  };

  return {
    source: parsed.source,
    fileName: fileName ?? null,
    delimiter: parsed.delimiter,
    entryCount: expanded.length,
    skippedSummaryRows: parsed.skippedSummaryRows,
    invalidRowCount: parsed.invalidRows.length,
    invalidRows: parsed.invalidRows.slice(0, 20),
    ...summary,
    externalPeople: summary.externalPeople.map((p) => ({
      ...p,
      suggestedPersonId: suggestPerson(p.name),
    })),
    externalProjects: summary.externalProjects.map((p) => ({
      ...p,
      suggestedProjectId: suggestProject(p.name),
    })),
    externalTags: summary.externalTags.map((t) => ({
      ...t,
      suggestedTagId: suggestTag(t.name),
    })),
    sampleEntries: expanded.slice(0, 8).map((e) => ({
      rowIndex: e.rowIndex,
      project: e.project,
      dateIso: e.dateIso,
      personName: e.personName,
      loggedHours: e.loggedHours,
      tags: e.tags,
      note: e.note,
      timeRange: e.timeRanges[0] ?? null,
    })),
    orgPeople: people,
    orgProjects: projects,
    orgTags: tags,
  };
}

async function resolveProjectId(
  organizationId: string,
  mapping: ImportProjectMapping | undefined,
  projectCache: Map<string, string>
): Promise<{ projectId: string | null; category?: TimeCategory; skip?: boolean }> {
  if (!mapping) return { projectId: null };
  if (mapping.action === "skip") return { projectId: null, skip: true, category: mapping.category };

  const key = mapping.externalName;
  if (projectCache.has(key)) {
    return { projectId: projectCache.get(key)!, category: mapping.category };
  }

  if (mapping.action === "map") {
    if (!mapping.timeProjectId) {
      throw new Error(`Project "${mapping.externalName}": choose a target project for "map"`);
    }
    const exists = await prisma.timeProject.findFirst({
      where: { id: mapping.timeProjectId, organizationId, isArchived: false },
      select: { id: true },
    });
    if (!exists) {
      throw new Error(`Project "${mapping.externalName}": target project not found`);
    }
    projectCache.set(key, mapping.timeProjectId);
    return { projectId: mapping.timeProjectId, category: mapping.category };
  }

  if (mapping.action === "create") {
    const name = mapping.newProjectName?.trim() || mapping.externalName;
    const existing = await prisma.timeProject.findFirst({
      where: { organizationId, name, isArchived: false },
      select: { id: true },
    });
    if (existing) {
      projectCache.set(key, existing.id);
      return { projectId: existing.id, category: mapping.category };
    }
    const maxSort = await prisma.timeProject.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    const created = await prisma.timeProject.create({
      data: {
        organizationId,
        name,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    projectCache.set(key, created.id);
    return { projectId: created.id, category: mapping.category };
  }

  return { projectId: null, category: mapping.category };
}

async function buildProjectResolutionMap(
  organizationId: string,
  projectMappings: ImportProjectMapping[]
) {
  const cache = new Map<string, string>();
  const out = new Map<string, { projectId: string | null; category?: TimeCategory; skip?: boolean }>();
  for (const mapping of projectMappings) {
    out.set(mapping.externalName, await resolveProjectId(organizationId, mapping, cache));
  }
  return out;
}

async function buildTagIdLookup(organizationId: string, tagMappings: ImportTagMapping[]) {
  const out = new Map<string, string | null>();
  for (const mapping of tagMappings) {
    if (mapping.action === "skip") {
      out.set(mapping.externalName, null);
      continue;
    }
    if (mapping.action === "map") {
      if (!mapping.timeTagId) {
        throw new Error(`Tag "${mapping.externalName}": choose a target tag for "map"`);
      }
      out.set(mapping.externalName, mapping.timeTagId);
      continue;
    }
    if (mapping.action === "create") {
      const name = mapping.newTagName?.trim() || mapping.externalName;
      let row = await prisma.timeTag.findFirst({
        where: { organizationId, name },
        select: { id: true },
      });
      if (!row) {
        const maxSort = await prisma.timeTag.aggregate({
          where: { organizationId },
          _max: { sortOrder: true },
        });
        row = await prisma.timeTag.create({
          data: { organizationId, name, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
          select: { id: true },
        });
      }
      out.set(mapping.externalName, row.id);
    }
  }
  return out;
}

async function resolveTagIds(
  organizationId: string,
  externalTags: string[],
  tagMappings: ImportTagMapping[],
  tagCache: Map<string, string | null>
): Promise<string[]> {
  const mapByName = new Map(tagMappings.map((m) => [m.externalName, m]));
  const ids: string[] = [];

  for (const ext of externalTags) {
    if (tagCache.has(ext)) {
      const cached = tagCache.get(ext);
      if (cached) ids.push(cached);
      continue;
    }
    const mapping = mapByName.get(ext);
    if (!mapping || mapping.action === "skip") {
      tagCache.set(ext, null);
      continue;
    }
    if (mapping.action === "map" && mapping.timeTagId) {
      tagCache.set(ext, mapping.timeTagId);
      ids.push(mapping.timeTagId);
      continue;
    }
    if (mapping.action === "create") {
      const name = mapping.newTagName?.trim() || ext;
      let row = await prisma.timeTag.findFirst({
        where: { organizationId, name },
        select: { id: true },
      });
      if (!row) {
        const maxSort = await prisma.timeTag.aggregate({
          where: { organizationId },
          _max: { sortOrder: true },
        });
        row = await prisma.timeTag.create({
          data: { organizationId, name, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
          select: { id: true },
        });
      }
      tagCache.set(ext, row.id);
      ids.push(row.id);
    }
  }

  return ids;
}

export async function runTimerlyImport(input: {
  organizationId: string;
  userId: string;
  csvText: string;
  fileName?: string;
  personMappings: ImportPersonMapping[];
  projectMappings: ImportProjectMapping[];
  tagMappings: ImportTagMapping[];
  batchId?: string;
  offset?: number;
  limit?: number;
}) {
  const parsed = parseTimerlyCsv(input.csvText);
  const slots = parsed.entries.flatMap(expandTimerlyTimeSlots);
  const offset = input.offset ?? 0;
  const limit = Math.min(input.limit ?? 200, 500);
  const slice = slots.slice(offset, offset + limit);

  let batchId = input.batchId;
  if (batchId) {
    const existing = await prisma.timeImportBatch.findFirst({
      where: { id: batchId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Import batch not found");
    }
  } else {
    const batch = await prisma.timeImportBatch.create({
      data: {
        organizationId: input.organizationId,
        source: "timerly",
        fileName: input.fileName ?? null,
        createdByUserId: input.userId,
      },
    });
    batchId = batch.id;
  }

  const personByExternal = new Map(input.personMappings.map((m) => [m.externalName, m.personId]));
  const projectResolution =
    offset === 0
      ? await buildProjectResolutionMap(input.organizationId, input.projectMappings)
      : null;
  const tagIdLookup =
    offset === 0 ? await buildTagIdLookup(input.organizationId, input.tagMappings) : null;

  // Re-use cached maps on continuation chunks via DB isn't needed — projects/tags already exist.
  const projectRes =
    projectResolution ??
    (await buildProjectResolutionMap(input.organizationId, input.projectMappings));
  const tagLookup =
    tagIdLookup ?? (await buildTagIdLookup(input.organizationId, input.tagMappings));

  let imported = 0;
  let skipped = 0;
  const errors: { rowIndex: number; reason: string }[] = [];
  const creates: {
    organizationId: string;
    userId: string;
    personId: string;
    startsAt: Date;
    endsAt: Date;
    kind: string;
    category: string;
    timeProjectId: string | null;
    note: string | null;
    importBatchId: string;
    importExternalProject: string | null;
    importExternalTags: string | null;
    tagIds: string[];
  }[] = [];

  for (const slot of slice) {
    const personId = personByExternal.get(slot.personName);
    if (!personId) {
      skipped++;
      errors.push({ rowIndex: slot.rowIndex, reason: `No person mapping for "${slot.personName}"` });
      continue;
    }

    const proj = projectRes.get(slot.project);
    if (proj?.skip) {
      skipped++;
      continue;
    }

    const range = slot.timeRanges[0];
    if (!range) {
      skipped++;
      continue;
    }

    const times = computeEntryTimes(slot.dateIso, range.start, range.end, slot.loggedHours);
    if (!times) {
      errors.push({ rowIndex: slot.rowIndex, reason: "Could not compute start/end time" });
      skipped++;
      continue;
    }

    const tagIds = slot.tags
      .map((t) => tagLookup.get(t))
      .filter((id): id is string => Boolean(id));

    creates.push({
      organizationId: input.organizationId,
      userId: input.userId,
      personId,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      kind: "custom",
      category: proj?.category ?? "work",
      timeProjectId: proj?.projectId ?? null,
      note: slot.note || null,
      importBatchId: batchId,
      importExternalProject: slot.project || null,
      importExternalTags: slot.tags.length ? slot.tags.join(", ") : null,
      tagIds,
    });
  }

  if (creates.length > 0) {
    await prisma.$transaction(
      creates.map((row) =>
        prisma.timeEntry.create({
          data: {
            organizationId: row.organizationId,
            userId: row.userId,
            personId: row.personId,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            kind: row.kind,
            category: row.category,
            timeProjectId: row.timeProjectId,
            note: row.note,
            isLocked: false,
            importBatchId: row.importBatchId,
            importExternalProject: row.importExternalProject,
            importExternalTags: row.importExternalTags,
            tagLinks: row.tagIds.length
              ? { createMany: { data: row.tagIds.map((timeTagId) => ({ timeTagId })) } }
              : undefined,
          },
        })
      )
    );
    imported = creates.length;
  }

  const nextOffset = offset + limit;
  const done = nextOffset >= slots.length;

  if (done) {
    const entryCount = await prisma.timeEntry.count({
      where: { importBatchId: batchId, organizationId: input.organizationId },
    });
    await prisma.timeImportBatch.update({
      where: { id: batchId },
      data: { entryCount },
    });
  }

  return {
    batchId,
    imported,
    skipped,
    done,
    nextOffset: done ? slots.length : nextOffset,
    totalSlots: slots.length,
    errors: errors.slice(0, 50),
    invalidRows: parsed.invalidRows.slice(0, 20),
  };
}

export async function remapImportedEntries(input: {
  organizationId: string;
  batchId?: string;
  projectMappings?: ImportProjectMapping[];
  tagMappings?: ImportTagMapping[];
}) {
  let projectsUpdated = 0;
  let tagsUpdated = 0;

  if (input.projectMappings?.length) {
    for (const mapping of input.projectMappings) {
      if (mapping.action === "skip") {
        await prisma.timeEntry.updateMany({
          where: {
            organizationId: input.organizationId,
            importExternalProject: mapping.externalName,
            ...(input.batchId ? { importBatchId: input.batchId } : {}),
          },
          data: { timeProjectId: null },
        });
        continue;
      }
      const { projectId } = await resolveProjectId(input.organizationId, mapping, new Map());
      if (!projectId) continue;
      const result = await prisma.timeEntry.updateMany({
        where: {
          organizationId: input.organizationId,
          importExternalProject: mapping.externalName,
          ...(input.batchId ? { importBatchId: input.batchId } : {}),
        },
        data: {
          timeProjectId: projectId,
          ...(mapping.category ? { category: mapping.category } : {}),
        },
      });
      projectsUpdated += result.count;
    }
  }

  if (input.tagMappings?.length) {
    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId: input.organizationId,
        importExternalTags: { not: null },
        ...(input.batchId ? { importBatchId: input.batchId } : {}),
      },
      select: { id: true, importExternalTags: true },
    });

    const tagCache = new Map<string, string | null>();
    for (const entry of entries) {
      const externalTags = (entry.importExternalTags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const tagIds = await resolveTagIds(
        input.organizationId,
        externalTags,
        input.tagMappings,
        tagCache
      );
      await prisma.timeEntryTag.deleteMany({ where: { timeEntryId: entry.id } });
      if (tagIds.length) {
        await prisma.timeEntryTag.createMany({
          data: tagIds.map((timeTagId) => ({ timeEntryId: entry.id, timeTagId })),
        });
      }
      tagsUpdated++;
    }
  }

  return { projectsUpdated, tagsUpdated };
}

export async function listImportBatches(organizationId: string) {
  return prisma.timeImportBatch.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      source: true,
      fileName: true,
      entryCount: true,
      createdAt: true,
    },
  });
}

export async function listImportExternals(organizationId: string, batchId?: string) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      importExternalProject: { not: null },
      ...(batchId ? { importBatchId: batchId } : {}),
    },
    select: { importExternalProject: true, importExternalTags: true },
  });

  const projects = new Map<string, number>();
  const tags = new Map<string, number>();
  for (const e of entries) {
    const proj = e.importExternalProject ?? "";
    if (proj) projects.set(proj, (projects.get(proj) ?? 0) + 1);
    for (const t of (e.importExternalTags ?? "").split(",").map((x: string) => x.trim()).filter(Boolean)) {
      tags.set(t, (tags.get(t) ?? 0) + 1);
    }
  }

  return {
    externalProjects: [...projects.entries()]
      .map(([name, entryCount]) => ({ name, entryCount }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    externalTags: [...tags.entries()]
      .map(([name, entryCount]) => ({ name, entryCount }))
      .sort((a, b) => b.entryCount - a.entryCount),
  };
}
