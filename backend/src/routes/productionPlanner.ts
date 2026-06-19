import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { prisma } from "../prisma";
import {
  contentDispositionHeader,
  sanitizeStoredFilename,
} from "../lib/contentDisposition";
import { canAction, canView } from "../requestRole";
import {
  AssignProductionTeamSchema,
  CreateProductionCostLineSchema,
  CreateProductionPhaseSchema,
  CreateProductionSchema,
  UpdateProductionCostLineSchema,
  UpdateProductionPhaseSchema,
  UpdateProductionSchema,
  type Production,
  type ProductionCostLine,
  type ProductionDocument,
  type ProductionPerson,
  type ProductionPhase,
  type ProductionTeam,
} from "../types";
import {
  buildProductionPlannerRow,
  defaultPhasesForPremiere,
  mergePlannerTotals,
} from "../lib/productionPlannerBuild";
import { validatePhaseDates, type SchedulePhaseInput } from "../lib/productionSchedule";
import { parseIncomingDateTime, parseIncomingDateTimeOrNull } from "../parseIncomingDateTime";
import { ensureOrphanToursHaveProductions } from "../lib/ensureTourProductionShows";

const productionPlannerRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

productionPlannerRouter.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  // Core show management must stay available even when planner visuals are paused.
  if (c.req.path.startsWith("/api/productions")) {
    await next();
    return;
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { productionPlannerEnabled: true },
  });
  if (!org?.productionPlannerEnabled) {
    return c.json(
      {
        error: {
          message: "Production planner is disabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  await next();
});

const productionInclude = {
  homeVenue: { select: { name: true } },
  leadPerson: { select: { name: true } },
  tour: { select: { id: true, name: true } },
  event: { select: { id: true, title: true } },
  tours: {
    select: { id: true, name: true, shows: { select: { date: true }, orderBy: { date: "asc" as const } } },
    orderBy: { createdAt: "asc" as const },
  },
  events: { select: { id: true, title: true, startDate: true }, orderBy: { createdAt: "asc" as const } },
  people: {
    orderBy: { createdAt: "asc" as const },
    include: {
      person: {
        include: {
          teamMemberships: { include: { department: true } },
        },
      },
    },
  },
  teams: {
    orderBy: { createdAt: "asc" as const },
    include: { department: true },
  },
  phases: {
    orderBy: [{ sortOrder: "asc" as const }, { startDate: "asc" as const }],
    include: {
      assigneePerson: { select: { name: true } },
      department: { select: { name: true } },
      dependsOnPhase: { select: { id: true, title: true } },
    },
  },
};

function serializeAssignmentPerson(person: {
  id: string;
  name: string;
  role: string | null;
  affiliation: string;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressZip: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressCountry: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoData?: Uint8Array | null;
  photoUpdatedAt?: Date | null;
  departmentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  teamMemberships?: Array<{
    departmentId: string;
    role: string | null;
    department: { id: string; name: string; color: string; createdAt: Date };
  }>;
}) {
  const memberships = person.teamMemberships ?? [];
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    affiliation: person.affiliation as "internal" | "external",
    email: person.email,
    phone: person.phone,
    addressStreet: person.addressStreet,
    addressNumber: person.addressNumber,
    addressZip: person.addressZip,
    addressCity: person.addressCity,
    addressState: person.addressState,
    addressCountry: person.addressCountry,
    emergencyContactName: person.emergencyContactName,
    emergencyContactPhone: person.emergencyContactPhone,
    hasPhoto: Boolean(person.photoData),
    photoUpdatedAt: person.photoUpdatedAt ? person.photoUpdatedAt.toISOString() : null,
    departmentId: person.departmentId,
    teamIds: memberships.map((m) => m.departmentId),
    teams: memberships.map((m) => ({
      id: m.department.id,
      name: m.department.name,
      color: m.department.color,
      createdAt: m.department.createdAt.toISOString(),
    })),
    teamMemberships: memberships.map((m) => ({
      teamId: m.departmentId,
      role: m.role ?? null,
    })),
    isActive: person.isActive,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function serializeProductionPerson(row: {
  id: string;
  productionId: string;
  personId: string;
  role: string | null;
  person: Parameters<typeof serializeAssignmentPerson>[0];
}): ProductionPerson {
  return {
    id: row.id,
    productionId: row.productionId,
    personId: row.personId,
    role: row.role,
    person: serializeAssignmentPerson(row.person),
  };
}

function serializeProductionTeam(row: {
  id: string;
  productionId: string;
  departmentId: string;
  department: { id: string; name: string; color: string; createdAt: Date };
}): ProductionTeam {
  return {
    id: row.id,
    productionId: row.productionId,
    teamId: row.departmentId,
    team: {
      id: row.department.id,
      name: row.department.name,
      color: row.department.color,
      createdAt: row.department.createdAt.toISOString(),
    },
  };
}

function rosterFromProduction(production: {
  id: string;
  people: Array<{
    id: string;
    productionId: string;
    personId: string;
    role: string | null;
    person: Parameters<typeof serializeAssignmentPerson>[0];
  }>;
  teams: Array<{
    id: string;
    productionId: string;
    departmentId: string;
    department: { id: string; name: string; color: string; createdAt: Date };
  }>;
}) {
  return {
    people: production.people.map(serializeProductionPerson),
    teams: production.teams.map(serializeProductionTeam),
  };
}

function serializePhase(row: {
  id: string;
  productionId: string;
  title: string;
  category: string;
  phaseKind: string;
  status: string;
  progressPercent: number;
  startDate: Date;
  endDate: Date | null;
  assigneePersonId: string | null;
  departmentId: string | null;
  dependsOnPhaseId: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assigneePerson?: { name: string } | null;
  department?: { name: string } | null;
  dependsOnPhase?: { id: string; title: string } | null;
}): ProductionPhase {
  return {
    id: row.id,
    productionId: row.productionId,
    title: row.title,
    category: row.category as ProductionPhase["category"],
    phaseKind: row.phaseKind as ProductionPhase["phaseKind"],
    status: row.status as ProductionPhase["status"],
    progressPercent: row.progressPercent,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    assigneePersonId: row.assigneePersonId,
    assigneeName: row.assigneePerson?.name ?? null,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    dependsOnPhaseId: row.dependsOnPhaseId,
    dependsOnPhaseTitle: row.dependsOnPhase?.title ?? null,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProduction(row: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: string;
  planningStartDate: Date | null;
  premiereDate: Date | null;
  closedAt: Date | null;
  homeVenueId: string | null;
  leadPersonId: string | null;
  tourId: string | null;
  eventId: string | null;
  notes: string | null;
  actorCount: number | null;
  techCount: number | null;
  durationMinutes: number | null;
  stageWidth: string | null;
  stageDepth: string | null;
  stageHeight: string | null;
  actorNames: string[];
  techNames: string[];
  stageSize: string | null;
  technicalSpecs: string | null;
  techRiderPdfName: string | null;
  createdAt: Date;
  updatedAt: Date;
  homeVenue?: { name: string } | null;
  leadPerson?: { name: string } | null;
  tour?: { id: string; name: string } | null;
  event?: { id: string; title: string; startDate?: Date | null } | null;
  tours?: Array<{ id: string; name: string; shows?: Array<{ date: Date }> }>;
  events?: Array<{ id: string; title: string; startDate: Date | null }>;
}): Production {
  const linkedTours = row.tours ?? (row.tour ? [{ ...row.tour, shows: [] }] : []);
  const linkedEvents = row.events ?? (row.event ? [{ ...row.event, startDate: row.event.startDate ?? null }] : []);
  const linkedTourDates = linkedTours.flatMap((tour) => (tour.shows ?? []).map((show) => show.date.toISOString()));
  const linkedEventDates = linkedEvents
    .map((event) => event.startDate?.toISOString() ?? null)
    .filter((value): value is string => Boolean(value));
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    status: row.status as Production["status"],
    planningStartDate: row.planningStartDate ? row.planningStartDate.toISOString() : null,
    premiereDate: row.premiereDate ? row.premiereDate.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    homeVenueId: row.homeVenueId,
    homeVenueName: row.homeVenue?.name ?? null,
    leadPersonId: row.leadPersonId,
    leadPersonName: row.leadPerson?.name ?? null,
    tourId: row.tourId,
    tourName: row.tour?.name ?? null,
    eventId: row.eventId,
    eventTitle: row.event?.title ?? null,
    linkedTourIds: linkedTours.map((tour) => tour.id),
    linkedTourNames: linkedTours.map((tour) => tour.name),
    linkedTourDates,
    linkedEventIds: linkedEvents.map((event) => event.id),
    linkedEventTitles: linkedEvents.map((event) => event.title),
    linkedEventDates,
    notes: row.notes,
    actorCount: row.actorCount,
    techCount: row.techCount,
    durationMinutes: row.durationMinutes,
    stageWidth: row.stageWidth,
    stageDepth: row.stageDepth,
    stageHeight: row.stageHeight,
    actorNames: row.actorNames ?? [],
    techNames: row.techNames ?? [],
    stageSize: row.stageSize,
    technicalSpecs: row.technicalSpecs,
    techRiderPdfName: row.techRiderPdfName ?? null,
    hasTechRiderPdf: Boolean(row.techRiderPdfName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sanitizeNameList(names: string[] | undefined) {
  if (!names) return undefined;
  return names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .slice(0, 100);
}

function serializeCostLine(row: {
  id: string;
  organizationId: string;
  productionId: string;
  category: string;
  label: string;
  plannedCents: number;
  actualCents: number | null;
  currencyCode: string;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): ProductionCostLine {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productionId: row.productionId,
    category: row.category as ProductionCostLine["category"],
    label: row.label,
    plannedCents: row.plannedCents,
    actualCents: row.actualCents,
    currencyCode: row.currencyCode,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProductionDocument(row: {
  id: string;
  productionId: string;
  name: string;
  type: string;
  folder: string | null;
  sortOrder: number;
  filename: string;
  mimeType: string;
  createdAt: Date;
}): ProductionDocument {
  return {
    id: row.id,
    productionId: row.productionId,
    name: row.name,
    type: row.type as ProductionDocument["type"],
    folder: row.folder ?? null,
    sortOrder: row.sortOrder,
    filename: row.filename,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseRange(from: string | undefined, to: string | undefined) {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "from and to (YYYY-MM-DD) are required" as const };
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDateExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDateExclusive.getTime())) {
    return { error: "Invalid date range" as const };
  }
  return { from, to, fromDate, toDateExclusive };
}

function canRead(c: Parameters<typeof canView>[0]) {
  return canView(c, "schedule") || canView(c, "events");
}

function canWrite(c: Parameters<typeof canAction>[0]) {
  return canAction(c, "write.schedule") || canAction(c, "write.events");
}

async function assertProductionInOrg(productionId: string, organizationId: string) {
  return prisma.production.findFirst({
    where: { id: productionId, organizationId },
    select: { id: true },
  });
}

async function assertDependsOnPhase(
  dependsOnPhaseId: string | null | undefined,
  productionId: string,
  organizationId: string,
  selfPhaseId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!dependsOnPhaseId) return { ok: true };
  if (selfPhaseId && dependsOnPhaseId === selfPhaseId) {
    return { ok: false, message: "A phase cannot depend on itself" };
  }
  const parent = await prisma.productionPhase.findFirst({
    where: { id: dependsOnPhaseId, productionId, production: { organizationId } },
    select: { id: true, dependsOnPhaseId: true },
  });
  if (!parent) return { ok: false, message: "Dependency phase not found" };

  const seen = new Set<string>();
  let cur: string | null = dependsOnPhaseId;
  while (cur) {
    if (selfPhaseId && cur === selfPhaseId) {
      return { ok: false, message: "Circular dependency" };
    }
    if (seen.has(cur)) return { ok: false, message: "Circular dependency" };
    seen.add(cur);
    const nextPhase: { dependsOnPhaseId: string | null } | null =
      await prisma.productionPhase.findFirst({
        where: { id: cur, productionId },
        select: { dependsOnPhaseId: true },
      });
    cur = nextPhase?.dependsOnPhaseId ?? null;
  }
  return { ok: true };
}

async function loadSchedulePhases(productionId: string): Promise<SchedulePhaseInput[]> {
  const phases = await prisma.productionPhase.findMany({
    where: { productionId },
    select: {
      id: true,
      phaseKind: true,
      startDate: true,
      endDate: true,
      dependsOnPhaseId: true,
    },
  });
  return phases.map((p) => ({
    id: p.id,
    phaseKind: p.phaseKind,
    startDate: p.startDate,
    endDate: p.endDate,
    dependsOnPhaseId: p.dependsOnPhaseId,
  }));
}

async function validatePhaseSchedule(
  productionId: string,
  candidate: SchedulePhaseInput
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  const all = await loadSchedulePhases(productionId);
  const merged = all.some((p) => p.id === candidate.id)
    ? all.map((p) => (p.id === candidate.id ? candidate : p))
    : [...all, candidate];
  const err = validatePhaseDates(candidate, merged);
  if (err) return { ok: false, message: err.message, code: err.code };
  return { ok: true };
}

// GET /api/production-planner
productionPlannerRouter.get("/production-planner", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const r = parseRange(c.req.query("from"), c.req.query("to"));
  if ("error" in r) {
    return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  }
  const { from, to, fromDate, toDateExclusive } = r;
  const productionId = c.req.query("productionId");

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { billingCurrencyCode: true },
  });
  const currencyCode = org?.billingCurrencyCode ?? "EUR";

  const productions = await prisma.production.findMany({
    where: productionId
      ? { organizationId: user.organizationId, id: productionId }
      : {
          organizationId: user.organizationId,
          OR: [
            { planningStartDate: { gte: fromDate, lt: toDateExclusive } },
            { premiereDate: { gte: fromDate, lt: toDateExclusive } },
            {
              AND: [
                { planningStartDate: { lte: fromDate } },
                { premiereDate: { gte: toDateExclusive } },
              ],
            },
            {
              phases: {
                some: {
                  OR: [
                    { startDate: { gte: fromDate, lt: toDateExclusive } },
                    { endDate: { gte: fromDate, lt: toDateExclusive } },
                    {
                      AND: [
                        { startDate: { lte: fromDate } },
                        { endDate: { gte: toDateExclusive } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
    orderBy: [{ premiereDate: "asc" }, { name: "asc" }],
    include: productionInclude,
  });

  const productionIds = productions.map((p) => p.id);
  const costLines =
    productionIds.length === 0
      ? []
      : await prisma.productionCostLine.findMany({
          where: { organizationId: user.organizationId, productionId: { in: productionIds } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

  const costsByProduction = new Map<string, ProductionCostLine[]>();
  for (const line of costLines) {
    const ser = serializeCostLine(line);
    const list = costsByProduction.get(line.productionId) ?? [];
    list.push(ser);
    costsByProduction.set(line.productionId, list);
  }

  const rows = productions
    .map((p) =>
      buildProductionPlannerRow(
        p,
        costsByProduction.get(p.id) ?? [],
        0,
        currencyCode,
        rosterFromProduction(p)
      )
    )
    .sort((a, b) => (a.premiereDate ?? a.title).localeCompare(b.premiereDate ?? b.title));

  return c.json({
    data: {
      from,
      to,
      currencyCode,
      rows,
      totals: mergePlannerTotals(rows, currencyCode),
    },
  });
});

// GET /api/productions/:id/people
productionPlannerRouter.get("/productions/:id/people", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const production = await prisma.production.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!production) {
    return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);
  }

  const rows = await prisma.productionPerson.findMany({
    where: { productionId: id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      person: {
        include: {
          teamMemberships: { include: { department: true } },
        },
      },
    },
  });
  return c.json({ data: rows.map(serializeProductionPerson) });
});

// GET /api/productions
productionPlannerRouter.get("/productions", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  await ensureOrphanToursHaveProductions(user.organizationId);

  const productions = await prisma.production.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ premiereDate: "desc" }, { name: "asc" }],
    include: {
      homeVenue: { select: { name: true } },
      leadPerson: { select: { name: true } },
      tour: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
      tours: {
        select: { id: true, name: true, shows: { select: { date: true }, orderBy: { date: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
      events: { select: { id: true, title: true, startDate: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return c.json({ data: productions.map(serializeProduction) });
});

// GET /api/productions/:id
productionPlannerRouter.get("/productions/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await prisma.production.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      homeVenue: { select: { name: true } },
      leadPerson: { select: { name: true } },
      tour: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
      tours: {
        select: { id: true, name: true, shows: { select: { date: true }, orderBy: { date: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
      events: { select: { id: true, title: true, startDate: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!production) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: serializeProduction(production) });
});

// POST /api/productions
productionPlannerRouter.post(
  "/productions",
  zValidator("json", CreateProductionSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    const organizationId = user.organizationId;
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const premiereDate = parseIncomingDateTimeOrNull(body.premiereDate ?? null);
    const planningStartDate = parseIncomingDateTimeOrNull(body.planningStartDate ?? null);

    if (body.homeVenueId) {
      const venue = await prisma.venue.findFirst({
        where: { id: body.homeVenueId, organizationId },
      });
      if (!venue) return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.leadPersonId) {
      const person = await prisma.person.findFirst({
        where: { id: body.leadPersonId, organizationId },
      });
      if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }

    const defaultPhaseSpecs =
      body.useDefaultPhases && premiereDate ? defaultPhasesForPremiere(premiereDate) : [];

    const created = await prisma.production.create({
      data: {
        organizationId: user.organizationId,
        name: body.name,
        description: body.description ?? null,
        status: body.status ?? "planning",
        planningStartDate,
        premiereDate,
        homeVenueId: body.homeVenueId ?? null,
        leadPersonId: body.leadPersonId ?? null,
        notes: body.notes ?? null,
        actorCount: body.actorCount ?? null,
        techCount: body.techCount ?? null,
        durationMinutes: body.durationMinutes ?? null,
        stageWidth: body.stageWidth?.trim() || null,
        stageDepth: body.stageDepth?.trim() || null,
        stageHeight: body.stageHeight?.trim() || null,
        actorNames: sanitizeNameList(body.actorNames) ?? [],
        techNames: sanitizeNameList(body.techNames) ?? [],
        stageSize: body.stageSize ?? null,
        technicalSpecs: body.technicalSpecs ?? null,
      },
      include: {
        homeVenue: { select: { name: true } },
        leadPerson: { select: { name: true } },
        tour: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
        tours: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
        events: { select: { id: true, title: true, startDate: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (defaultPhaseSpecs.length > 0) {
      const idBySort = new Map<number, string>();
      for (const spec of defaultPhaseSpecs) {
        const phase = await prisma.productionPhase.create({
          data: {
            productionId: created.id,
            title: spec.title,
            category: spec.category,
            phaseKind: spec.phaseKind,
            startDate: spec.startDate,
            endDate: spec.endDate,
            sortOrder: spec.sortOrder,
            dependsOnPhaseId:
              spec.dependsOnSortOrder != null
                ? (idBySort.get(spec.dependsOnSortOrder) ?? null)
                : null,
          },
        });
        idBySort.set(spec.sortOrder, phase.id);
      }
    }

    return c.json({ data: serializeProduction(created) }, 201);
  }
);

// PATCH /api/productions/:id
productionPlannerRouter.patch(
  "/productions/:id",
  zValidator("json", UpdateProductionSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    const organizationId = user.organizationId;
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const id = c.req.param("id");
    const body = c.req.valid("json");
    const existing = await prisma.production.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

    if (body.homeVenueId) {
      const venue = await prisma.venue.findFirst({
        where: { id: body.homeVenueId, organizationId },
      });
      if (!venue) return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.leadPersonId) {
      const person = await prisma.person.findFirst({
        where: { id: body.leadPersonId, organizationId: user.organizationId },
      });
      if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.tourId) {
      const tour = await prisma.tour.findFirst({
        where: { id: body.tourId, organizationId },
      });
      if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.eventId) {
      const event = await prisma.event.findFirst({
        where: { id: body.eventId, organizationId },
      });
      if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.linkedTourIds) {
      const count = await prisma.tour.count({
        where: { organizationId, id: { in: body.linkedTourIds } },
      });
      if (count !== body.linkedTourIds.length) {
        return c.json({ error: { message: "One or more tours not found", code: "NOT_FOUND" } }, 404);
      }
    }
    if (body.linkedEventIds) {
      const count = await prisma.event.count({
        where: { organizationId, id: { in: body.linkedEventIds } },
      });
      if (count !== body.linkedEventIds.length) {
        return c.json({ error: { message: "One or more events not found", code: "NOT_FOUND" } }, 404);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.production.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          status: body.status,
          planningStartDate:
            body.planningStartDate === undefined
              ? undefined
              : parseIncomingDateTimeOrNull(body.planningStartDate),
          premiereDate:
            body.premiereDate === undefined
              ? undefined
              : parseIncomingDateTimeOrNull(body.premiereDate),
          closedAt:
            body.closedAt === undefined ? undefined : parseIncomingDateTimeOrNull(body.closedAt),
          homeVenueId: body.homeVenueId,
          leadPersonId: body.leadPersonId,
          tourId: body.tourId,
          eventId: body.eventId,
          notes: body.notes,
          actorCount: body.actorCount,
          techCount: body.techCount,
          durationMinutes: body.durationMinutes,
          stageWidth:
            body.stageWidth === undefined
              ? undefined
              : body.stageWidth === null
                ? null
                : body.stageWidth.trim() || null,
          stageDepth:
            body.stageDepth === undefined
              ? undefined
              : body.stageDepth === null
                ? null
                : body.stageDepth.trim() || null,
          stageHeight:
            body.stageHeight === undefined
              ? undefined
              : body.stageHeight === null
                ? null
                : body.stageHeight.trim() || null,
          actorNames: sanitizeNameList(body.actorNames),
          techNames: sanitizeNameList(body.techNames),
          stageSize: body.stageSize,
          technicalSpecs: body.technicalSpecs,
        },
      });

      if (body.linkedTourIds) {
        await tx.tour.updateMany({
          where: { organizationId, productionId: id, id: { notIn: body.linkedTourIds } },
          data: { productionId: null },
        });
        await tx.tour.updateMany({
          where: { organizationId, id: { in: body.linkedTourIds } },
          data: { productionId: id },
        });
      }

      if (body.linkedEventIds) {
        await tx.event.updateMany({
          where: { organizationId, productionId: id, id: { notIn: body.linkedEventIds } },
          data: { productionId: null },
        });
        await tx.event.updateMany({
          where: { organizationId, id: { in: body.linkedEventIds } },
          data: { productionId: id },
        });
      }

      return tx.production.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          homeVenue: { select: { name: true } },
          leadPerson: { select: { name: true } },
          tour: { select: { id: true, name: true } },
          event: { select: { id: true, title: true } },
          tours: {
            select: { id: true, name: true, shows: { select: { date: true }, orderBy: { date: "asc" } } },
            orderBy: { createdAt: "asc" },
          },
          events: { select: { id: true, title: true, startDate: true }, orderBy: { createdAt: "asc" } },
        },
      });
    });

    return c.json({ data: serializeProduction(updated) });
  }
);

// DELETE /api/productions/:id
productionPlannerRouter.delete("/productions/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const id = c.req.param("id");
  const existing = await assertProductionInOrg(id, user.organizationId);
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  await prisma.production.delete({ where: { id } });
  return c.body(null, 204);
});

const MAX_SHOW_TECH_RIDER_BYTES = 25 * 1024 * 1024;

// POST /api/productions/:id/tech-rider
productionPlannerRouter.post("/productions/:id/tech-rider", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await assertProductionInOrg(id, user.organizationId);
  if (!production) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  const pdfFile = file as File;
  const bytes = Buffer.from(await pdfFile.arrayBuffer());
  if (bytes.length > MAX_SHOW_TECH_RIDER_BYTES) {
    return c.json({ error: { message: "PDF must be at most 25 MB", code: "BAD_REQUEST" } }, 400);
  }

  await prisma.production.update({
    where: { id },
    data: {
      techRiderPdfData: bytes,
      techRiderPdfName: sanitizeStoredFilename(pdfFile.name || "tech-rider.pdf"),
    },
  });
  return c.json({ data: { ok: true } }, 201);
});

// GET /api/productions/:id/tech-rider/download
productionPlannerRouter.get("/productions/:id/tech-rider/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await prisma.production.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { techRiderPdfData: true, techRiderPdfName: true },
  });
  if (!production?.techRiderPdfData) {
    return c.json({ error: { message: "No tech rider uploaded", code: "NOT_FOUND" } }, 404);
  }
  return new Response(production.techRiderPdfData, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionHeader(
        "attachment",
        production.techRiderPdfName || "tech-rider.pdf"
      ),
      "Content-Length": String(production.techRiderPdfData.length),
    },
  });
});

// DELETE /api/productions/:id/tech-rider
productionPlannerRouter.delete("/productions/:id/tech-rider", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await assertProductionInOrg(id, user.organizationId);
  if (!production) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  await prisma.production.update({
    where: { id },
    data: { techRiderPdfData: null, techRiderPdfName: null },
  });
  return c.body(null, 204);
});

// GET /api/productions/:id/documents
productionPlannerRouter.get("/productions/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await assertProductionInOrg(id, user.organizationId);
  if (!production) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const docs = await prisma.productionDocument.findMany({
    where: { productionId: id },
    orderBy: [{ folder: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      productionId: true,
      name: true,
      type: true,
      folder: true,
      sortOrder: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });
  return c.json({ data: docs.map(serializeProductionDocument) });
});

// POST /api/productions/:id/documents
productionPlannerRouter.post("/productions/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const production = await assertProductionInOrg(id, user.organizationId);
  if (!production) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = typeof formData["name"] === "string" ? formData["name"].trim() : "";
  const type = typeof formData["type"] === "string" ? formData["type"].trim() : "other";
  const folder = typeof formData["folder"] === "string" ? formData["folder"].trim() : "";
  const sortOrderRaw = typeof formData["sortOrder"] === "string" ? Number(formData["sortOrder"]) : NaN;
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, Math.trunc(sortOrderRaw)) : 0;
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }

  const doc = await prisma.productionDocument.create({
    data: {
      organizationId: user.organizationId,
      productionId: id,
      name: name || file.name,
      type: type || "other",
      folder: folder || null,
      sortOrder,
      filename: sanitizeStoredFilename(file.name),
      data: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || "application/octet-stream",
    },
    select: {
      id: true,
      productionId: true,
      name: true,
      type: true,
      folder: true,
      sortOrder: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });
  return c.json({ data: serializeProductionDocument(doc) }, 201);
});

// PATCH /api/productions/:id/documents/:docId
productionPlannerRouter.patch("/productions/:id/documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const docId = c.req.param("docId");
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const type = typeof body.type === "string" ? body.type.trim() : undefined;
  const folder = typeof body.folder === "string" ? body.folder.trim() : undefined;
  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.trunc(body.sortOrder))
      : undefined;

  const existing = await prisma.productionDocument.findFirst({
    where: { id: docId, productionId: id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!existing) return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);

  const updated = await prisma.productionDocument.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name: name || "Untitled document" } : {}),
      ...(type !== undefined ? { type: type || "other" } : {}),
      ...(folder !== undefined ? { folder: folder || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
    select: {
      id: true,
      productionId: true,
      name: true,
      type: true,
      folder: true,
      sortOrder: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });
  return c.json({ data: serializeProductionDocument(updated) });
});

// GET /api/productions/:id/documents/:docId/download
productionPlannerRouter.get("/productions/:id/documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const docId = c.req.param("docId");
  const doc = await prisma.productionDocument.findFirst({
    where: { id: docId, productionId: id, organizationId: user.organizationId },
  });
  if (!doc) return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": contentDispositionHeader("attachment", doc.filename),
      "Content-Length": String(doc.data.length),
    },
  });
});

// DELETE /api/productions/:id/documents/:docId
productionPlannerRouter.delete("/productions/:id/documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const docId = c.req.param("docId");
  const doc = await prisma.productionDocument.findFirst({
    where: { id: docId, productionId: id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!doc) return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  await prisma.productionDocument.delete({ where: { id: doc.id } });
  return c.body(null, 204);
});

// POST /api/productions/:id/phases
productionPlannerRouter.post(
  "/productions/:id/phases",
  zValidator("json", CreateProductionPhaseSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const productionId = c.req.param("id");
    const production = await assertProductionInOrg(productionId, user.organizationId);
    if (!production) return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);

    const body = c.req.valid("json");

    if (body.assigneePersonId) {
      const person = await prisma.person.findFirst({
        where: { id: body.assigneePersonId, organizationId: user.organizationId },
      });
      if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.departmentId, organizationId: user.organizationId },
      });
      if (!dept) return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
    }

    const depCheck = await assertDependsOnPhase(
      body.dependsOnPhaseId,
      productionId,
      user.organizationId
    );
    if (!depCheck.ok) {
      return c.json({ error: { message: depCheck.message, code: "BAD_REQUEST" } }, 400);
    }

    const startDate = parseIncomingDateTime(body.startDate);
    const endDate = body.endDate ? parseIncomingDateTime(body.endDate) : null;
    const tempId = "new-phase";
    const scheduleCheck = await validatePhaseSchedule(productionId, {
      id: tempId,
      phaseKind: body.phaseKind,
      startDate,
      endDate,
      dependsOnPhaseId: body.dependsOnPhaseId ?? null,
    });
    if (!scheduleCheck.ok) {
      return c.json(
        { error: { message: scheduleCheck.message, code: scheduleCheck.code } },
        400
      );
    }

    const created = await prisma.productionPhase.create({
      data: {
        productionId,
        title: body.title,
        category: body.category,
        phaseKind: body.phaseKind,
        status: body.status ?? "planned",
        progressPercent: body.progressPercent ?? 0,
        startDate,
        endDate,
        assigneePersonId: body.assigneePersonId ?? null,
        departmentId: body.departmentId ?? null,
        dependsOnPhaseId: body.dependsOnPhaseId ?? null,
        notes: body.notes ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
      include: {
        assigneePerson: { select: { name: true } },
        department: { select: { name: true } },
        dependsOnPhase: { select: { id: true, title: true } },
      },
    });

    return c.json({ data: serializePhase(created) }, 201);
  }
);

// PATCH /api/productions/phases/:phaseId
productionPlannerRouter.patch(
  "/productions/phases/:phaseId",
  zValidator("json", UpdateProductionPhaseSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const phaseId = c.req.param("phaseId");
    const existing = await prisma.productionPhase.findFirst({
      where: { id: phaseId, production: { organizationId: user.organizationId } },
    });
    if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

    const body = c.req.valid("json");

    if (body.assigneePersonId) {
      const person = await prisma.person.findFirst({
        where: { id: body.assigneePersonId, organizationId: user.organizationId },
      });
      if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: body.departmentId, organizationId: user.organizationId },
      });
      if (!dept) return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
    }

    const dependsOnPhaseId =
      body.dependsOnPhaseId === undefined ? existing.dependsOnPhaseId : body.dependsOnPhaseId;
    const depCheck = await assertDependsOnPhase(
      dependsOnPhaseId,
      existing.productionId,
      user.organizationId,
      phaseId
    );
    if (!depCheck.ok) {
      return c.json({ error: { message: depCheck.message, code: "BAD_REQUEST" } }, 400);
    }

    const nextPhaseKind = body.phaseKind ?? existing.phaseKind;
    const nextStart = body.startDate ? parseIncomingDateTime(body.startDate) : existing.startDate;
    const nextEnd =
      body.endDate === undefined
        ? existing.endDate
        : body.endDate
          ? parseIncomingDateTime(body.endDate)
          : null;

    const scheduleCheck = await validatePhaseSchedule(existing.productionId, {
      id: phaseId,
      phaseKind: nextPhaseKind,
      startDate: nextStart,
      endDate: nextEnd,
      dependsOnPhaseId: dependsOnPhaseId,
    });
    if (!scheduleCheck.ok) {
      return c.json(
        { error: { message: scheduleCheck.message, code: scheduleCheck.code } },
        400
      );
    }

    const updated = await prisma.productionPhase.update({
      where: { id: phaseId },
      data: {
        title: body.title,
        category: body.category,
        phaseKind: body.phaseKind,
        status: body.status,
        progressPercent: body.progressPercent,
        startDate: body.startDate ? parseIncomingDateTime(body.startDate) : undefined,
        endDate:
          body.endDate === undefined
            ? undefined
            : body.endDate
              ? parseIncomingDateTime(body.endDate)
              : null,
        assigneePersonId: body.assigneePersonId,
        departmentId: body.departmentId,
        dependsOnPhaseId: body.dependsOnPhaseId,
        notes: body.notes,
        sortOrder: body.sortOrder,
      },
      include: {
        assigneePerson: { select: { name: true } },
        department: { select: { name: true } },
        dependsOnPhase: { select: { id: true, title: true } },
      },
    });

    return c.json({ data: serializePhase(updated) });
  }
);

// DELETE /api/productions/phases/:phaseId
productionPlannerRouter.delete("/productions/phases/:phaseId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const phaseId = c.req.param("phaseId");
  const existing = await prisma.productionPhase.findFirst({
    where: { id: phaseId, production: { organizationId: user.organizationId } },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const dependents = await prisma.productionPhase.count({
    where: { dependsOnPhaseId: phaseId },
  });
  if (dependents > 0) {
    return c.json(
      {
        error: {
          message: `${dependents} phase(s) depend on this one. Remove or reassign dependencies first.`,
          code: "HAS_DEPENDENTS",
        },
      },
      400
    );
  }

  await prisma.productionPhase.delete({ where: { id: phaseId } });
  return c.body(null, 204);
});

// POST /api/production-planner/costs
productionPlannerRouter.post(
  "/production-planner/costs",
  zValidator("json", CreateProductionCostLineSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { billingCurrencyCode: true },
    });

    const production = await assertProductionInOrg(body.productionId, user.organizationId);
    if (!production) return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);

    const created = await prisma.productionCostLine.create({
      data: {
        organizationId: user.organizationId,
        productionId: body.productionId,
        category: body.category,
        label: body.label,
        plannedCents: body.plannedCents,
        actualCents: body.actualCents ?? null,
        currencyCode: body.currencyCode ?? org?.billingCurrencyCode ?? "EUR",
        startDate: body.startDate ? parseIncomingDateTime(body.startDate) : null,
        endDate: body.endDate ? parseIncomingDateTime(body.endDate) : null,
        notes: body.notes ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    return c.json({ data: serializeCostLine(created) }, 201);
  }
);

// PATCH /api/production-planner/costs/:id
productionPlannerRouter.patch(
  "/production-planner/costs/:id",
  zValidator("json", UpdateProductionCostLineSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const id = c.req.param("id");
    const body = c.req.valid("json");
    const existing = await prisma.productionCostLine.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

    const updated = await prisma.productionCostLine.update({
      where: { id },
      data: {
        category: body.category,
        label: body.label,
        plannedCents: body.plannedCents,
        actualCents: body.actualCents,
        currencyCode: body.currencyCode,
        startDate:
          body.startDate === undefined
            ? undefined
            : body.startDate
              ? parseIncomingDateTime(body.startDate)
              : null,
        endDate:
          body.endDate === undefined
            ? undefined
            : body.endDate
              ? parseIncomingDateTime(body.endDate)
              : null,
        notes: body.notes,
        sortOrder: body.sortOrder,
      },
    });

    return c.json({ data: serializeCostLine(updated) });
  }
);

// DELETE /api/production-planner/costs/:id
productionPlannerRouter.delete("/production-planner/costs/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const id = c.req.param("id");
  const existing = await prisma.productionCostLine.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  await prisma.productionCostLine.delete({ where: { id } });
  return c.body(null, 204);
});

// POST /api/productions/:id/teams — assign team; members become production people
productionPlannerRouter.post(
  "/productions/:id/teams",
  zValidator("json", AssignProductionTeamSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    const production = await prisma.production.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!production) {
      return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);
    }

    const team = await prisma.department.findFirst({
      where: { id: body.teamId, organizationId: user.organizationId },
    });
    if (!team) {
      return c.json({ error: { message: "Team not found", code: "NOT_FOUND" } }, 404);
    }

    const assignment = await prisma.productionTeam.upsert({
      where: { productionId_departmentId: { productionId: id, departmentId: body.teamId } },
      update: {},
      create: { productionId: id, departmentId: body.teamId },
      include: { department: true },
    });

    const members = await prisma.personTeam.findMany({
      where: {
        departmentId: body.teamId,
        person: { is: { organizationId: user.organizationId } },
      },
      select: { personId: true },
    });

    for (const member of members) {
      await prisma.productionPerson.upsert({
        where: { productionId_personId: { productionId: id, personId: member.personId } },
        update: {},
        create: { productionId: id, personId: member.personId },
      });
    }

    return c.json({ data: serializeProductionTeam(assignment) }, 201);
  }
);

productionPlannerRouter.delete("/productions/:id/teams/:teamId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const { id, teamId } = c.req.param();
  const production = await prisma.production.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!production) {
    return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.productionTeam.findUnique({
    where: { productionId_departmentId: { productionId: id, departmentId: teamId } },
  });
  if (!existing) {
    return c.json({ error: { message: "Team assignment not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.productionTeam.delete({
    where: { productionId_departmentId: { productionId: id, departmentId: teamId } },
  });

  const remainingTeamIds = (
    await prisma.productionTeam.findMany({
      where: { productionId: id },
      select: { departmentId: true },
    })
  ).map((t) => t.departmentId);

  const remainingPersonIds = new Set(
    remainingTeamIds.length === 0
      ? []
      : (
          await prisma.personTeam.findMany({
            where: { departmentId: { in: remainingTeamIds } },
            select: { personId: true },
          })
        ).map((m) => m.personId)
  );

  const assignedPeople = await prisma.productionPerson.findMany({
    where: { productionId: id },
    select: { personId: true },
  });
  const peopleToRemove = assignedPeople
    .map((a) => a.personId)
    .filter((personId) => !remainingPersonIds.has(personId));

  if (peopleToRemove.length > 0) {
    await prisma.productionPerson.deleteMany({
      where: { productionId: id, personId: { in: peopleToRemove } },
    });
  }

  return c.body(null, 204);
});

// POST /api/productions/:id/people
productionPlannerRouter.post(
  "/productions/:id/people",
  zValidator("json", z.object({ personId: z.string(), role: z.string().optional() })),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    const production = await prisma.production.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!production) {
      return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);
    }

    const person = await prisma.person.findFirst({
      where: { id: body.personId, organizationId: user.organizationId },
    });
    if (!person) {
      return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }

    const row = await prisma.productionPerson.upsert({
      where: { productionId_personId: { productionId: id, personId: body.personId } },
      update: { role: body.role ?? null },
      create: {
        productionId: id,
        personId: body.personId,
        role: body.role ?? null,
      },
      include: {
        person: {
          include: { teamMemberships: { include: { department: true } } },
        },
      },
    });

    return c.json({ data: serializeProductionPerson(row) }, 201);
  }
);

productionPlannerRouter.delete("/productions/:id/people/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const { id, personId } = c.req.param();
  const production = await prisma.production.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!production) {
    return c.json({ error: { message: "Production not found", code: "NOT_FOUND" } }, 404);
  }

  const existing = await prisma.productionPerson.findUnique({
    where: { productionId_personId: { productionId: id, personId } },
  });
  if (!existing) {
    return c.json({ error: { message: "Person assignment not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.productionPerson.delete({
    where: { productionId_personId: { productionId: id, personId } },
  });

  return c.body(null, 204);
});

async function assertPhaseInOrg(phaseId: string, organizationId: string) {
  return prisma.productionPhase.findFirst({
    where: { id: phaseId, production: { organizationId } },
    select: { id: true, productionId: true },
  });
}

// GET /api/productions/phases/:phaseId/documents
productionPlannerRouter.get("/productions/phases/:phaseId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "schedule") && !canView(c, "events")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const phaseId = c.req.param("phaseId");
  const phase = await assertPhaseInOrg(phaseId, user.organizationId);
  if (!phase) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const documents = await prisma.productionPhaseDocument.findMany({
    where: { phaseId },
    select: {
      id: true,
      phaseId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() })),
  });
});

// POST /api/productions/phases/:phaseId/documents
productionPlannerRouter.post("/productions/phases/:phaseId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const phaseId = c.req.param("phaseId");
  const phase = await assertPhaseInOrg(phaseId, user.organizationId);
  if (!phase) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = formData["name"];
  const type = formData["type"];

  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  if (typeof name !== "string" || !name.trim()) {
    return c.json({ error: { message: "Name is required", code: "BAD_REQUEST" } }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const document = await prisma.productionPhaseDocument.create({
    data: {
      organizationId: user.organizationId,
      phaseId,
      name: name.trim(),
      type: typeof type === "string" && type.trim() ? type.trim() : "other",
      filename: sanitizeStoredFilename(file.name),
      data: buffer,
      mimeType: file.type || "application/octet-stream",
    },
    select: {
      id: true,
      phaseId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });

  return c.json(
    { data: { ...document, createdAt: document.createdAt.toISOString() } },
    201
  );
});

// GET /api/productions/phase-documents/:docId/download
productionPlannerRouter.get("/productions/phase-documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const docId = c.req.param("docId");
  const document = await prisma.productionPhaseDocument.findFirst({
    where: { id: docId, organizationId: user.organizationId },
  });
  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  return new Response(document.data, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": contentDispositionHeader("attachment", document.filename),
      "Content-Length": String(document.data.length),
    },
  });
});

// DELETE /api/productions/phase-documents/:docId
productionPlannerRouter.delete("/productions/phase-documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canWrite(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const docId = c.req.param("docId");
  const document = await prisma.productionPhaseDocument.findFirst({
    where: { id: docId, organizationId: user.organizationId },
  });
  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.productionPhaseDocument.delete({ where: { id: docId } });
  return c.body(null, 204);
});

export default productionPlannerRouter;
