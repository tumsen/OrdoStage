import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { canAction, canView } from "../requestRole";
import {
  CreateProductionCostLineSchema,
  CreateProductionPhaseSchema,
  CreateProductionSchema,
  UpdateProductionCostLineSchema,
  UpdateProductionPhaseSchema,
  UpdateProductionSchema,
  type Production,
  type ProductionCostLine,
  type ProductionPhase,
} from "../types";
import {
  buildProductionPlannerRow,
  defaultPhasesForPremiere,
  mergePlannerTotals,
} from "../lib/productionPlannerBuild";
import { parseIncomingDateTime, parseIncomingDateTimeOrNull } from "../parseIncomingDateTime";

const productionPlannerRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

const productionInclude = {
  homeVenue: { select: { name: true } },
  leadPerson: { select: { name: true } },
  tour: { select: { id: true, name: true } },
  event: { select: { id: true, title: true } },
  phases: {
    orderBy: [{ sortOrder: "asc" as const }, { startDate: "asc" as const }],
    include: {
      assigneePerson: { select: { name: true } },
      department: { select: { name: true } },
    },
  },
};

function serializePhase(row: {
  id: string;
  productionId: string;
  title: string;
  category: string;
  phaseKind: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  assigneePersonId: string | null;
  departmentId: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assigneePerson?: { name: string } | null;
  department?: { name: string } | null;
}): ProductionPhase {
  return {
    id: row.id,
    productionId: row.productionId,
    title: row.title,
    category: row.category as ProductionPhase["category"],
    phaseKind: row.phaseKind as ProductionPhase["phaseKind"],
    status: row.status as ProductionPhase["status"],
    startDate: row.startDate.toISOString(),
    endDate: row.endDate ? row.endDate.toISOString() : null,
    assigneePersonId: row.assigneePersonId,
    assigneeName: row.assigneePerson?.name ?? null,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
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
  createdAt: Date;
  updatedAt: Date;
  homeVenue?: { name: string } | null;
  leadPerson?: { name: string } | null;
  tour?: { id: string; name: string } | null;
  event?: { id: string; title: string } | null;
}): Production {
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
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { billingCurrencyCode: true },
  });
  const currencyCode = org?.billingCurrencyCode ?? "EUR";

  const productions = await prisma.production.findMany({
    where: {
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
        currencyCode
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

// GET /api/productions
productionPlannerRouter.get("/productions", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canRead(c)) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const productions = await prisma.production.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ premiereDate: "desc" }, { name: "asc" }],
    include: {
      homeVenue: { select: { name: true } },
      leadPerson: { select: { name: true } },
      tour: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
    },
  });

  return c.json({ data: productions.map(serializeProduction) });
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
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const premiereDate = parseIncomingDateTimeOrNull(body.premiereDate ?? null);
    const planningStartDate = parseIncomingDateTimeOrNull(body.planningStartDate ?? null);

    if (body.homeVenueId) {
      const venue = await prisma.venue.findFirst({
        where: { id: body.homeVenueId, organizationId: user.organizationId },
      });
      if (!venue) return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.leadPersonId) {
      const person = await prisma.person.findFirst({
        where: { id: body.leadPersonId, organizationId: user.organizationId },
      });
      if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }

    const defaultPhases =
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
        phases: defaultPhases.length
          ? { create: defaultPhases }
          : undefined,
      },
      include: {
        homeVenue: { select: { name: true } },
        leadPerson: { select: { name: true } },
        tour: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
    });

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
    if (!canWrite(c)) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const id = c.req.param("id");
    const body = c.req.valid("json");
    const existing = await prisma.production.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

    if (body.homeVenueId) {
      const venue = await prisma.venue.findFirst({
        where: { id: body.homeVenueId, organizationId: user.organizationId },
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
        where: { id: body.tourId, organizationId: user.organizationId },
      });
      if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.eventId) {
      const event = await prisma.event.findFirst({
        where: { id: body.eventId, organizationId: user.organizationId },
      });
      if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }

    const updated = await prisma.production.update({
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
      },
      include: {
        homeVenue: { select: { name: true } },
        leadPerson: { select: { name: true } },
        tour: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
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

    const created = await prisma.productionPhase.create({
      data: {
        productionId,
        title: body.title,
        category: body.category,
        phaseKind: body.phaseKind,
        status: body.status ?? "planned",
        startDate: parseIncomingDateTime(body.startDate),
        endDate: body.endDate ? parseIncomingDateTime(body.endDate) : null,
        assigneePersonId: body.assigneePersonId ?? null,
        departmentId: body.departmentId ?? null,
        notes: body.notes ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
      include: {
        assigneePerson: { select: { name: true } },
        department: { select: { name: true } },
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

    const updated = await prisma.productionPhase.update({
      where: { id: phaseId },
      data: {
        title: body.title,
        category: body.category,
        phaseKind: body.phaseKind,
        status: body.status,
        startDate: body.startDate ? parseIncomingDateTime(body.startDate) : undefined,
        endDate:
          body.endDate === undefined
            ? undefined
            : body.endDate
              ? parseIncomingDateTime(body.endDate)
              : null,
        assigneePersonId: body.assigneePersonId,
        departmentId: body.departmentId,
        notes: body.notes,
        sortOrder: body.sortOrder,
      },
      include: {
        assigneePerson: { select: { name: true } },
        department: { select: { name: true } },
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

export default productionPlannerRouter;
