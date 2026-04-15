import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateCalendarSchema } from "../types";

const calendarsRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function buildICS(
  calendarName: string,
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    startDate: Date;
    endDate: Date | null;
    status: string;
    tags: string | null;
    venue: { name: string; address: string | null; capacity: number | null } | null;
    people: Array<{ person: { name: string; role: string | null }; role: string | null }>;
  }>
): string {
  const now = formatICSDate(new Date());

  const statusMap: Record<string, string> = {
    confirmed: "CONFIRMED",
    cancelled: "CANCELLED",
    draft: "TENTATIVE",
  };

  const vevents = events
    .map((event) => {
      const dtstart = formatICSDate(event.startDate);
      const dtend = event.endDate
        ? formatICSDate(event.endDate)
        : formatICSDate(new Date(event.startDate.getTime() + 60 * 60 * 1000));

      const icsStatus = statusMap[event.status] ?? "TENTATIVE";

      // Build rich description
      const parts: string[] = [];
      if (event.description) parts.push(event.description);
      if (event.venue?.capacity) parts.push(`Capacity: ${event.venue.capacity}`);
      if (event.tags) parts.push(`Tags: ${event.tags}`);
      if (event.people.length > 0) {
        const peopleList = event.people
          .map((ep) => {
            const role = ep.role || ep.person.role;
            return role ? `${ep.person.name} (${role})` : ep.person.name;
          })
          .join(", ");
        parts.push(`People: ${peopleList}`);
      }
      const fullDescription = parts.length > 0
        ? `DESCRIPTION:${escapeICSText(parts.join("\\n"))}`
        : null;

      // Location: venue name + address
      let location: string | null = null;
      if (event.venue) {
        const loc = event.venue.address
          ? `${event.venue.name}, ${event.venue.address}`
          : event.venue.name;
        location = `LOCATION:${escapeICSText(loc)}`;
      }

      return [
        "BEGIN:VEVENT",
        `UID:${event.id}@theater`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${escapeICSText(event.title)}`,
        fullDescription,
        location,
        `STATUS:${icsStatus}`,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Theater Planning//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
    vevents,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

// GET /api/calendars
calendarsRouter.get("/calendars", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const calendars = await prisma.calendar.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });
  return c.json({ data: calendars });
});

// POST /api/calendars
calendarsRouter.post("/calendars", zValidator("json", CreateCalendarSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = c.req.valid("json");
  const calendar = await prisma.calendar.create({
    data: {
      name: body.name,
      filter: body.filter ?? null,
      organizationId: user.organizationId,
    },
  });
  return c.json({ data: calendar }, 201);
});

// DELETE /api/calendars/:id
calendarsRouter.delete("/calendars/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const existing = await prisma.calendar.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Calendar not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.calendar.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// GET /api/calendars/:token.ics — PUBLIC ICS subscription endpoint (no auth required)
calendarsRouter.get("/calendars/:tokenIcs", async (c) => {
  const tokenIcs = c.req.param("tokenIcs");

  // Strip .ics extension
  const token = tokenIcs.endsWith(".ics") ? tokenIcs.slice(0, -4) : tokenIcs;

  const calendar = await prisma.calendar.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (!calendar) {
    return c.json({ error: { message: "Calendar not found", code: "NOT_FOUND" } }, 404);
  }

  // Parse filter
  let filter: {
    status?: string;
    venueId?: string;
    tags?: string;
  } = {};

  if (calendar.filter) {
    try {
      filter = JSON.parse(calendar.filter);
    } catch {
      filter = {};
    }
  }

  const where: Record<string, unknown> = { organizationId: calendar.organizationId };
  if (filter.status) where.status = filter.status;
  if (filter.venueId) where.venueId = filter.venueId;
  if (filter.tags) {
    where.tags = { contains: filter.tags };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: {
      venue: { select: { name: true, address: true, capacity: true } },
      people: { include: { person: { select: { name: true, role: true } } } },
    },
  });

  const icsContent = buildICS(calendar.name, events);

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${calendar.name}.ics"`,
    },
  });
});

export default calendarsRouter;
