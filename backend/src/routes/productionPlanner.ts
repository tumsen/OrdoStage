import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { canAction, canView } from "../requestRole";
import {
  CreateProductionCostLineSchema,
  UpdateProductionCostLineSchema,
  type ProductionCostLine,
} from "../types";
import {
  buildEventPlannerRow,
  buildTourPlannerRow,
  mergePlannerTotals,
} from "../lib/productionPlannerBuild";
import { parseIncomingDateTime } from "../parseIncomingDateTime";

const productionPlannerRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function serializeCostLine(row: {
  id: string;
  organizationId: string;
  eventId: string | null;
  tourId: string | null;
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
    eventId: row.eventId,
    tourId: row.tourId,
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

async function laborMinutesForEvents(orgId: string, eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const entries = await prisma.timeEntry.findMany({
    where: { organizationId: orgId, eventId: { in: eventIds } },
    select: { eventId: true, startsAt: true, endsAt: true },
  });
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.eventId) continue;
    const mins = Math.max(0, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000));
    map.set(e.eventId, (map.get(e.eventId) ?? 0) + mins);
  }
  return map;
}

async function laborMinutesForTours(orgId: string, tourIds: string[]): Promise<Map<string, number>> {
  if (tourIds.length === 0) return new Map();
  const shows = await prisma.tourShow.findMany({
    where: { tourId: { in: tourIds } },
    select: { id: true, tourId: true },
  });
  const showToTour = new Map(shows.map((s) => [s.id, s.tourId]));
  const showIds = shows.map((s) => s.id);
  if (showIds.length === 0) return new Map();
  const entries = await prisma.timeEntry.findMany({
    where: { organizationId: orgId, tourShowId: { in: showIds } },
    select: { tourShowId: true, startsAt: true, endsAt: true },
  });
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.tourShowId) continue;
    const tourId = showToTour.get(e.tourShowId);
    if (!tourId) continue;
    const mins = Math.max(0, Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000));
    map.set(tourId, (map.get(tourId) ?? 0) + mins);
  }
  return map;
}

// GET /api/production-planner
productionPlannerRouter.get("/production-planner", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "schedule") && !canView(c, "events") && !canView(c, "tours")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const kind = c.req.query("kind") ?? "all";
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

  const showDateRange = { gte: fromDate, lt: toDateExclusive };
  const jobDateRange = showDateRange;

  const [events, tours] = await Promise.all([
    kind === "tours"
      ? []
      : prisma.event.findMany({
          where: {
            organizationId: user.organizationId,
            OR: [
              { startDate: { gte: fromDate, lt: toDateExclusive } },
              { endDate: { gte: fromDate, lt: toDateExclusive } },
              { shows: { some: { showDate: showDateRange } } },
            ],
          },
          orderBy: { title: "asc" },
          select: {
            id: true,
            title: true,
            status: true,
            startDate: true,
            endDate: true,
            venue: { select: { name: true } },
            shows: {
              where: { showDate: showDateRange },
              select: {
                id: true,
                showDate: true,
                showTime: true,
                durationMinutes: true,
                status: true,
                venue: { select: { name: true } },
                getInTime: true,
                getInDurationMinutes: true,
                getOutTime: true,
                getOutDurationMinutes: true,
                rehearsalTime: true,
                rehearsalDurationMinutes: true,
                soundcheckTime: true,
                soundcheckDurationMinutes: true,
                breakTime: true,
                breakDurationMinutes: true,
                jobs: {
                  where: { jobDate: jobDateRange },
                  select: {
                    id: true,
                    title: true,
                    jobDate: true,
                    startTime: true,
                    durationMinutes: true,
                    venue: { select: { name: true } },
                    department: { select: { name: true } },
                    person: { select: { name: true } },
                    assignments: { include: { person: { select: { name: true } } } },
                  },
                  orderBy: [{ jobDate: "asc" }, { startTime: "asc" }],
                },
              },
              orderBy: [{ showDate: "asc" }, { showTime: "asc" }],
            },
          },
        }),
    kind === "events"
      ? []
      : prisma.tour.findMany({
          where: {
            organizationId: user.organizationId,
            shows: { some: { date: showDateRange } },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            status: true,
            shows: {
              where: { date: showDateRange },
              select: {
                id: true,
                date: true,
                dayKey: true,
                type: true,
                fromLocation: true,
                toLocation: true,
                venueName: true,
                venueCity: true,
                showTime: true,
                getInTime: true,
                rehearsalTime: true,
                soundcheckTime: true,
                doorsTime: true,
                scheduleEvents: { orderBy: { sortOrder: "asc" } },
              },
              orderBy: [{ date: "asc" }, { order: "asc" }],
            },
          },
        }),
  ]);

  const eventIds = events.map((e) => e.id);
  const tourIds = tours.map((t) => t.id);

  const costLines =
    eventIds.length === 0 && tourIds.length === 0
      ? []
      : await prisma.productionCostLine.findMany({
          where: {
            organizationId: user.organizationId,
            OR: [
              ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
              ...(tourIds.length ? [{ tourId: { in: tourIds } }] : []),
            ],
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });

  const [eventLabor, tourLabor] = await Promise.all([
    laborMinutesForEvents(user.organizationId, eventIds),
    laborMinutesForTours(user.organizationId, tourIds),
  ]);

  const costsByEvent = new Map<string, ProductionCostLine[]>();
  const costsByTour = new Map<string, ProductionCostLine[]>();
  for (const line of costLines) {
    const ser = serializeCostLine(line);
    if (line.eventId) {
      const list = costsByEvent.get(line.eventId) ?? [];
      list.push(ser);
      costsByEvent.set(line.eventId, list);
    } else if (line.tourId) {
      const list = costsByTour.get(line.tourId) ?? [];
      list.push(ser);
      costsByTour.set(line.tourId, list);
    }
  }

  const rows = [
    ...events.map((e) =>
      buildEventPlannerRow(
        e,
        costsByEvent.get(e.id) ?? [],
        eventLabor.get(e.id) ?? 0,
        currencyCode
      )
    ),
    ...tours.map((t) =>
      buildTourPlannerRow(
        t,
        costsByTour.get(t.id) ?? [],
        tourLabor.get(t.id) ?? 0,
        currencyCode
      )
    ),
  ].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));

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

// POST /api/production-planner/costs
productionPlannerRouter.post(
  "/production-planner/costs",
  zValidator("json", CreateProductionCostLineSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "write.schedule") && !canAction(c, "write.events")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }

    const body = c.req.valid("json");
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { billingCurrencyCode: true },
    });

    if (body.eventId) {
      const event = await prisma.event.findFirst({
        where: { id: body.eventId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.tourId) {
      const tour = await prisma.tour.findFirst({
        where: { id: body.tourId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    }

    const created = await prisma.productionCostLine.create({
      data: {
        organizationId: user.organizationId,
        eventId: body.eventId ?? null,
        tourId: body.tourId ?? null,
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
    if (!canAction(c, "write.schedule") && !canAction(c, "write.events")) {
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
  if (!canAction(c, "write.schedule") && !canAction(c, "write.events")) {
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
