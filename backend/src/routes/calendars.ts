import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateCalendarSchema } from "../types";
import { canAction } from "../requestRole";
import { env } from "../env";

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

function normalizeTagList(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

type ContactRow = { role?: string; name?: string; phone?: string; email?: string };

function parseEventCustomFields(customFields: string | null | undefined): {
  contacts: ContactRow[];
  smokeFx: boolean;
  hazeFx: boolean;
  strobeFx: boolean;
} {
  if (!customFields) return { contacts: [], smokeFx: false, hazeFx: false, strobeFx: false };
  try {
    const fields = JSON.parse(customFields) as Array<{ key?: string; value?: string }>;
    if (!Array.isArray(fields)) return { contacts: [], smokeFx: false, hazeFx: false, strobeFx: false };
    let contacts: ContactRow[] = [];
    let smokeFx = false;
    let hazeFx = false;
    let strobeFx = false;
    for (const field of fields) {
      const key = (field.key ?? "").trim();
      const value = (field.value ?? "").trim();
      if (key === "Contacts" && value) {
        try {
          const parsed = JSON.parse(value) as ContactRow[];
          if (Array.isArray(parsed)) contacts = parsed;
        } catch {
          // ignore malformed contacts payload
        }
      } else if (key === "Use smoke fx") smokeFx = value === "true";
      else if (key === "Use haze fx") hazeFx = value === "true";
      else if (key === "Use strobe fx") strobeFx = value === "true";
    }
    return { contacts, smokeFx, hazeFx, strobeFx };
  } catch {
    return { contacts: [], smokeFx: false, hazeFx: false, strobeFx: false };
  }
}

interface ICSRow {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  venue: {
    name: string;
    addressStreet: string | null;
    addressCity: string | null;
    addressCountry: string | null;
    capacity?: number | null;
  } | null;
  descriptionBase: string | null;
  status: string;
  categories: string[];
  people: Array<{ person: { name: string; role: string | null }; role: string | null }>;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  eventId: string;
  showId: string | null;
  showTime: string | null;
  showDurationMinutes: number | null;
  contactPerson: string | null;
  getInTime: string | null;
  setupTime: string | null;
  stageSize: string | null;
  actorCount: number | null;
  allergies: string | null;
  customFields: string | null;
  technicalNotes: string | null;
  fohNotes: string | null;
  notes: string | null;
  jobsText: string;
}

function buildICS(
  calendarName: string,
  organizationName: string,
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    contactPerson: string | null;
    getInTime: string | null;
    setupTime: string | null;
    stageSize: string | null;
    actorCount: number | null;
    allergies: string | null;
    customFields: string | null;
    status: string;
    tags: string | null;
    venue: { name: string; addressStreet: string | null; addressCity: string | null; addressCountry: string | null; capacity: number | null } | null;
    people: Array<{ person: { name: string; role: string | null }; role: string | null }>;
    shows?: Array<{
      id: string;
      status: string;
      showDate: Date;
      showTime: string;
      durationMinutes: number;
      technicalNotes: string | null;
      fohNotes: string | null;
      notes: string | null;
      venue: { name: string; addressStreet: string | null; addressCity: string | null; addressCountry: string | null } | null;
      jobs: Array<{
        title: string;
        startTime: string;
        durationMinutes: number;
        person: { name: string } | null;
      }>;
    }>;
  }>
): string {
  const now = formatICSDate(new Date());
  const appBase = (env.FRONTEND_URL || env.BACKEND_URL || "http://localhost:5173").replace(/\/+$/, "");

  const statusMap: Record<string, string> = {
    confirmed: "CONFIRMED",
    cancelled: "CANCELLED",
    draft: "TENTATIVE",
  };

  const rows = events.flatMap<ICSRow>((event) => {
      const showRows = (event.shows ?? []).filter((s) => /^\d{2}:\d{2}$/.test(s.showTime));
      if (showRows.length > 0) {
        return showRows.map((show) => {
          const [hhRaw, mmRaw] = show.showTime.split(":");
          const hh = Number(hhRaw);
          const mm = Number(mmRaw);
          const start = new Date(show.showDate);
          start.setUTCHours(hh, mm, 0, 0);
          const end = new Date(start.getTime() + Math.max(1, show.durationMinutes) * 60 * 1000);
          const categories = normalizeTagList(event.tags);
          categories.unshift("Event", "Show");
          const jobsText = (show.jobs ?? [])
            .map((j) => `${j.title} ${j.startTime} (${j.durationMinutes}m)${j.person?.name ? ` - ${j.person.name}` : ""}`)
            .join("; ");
          return {
            uid: `${event.id}-${show.id}@ordostage`,
            summary: event.title,
            start,
            end,
            venue: show.venue ?? event.venue ?? null,
            descriptionBase: event.description,
            status: show.status ?? event.status,
            categories,
            people: event.people,
            url: `${appBase}/events/${event.id}`,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            eventId: event.id,
            showId: show.id,
            showTime: show.showTime,
            showDurationMinutes: show.durationMinutes,
            contactPerson: event.contactPerson,
            getInTime: event.getInTime,
            setupTime: event.setupTime,
            stageSize: event.stageSize,
            actorCount: event.actorCount,
            allergies: event.allergies,
            customFields: event.customFields,
            technicalNotes: show.technicalNotes,
            fohNotes: show.fohNotes,
            notes: show.notes,
            jobsText,
          };
        });
      }

      if (!event.startDate) return [];
      const fallbackStart = event.startDate;
      const fallbackEnd = event.endDate ?? new Date(fallbackStart.getTime() + 60 * 60 * 1000);
      const categories = normalizeTagList(event.tags);
      categories.unshift("Event");
      return [
        {
          uid: `${event.id}@ordostage`,
          summary: event.title,
          start: fallbackStart,
          end: fallbackEnd,
          venue: event.venue,
          descriptionBase: event.description,
          status: event.status,
          categories,
          people: event.people,
          url: `${appBase}/events/${event.id}`,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          eventId: event.id,
          showId: null,
          showTime: null,
          showDurationMinutes: null,
          contactPerson: event.contactPerson,
          getInTime: event.getInTime,
          setupTime: event.setupTime,
          stageSize: event.stageSize,
          actorCount: event.actorCount,
          allergies: event.allergies,
          customFields: event.customFields,
          technicalNotes: null,
          fohNotes: null,
          notes: null,
          jobsText: "",
        },
      ];
    });

  const vevents = rows
    .map((row) => {
      const dtstart = formatICSDate(row.start);
      const dtend = formatICSDate(row.end);

      const icsStatus = statusMap[row.status] ?? "TENTATIVE";

      // Build rich description
      const parts: string[] = [];
      if (row.descriptionBase) parts.push(row.descriptionBase);
      parts.push(`Event ID: ${row.eventId}`);
      if (row.showId) parts.push(`Show ID: ${row.showId}`);
      if (row.showTime && row.showDurationMinutes != null)
        parts.push(`Show: ${row.showTime} (${row.showDurationMinutes} min)`);
      if (row.contactPerson) parts.push(`Contact: ${row.contactPerson}`);
      if (row.getInTime) parts.push(`Get-in: ${row.getInTime}`);
      if (row.setupTime) parts.push(`Setup: ${row.setupTime}`);
      if (row.stageSize) parts.push(`Stage size: ${row.stageSize}`);
      if (row.actorCount != null) parts.push(`Actor count: ${row.actorCount}`);
      if (row.allergies) parts.push(`Allergies: ${row.allergies}`);
      if (row.technicalNotes) parts.push(`Technical notes: ${row.technicalNotes}`);
      if (row.fohNotes) parts.push(`FOH notes: ${row.fohNotes}`);
      if (row.notes) parts.push(`Show notes: ${row.notes}`);
      if (row.jobsText) parts.push(`Jobs: ${row.jobsText}`);
      if (row.people.length > 0) {
        const peopleList = row.people
          .map((ep: { person: { name: string; role: string | null }; role: string | null }) => {
            const role = ep.role || ep.person.role;
            return role ? `${ep.person.name} (${role})` : ep.person.name;
          })
          .join(", ");
        parts.push(`People: ${peopleList}`);
      }
      if (row.customFields) parts.push(`Custom fields: ${row.customFields}`);
      const meta = parseEventCustomFields(row.customFields);
      if (meta.contacts.length > 0) {
        const contactSummary = meta.contacts
          .map((c) => [c.role, c.name, c.phone, c.email].filter(Boolean).join(" - "))
          .filter(Boolean)
          .join("; ");
        if (contactSummary) parts.push(`Contacts: ${contactSummary}`);
      }
      const fx: string[] = [];
      if (meta.smokeFx) fx.push("Smoke");
      if (meta.hazeFx) fx.push("Haze");
      if (meta.strobeFx) fx.push("Strobe");
      if (fx.length > 0) {
        parts.push(`Effects: ${fx.join(", ")} (audience announcement required)`);
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

      const categoriesLine =
        row.categories && row.categories.length > 0
          ? `CATEGORIES:${escapeICSText(Array.from(new Set(row.categories)).join(","))}`
          : null;
      const urlLine = row.url ? `URL:${escapeICSText(row.url)}` : null;
      const lastModified = `LAST-MODIFIED:${formatICSDate(row.updatedAt)}`;
      const created = `CREATED:${formatICSDate(row.createdAt)}`;
      const sequence = `SEQUENCE:${Math.max(0, Math.floor(row.updatedAt.getTime() / 1000))}`;
      const organizer = `ORGANIZER;CN=${escapeICSText(organizationName)}:mailto:no-reply@ordostage.local`;

      return [
        "BEGIN:VEVENT",
        `UID:${row.uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${escapeICSText(row.summary)}`,
        fullDescription,
        location,
        categoriesLine,
        urlLine,
        organizer,
        lastModified,
        created,
        sequence,
        `STATUS:${icsStatus}`,
        "TRANSP:OPAQUE",
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
    `X-WR-CALDESC:${escapeICSText(`${organizationName} - ${calendarName}`)}`,
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
          status: true,
          showDate: true,
          showTime: true,
          durationMinutes: true,
          technicalNotes: true,
          fohNotes: true,
          notes: true,
          venue: { select: { name: true, addressStreet: true, addressCity: true, addressCountry: true } },
          jobs: {
            select: {
              title: true,
              startTime: true,
              durationMinutes: true,
              person: { select: { name: true } },
            },
            orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
          },
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

  const icsContent = buildICS(calendar.name, calendar.organization.name, events);

  return new Response(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${calendar.name}.ics"`,
    },
  });
});

export default calendarsRouter;
