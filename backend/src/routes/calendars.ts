import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateCalendarSchema } from "../types";
import { canAction } from "../requestRole";

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
    startDate: Date | null;
    endDate: Date | null;
    status: string;
    tags: string | null;
    venue: { name: string; addressStreet: string | null; addressCity: string | null; addressCountry: string | null; capacity: number | null } | null;
    people: Array<{ person: { name: string; role: string | null }; role: string | null }>;
    shows?: Array<{
      id: string;
      showDate: Date;
      showTime: string;
      durationMinutes: number;
      venue: { name: string; addressStreet: string | null; addressCity: string | null; addressCountry: string | null } | null;
    }>;
  }>
): string {
  const now = formatICSDate(new Date());

  const statusMap: Record<string, string> = {
    confirmed: "CONFIRMED",
    cancelled: "CANCELLED",
    draft: "TENTATIVE",
  };

  const vevents = events
    .flatMap((event) => {
      const showRows = (event.shows ?? []).filter((s) => /^\d{2}:\d{2}$/.test(s.showTime));
      if (showRows.length > 0) {
        return showRows.map((show) => {
          const [hhRaw, mmRaw] = show.showTime.split(":");
          const hh = Number(hhRaw);
          const mm = Number(mmRaw);
          const start = new Date(show.showDate);
          start.setUTCHours(hh, mm, 0, 0);
          const end = new Date(start.getTime() + Math.max(1, show.durationMinutes) * 60 * 1000);
          return {
            uid: `${event.id}-${show.id}@ordostage`,
            summary: event.title,
            start,
            end,
            venue: show.venue ?? event.venue ?? null,
            descriptionBase: event.description,
            status: event.status,
            tags: event.tags,
            people: event.people,
          };
        });
      }

      if (!event.startDate) return [];
      const fallbackStart = event.startDate;
      const fallbackEnd = event.endDate ?? new Date(fallbackStart.getTime() + 60 * 60 * 1000);
      return [
        {
          uid: `${event.id}@ordostage`,
          summary: event.title,
          start: fallbackStart,
          end: fallbackEnd,
          venue: event.venue,
          descriptionBase: event.description,
          status: event.status,
          tags: event.tags,
          people: event.people,
        },
      ];
    })
    .map((row) => {
      const dtstart = formatICSDate(row.start);
      const dtend = formatICSDate(row.end);

      const icsStatus = statusMap[row.status] ?? "TENTATIVE";

      // Build rich description
      const parts: string[] = [];
      if (row.descriptionBase) parts.push(row.descriptionBase);
      if (row.tags) parts.push(`Tags: ${row.tags}`);
      if (row.people.length > 0) {
        const peopleList = row.people
          .map((ep) => {
            const role = ep.role || ep.person.role;
            return role ? `${ep.person.name} (${role})` : ep.person.name;
          })
          .join(", ");
        parts.push(`People: ${peopleList}`);
      }
      const fullDescription =
        parts.length > 0
          ? `DESCRIPTION:${escapeICSText(parts.join("\\n"))}`
          : null;

      // Location: venue name + address
      let location: string | null = null;
      if (row.venue) {
        const addrParts = [row.venue.addressStreet, row.venue.addressCity, row.venue.addressCountry].filter(Boolean);
        const loc = addrParts.length > 0
          ? `${row.venue.name}, ${addrParts.join(", ")}`
          : row.venue.name;
        location = `LOCATION:${escapeICSText(loc)}`;
      }

      return [
        "BEGIN:VEVENT",
        `UID:${row.uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${escapeICSText(row.summary)}`,
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
    "PRODID:-//OrdoStage Calendar//EN",
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

  if (!canAction(c, "write.calendars")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

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

  if (!canAction(c, "write.calendars")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

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
    departmentId?: string;
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

  // Department filter: include events where any assigned person belongs to that department
  if (filter.departmentId) {
    where.people = {
      some: {
        person: {
          departmentId: filter.departmentId,
        },
      },
    };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: {
      venue: { select: { name: true, addressStreet: true, addressCity: true, addressCountry: true, capacity: true } },
      shows: {
        select: {
          id: true,
          showDate: true,
          showTime: true,
          durationMinutes: true,
          venue: { select: { name: true, addressStreet: true, addressCity: true, addressCountry: true } },
        },
        orderBy: [{ showDate: "asc" }, { showTime: "asc" }],
      },
      people: {
        include: {
          person: {
            select: { name: true, role: true, departmentId: true },
          },
        },
      },
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
