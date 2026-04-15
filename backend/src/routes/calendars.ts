import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import prisma from "../db";
import { CreateCalendarSchema } from "../types";

const calendarsRouter = new Hono();

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
    venue: { name: string } | null;
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
      const description = event.description
        ? `DESCRIPTION:${escapeICSText(event.description)}\r\n`
        : "";
      const location = event.venue
        ? `LOCATION:${escapeICSText(event.venue.name)}\r\n`
        : "";

      return [
        "BEGIN:VEVENT",
        `UID:${event.id}@theater`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${escapeICSText(event.title)}`,
        description.trim() ? description.trim() : null,
        location.trim() ? location.trim() : null,
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
  const calendars = await prisma.calendar.findMany({
    orderBy: { name: "asc" },
  });
  return c.json({ data: calendars });
});

// POST /api/calendars
calendarsRouter.post("/calendars", zValidator("json", CreateCalendarSchema), async (c) => {
  const body = c.req.valid("json");
  const calendar = await prisma.calendar.create({
    data: {
      name: body.name,
      filter: body.filter ?? null,
    },
  });
  return c.json({ data: calendar }, 201);
});

// DELETE /api/calendars/:id
calendarsRouter.delete("/calendars/:id", async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.calendar.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: { message: "Calendar not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.calendar.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// GET /api/calendars/:token.ics — ICS subscription endpoint
calendarsRouter.get("/calendars/:tokenIcs", async (c) => {
  const tokenIcs = c.req.param("tokenIcs");

  // Strip .ics extension
  const token = tokenIcs.endsWith(".ics") ? tokenIcs.slice(0, -4) : tokenIcs;

  const calendar = await prisma.calendar.findUnique({ where: { token } });
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

  const where: Record<string, unknown> = {};
  if (filter.status) where.status = filter.status;
  if (filter.venueId) where.venueId = filter.venueId;
  if (filter.tags) {
    where.tags = { contains: filter.tags };
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: { venue: true },
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
