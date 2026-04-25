import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreatePersonSchema,
  UpdatePersonSchema,
  PersonActiveSchema,
  UpdatePersonDocumentSchema,
  type TeamAssignmentInput,
} from "../types";
import { canAction } from "../requestRole";
import { isPostgresDatabaseUrl } from "../databaseUrl";

const TEAM_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4"];

/** `YYYY-MM-DD` (local calendar day) or any date string `Date` can parse. */
function parsePersonDocumentExpiresAtInput(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const peopleRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

/** Validates RoleDefinition for this org; owner group only for the org owner user’s email. */
async function assertValidPermissionGroup(
  organizationId: string,
  groupId: string | null | undefined,
  personEmail: string | null | undefined
): Promise<void> {
  if (!groupId) {
    if (personEmail?.trim()) {
      throw new Error("Permission group is required when the person has an email.");
    }
    return;
  }
  const g = await prisma.roleDefinition.findFirst({
    where: { id: groupId, organizationId },
  });
  if (!g) {
    throw new Error("Invalid permission group.");
  }
  if (g.slug === "owner") {
    const e = personEmail?.trim();
    if (!e) {
      throw new Error("The Owner group can only be assigned when the person has the owner’s email.");
    }
    const owner = await prisma.user.findFirst({
      where: { organizationId, orgRole: "owner" },
      select: { email: true },
    });
    if (!owner || owner.email.toLowerCase() !== e.toLowerCase()) {
      throw new Error("The Owner group can only be assigned to the organization owner.");
    }
  }
}

/** Keeps `User.orgRole` in sync when a linked account matches this person’s email. */
async function syncUserOrgRoleFromPerson(
  organizationId: string,
  personEmail: string | null | undefined,
  permissionGroupId: string | null | undefined
): Promise<void> {
  if (!personEmail?.trim() || !permissionGroupId) return;
  const g = await prisma.roleDefinition.findFirst({
    where: { id: permissionGroupId, organizationId },
    select: { slug: true },
  });
  if (!g) return;
  let u = await prisma.user.findUnique({ where: { email: personEmail.trim().toLowerCase() } });
  if (!u && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    u = await prisma.user.findFirst({
      where: { email: { equals: personEmail.trim(), mode: "insensitive" } },
    });
  }
  if (!u || u.organizationId !== organizationId) return;
  await prisma.user.update({
    where: { id: u.id },
    data: { orgRole: g.slug },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: u.id, organizationId } },
    create: { userId: u.id, organizationId, orgRole: g.slug },
    update: { orgRole: g.slug },
  });
}

/** Resolve checkbox teamIds + typed new team names → unique department memberships. */
async function resolveAssignmentTeamIds(
  organizationId: string,
  assignments: TeamAssignmentInput[]
): Promise<Array<{ teamId: string; role: string | null }>> {
  const departments = await prisma.department.findMany({ where: { organizationId } });
  const findByName = (name: string) =>
    departments.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());

  const resolved: Array<{ teamId: string; role: string | null }> = [];
  let colorIdx = departments.length;

  for (const a of assignments) {
    const role = a.role?.trim() ? a.role.trim() : null;
    const newName = a.newTeamName?.trim();
    const tid = a.teamId?.trim();
    if (newName) {
      let dept = findByName(newName);
      if (!dept) {
        dept = await prisma.department.create({
          data: {
            name: newName,
            organizationId,
            color: TEAM_COLORS[colorIdx % TEAM_COLORS.length],
          },
        });
        departments.push(dept);
        colorIdx++;
      }
      resolved.push({ teamId: dept.id, role });
    } else if (tid) {
      resolved.push({ teamId: tid, role });
    }
  }

  const dedup = new Map<string, { teamId: string; role: string | null }>();
  for (const r of resolved) {
    dedup.set(r.teamId, r);
  }
  return Array.from(dedup.values());
}

function serializePerson(person: {
  id: string;
  name: string;
  role: string | null;
  affiliation: string;
  email: string | null;
  phone: string | null;
  addressStreet:  string | null;
  addressNumber:  string | null;
  addressZip:     string | null;
  addressCity:    string | null;
  addressState:   string | null;
  addressCountry: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes?: string | null;
  photoData?: Uint8Array | null;
  photoUpdatedAt?: Date | null;
  departmentId: string | null;
  isActive?: boolean;
  teamMemberships?: Array<{
    departmentId: string;
    role: string | null;
    department: {
      id: string;
      name: string;
      color: string;
      createdAt: Date;
    };
  }>;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  permissionGroupId?: string | null;
  permissionGroup?: { id: string; name: string; slug: string } | null;
}) {
  const aff =
    person.affiliation === "external" ? "external" : "internal";
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    affiliation: aff,
    permissionGroupId: person.permissionGroupId ?? null,
    permissionGroup: person.permissionGroup
      ? {
          id: person.permissionGroup.id,
          name: person.permissionGroup.name,
          slug: person.permissionGroup.slug,
        }
      : null,
    email: person.email,
    phone: person.phone,
    addressStreet:  person.addressStreet  ?? null,
    addressNumber:  person.addressNumber  ?? null,
    addressZip:     person.addressZip     ?? null,
    addressCity:    person.addressCity    ?? null,
    addressState:   person.addressState   ?? null,
    addressCountry: person.addressCountry ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
    notes: person.notes ?? null,
    hasPhoto: Boolean(person.photoData),
    photoUpdatedAt: person.photoUpdatedAt ? person.photoUpdatedAt.toISOString() : null,
    departmentId: person.departmentId,
    isActive: person.isActive ?? true,
    teamIds: (person.teamMemberships ?? []).map((membership) => membership.departmentId),
    teams: (person.teamMemberships ?? []).map((membership) => ({
      id: membership.department.id,
      name: membership.department.name,
      color: membership.department.color,
      createdAt: membership.department.createdAt.toISOString(),
    })),
    teamMemberships: (person.teamMemberships ?? []).map((membership) => ({
      teamId: membership.departmentId,
      role: membership.role ?? null,
    })),
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function canEditOwnProfile(user: { email: string }, personEmail: string | null): boolean {
  if (!personEmail) return false;
  return personEmail.toLowerCase() === user.email.toLowerCase();
}

// GET /api/people
peopleRouter.get("/people", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  return c.json({ data: people.map(serializePerson) });
});

// GET /api/people/me — current user's linked person profile in active organization
peopleRouter.get("/people/me", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!user.email) {
    return c.json({ data: null });
  }

  let person = await prisma.person.findFirst({
    where: {
      organizationId: user.organizationId,
      email: user.email,
    },
    include: {
      teamMemberships: { include: { department: true } },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!person && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    person = await prisma.person.findFirst({
      where: {
        organizationId: user.organizationId,
        email: { equals: user.email, mode: "insensitive" },
      },
      include: {
        teamMemberships: { include: { department: true } },
        permissionGroup: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return c.json({ data: person ? serializePerson(person) : null });
});

// POST /api/people
peopleRouter.post("/people", zValidator("json", CreatePersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  try {
    await assertValidPermissionGroup(user.organizationId, body.permissionGroupId, body.email);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid permission group";
    return c.json({ error: { message, code: "BAD_REQUEST" } }, 400);
  }

  const resolved = await resolveAssignmentTeamIds(user.organizationId, body.teamAssignments);
  if (resolved.length === 0) {
    return c.json({ error: { message: "Could not resolve any team assignments", code: "BAD_REQUEST" } }, 400);
  }

  const teamIds = resolved.map((r) => r.teamId);
  const teamsFound = await prisma.department.findMany({
    where: { id: { in: teamIds }, organizationId: user.organizationId },
    select: { id: true },
  });
  if (teamsFound.length !== teamIds.length) {
    return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
  }

  const person = await prisma.person.create({
    data: {
      name: body.name,
      affiliation: body.affiliation,
      role: body.role ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      addressStreet:  body.addressStreet  ?? null,
      addressNumber:  body.addressNumber  ?? null,
      addressZip:     body.addressZip     ?? null,
      addressCity:    body.addressCity    ?? null,
      addressState:   body.addressState   ?? null,
      addressCountry: body.addressCountry ?? null,
      emergencyContactName: body.emergencyContactName ?? null,
      emergencyContactPhone: body.emergencyContactPhone ?? null,
      ...(body.notes !== undefined && { notes: body.notes ?? null }),
      ...(body.permissionGroupId && { permissionGroupId: body.permissionGroupId }),
      departmentId: teamIds[0] ?? null,
      organizationId: user.organizationId,
      teamMemberships: {
        create: resolved.map((assignment) => ({
          departmentId: assignment.teamId,
          role: assignment.role,
        })),
      },
    },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  await syncUserOrgRoleFromPerson(user.organizationId, person.email, person.permissionGroupId);
  return c.json({ data: serializePerson(person) }, 201);
});

// GET /api/people/:id
peopleRouter.get("/people/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: serializePerson(person) });
});

// PATCH /api/people/:id/active — deactivate costs credits (owner setting); activate is free
peopleRouter.patch("/people/:id/active", zValidator("json", PersonActiveSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const { active } = c.req.valid("json");

  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }

  if (existing.isActive === active) {
    const full = await prisma.person.findUnique({
      where: { id },
      include: { teamMemberships: { include: { department: true } } },
    });
    return c.json({ data: serializePerson(full!) });
  }

  if (!active) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);

    const cost = org.deactivatePersonCredits ?? 20;
    if (!org.unlimitedCredits && org.creditBalance < cost) {
      return c.json(
        {
          error: {
            message: `Not enough credits to deactivate (${cost} required).`,
            code: "INSUFFICIENT_CREDITS",
            creditsRequired: cost,
            balance: org.creditBalance,
          },
        },
        402
      );
    }

    await prisma.$transaction(async (tx) => {
      if (!org.unlimitedCredits) {
        await tx.organization.update({
          where: { id: org.id },
          data: { creditBalance: org.creditBalance - cost },
        });
        await tx.creditLog.create({
          data: {
            organizationId: org.id,
            delta: -cost,
            reason: "person_deactivate",
            note: `${existing.name} (${existing.id})`,
          },
        });
      }
      await tx.person.update({
        where: { id },
        data: { isActive: false },
      });
    });
  } else {
    await prisma.person.update({
      where: { id },
      data: { isActive: true },
    });
  }

  const updated = await prisma.person.findUnique({
    where: { id },
    include: { teamMemberships: { include: { department: true } } },
  });
  return c.json({ data: serializePerson(updated!) });
});

// PUT /api/people/:id
peopleRouter.put("/people/:id", zValidator("json", UpdatePersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const body = c.req.valid("json");
  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    include: {
      teamMemberships: {
        include: { department: true },
      },
    },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, existing.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  if (!canWritePeople && body.teamAssignments !== undefined) {
    return c.json(
      { error: { message: "Only managers can change team assignments.", code: "FORBIDDEN" } },
      403
    );
  }
  if (!canWritePeople && body.affiliation !== undefined) {
    return c.json(
      { error: { message: "Only managers can change affiliation.", code: "FORBIDDEN" } },
      403
    );
  }
  if (body.permissionGroupId !== undefined && !canWritePeople) {
    return c.json(
      { error: { message: "You cannot change the permission group for this person.", code: "FORBIDDEN" } },
      403
    );
  }
  const nextEmail =
    body.email !== undefined ? (body.email?.trim() ? body.email : null) : existing.email;
  if (body.permissionGroupId !== undefined || body.email !== undefined) {
    const nextGroupId =
      body.permissionGroupId !== undefined ? body.permissionGroupId : existing.permissionGroupId;
    try {
      await assertValidPermissionGroup(user.organizationId, nextGroupId, nextEmail);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid permission group";
      return c.json({ error: { message, code: "BAD_REQUEST" } }, 400);
    }
  }
  let nextAssignments: Array<{ teamId: string; role?: string | undefined }> = existing.teamMemberships.map(
    (membership) => ({
      teamId: membership.departmentId,
      role: membership.role ?? undefined,
    })
  );
  if (body.teamAssignments !== undefined) {
    const resolved = await resolveAssignmentTeamIds(user.organizationId, body.teamAssignments);
    if (resolved.length === 0) {
      return c.json(
        { error: { message: "A person must belong to at least one team", code: "BAD_REQUEST" } },
        400
      );
    }
    const teamIds = resolved.map((r) => r.teamId);
    const teamsFound = await prisma.department.findMany({
      where: { id: { in: teamIds }, organizationId: user.organizationId },
      select: { id: true },
    });
    if (teamsFound.length !== teamIds.length) {
      return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
    }
    nextAssignments = resolved.map((r) => ({ teamId: r.teamId, role: r.role ?? undefined }));
  }

  const person = await prisma.person.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.affiliation !== undefined && { affiliation: body.affiliation }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.addressStreet  !== undefined && { addressStreet:  body.addressStreet }),
      ...(body.addressNumber  !== undefined && { addressNumber:  body.addressNumber }),
      ...(body.addressZip     !== undefined && { addressZip:     body.addressZip }),
      ...(body.addressCity    !== undefined && { addressCity:    body.addressCity }),
      ...(body.addressState   !== undefined && { addressState:   body.addressState }),
      ...(body.addressCountry !== undefined && { addressCountry: body.addressCountry }),
      ...(body.emergencyContactName !== undefined && { emergencyContactName: body.emergencyContactName }),
      ...(body.emergencyContactPhone !== undefined && { emergencyContactPhone: body.emergencyContactPhone }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.permissionGroupId !== undefined && { permissionGroupId: body.permissionGroupId }),
      ...(body.teamAssignments !== undefined && { departmentId: nextAssignments[0]?.teamId ?? null }),
      ...(body.teamAssignments !== undefined && {
        teamMemberships: {
          deleteMany: {},
          create: nextAssignments.map((assignment) => ({
            departmentId: assignment.teamId,
            role: assignment.role ?? null,
          })),
        },
      }),
    },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  await syncUserOrgRoleFromPerson(user.organizationId, person.email, person.permissionGroupId);
  return c.json({ data: serializePerson(person) });
});

// GET /api/people/:id/documents
peopleRouter.get("/people/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const docs = await prisma.personDocument.findMany({
    where: { personId: person.id },
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({
    data: docs.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    })),
  });
});

// POST /api/people/:id/photo
peopleRouter.post("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "Photo file is required", code: "BAD_REQUEST" } }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: { message: "Photo must be an image", code: "BAD_REQUEST" } }, 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.person.update({
    where: { id: person.id },
    data: {
      photoData: bytes,
      photoFilename: file.name,
      photoMimeType: file.type || "application/octet-stream",
      photoUpdatedAt: new Date(),
    },
  });
  return c.json({ data: { ok: true } }, 201);
});

// GET /api/people/:id/photo
peopleRouter.get("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { photoData: true, photoMimeType: true, photoFilename: true },
  });
  if (!person || !person.photoData) {
    return c.json({ error: { message: "Photo not found", code: "NOT_FOUND" } }, 404);
  }
  return new Response(person.photoData, {
    headers: {
      "Content-Type": person.photoMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${person.photoFilename || "photo"}"`,
      "Content-Length": String(person.photoData.length),
      "Cache-Control": "private, max-age=60",
    },
  });
});

// DELETE /api/people/:id/photo
peopleRouter.delete("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  await prisma.person.update({
    where: { id: person.id },
    data: {
      photoData: null,
      photoFilename: null,
      photoMimeType: null,
      photoUpdatedAt: null,
    },
  });
  return new Response(null, { status: 204 });
});

// POST /api/people/:id/documents
peopleRouter.post("/people/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = formData["name"];
  const type = formData["type"];
  const expiresField = formData["expiresAt"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  const rawName = typeof name === "string" && name.trim() ? name.trim() : file.name;
  const rawType = typeof type === "string" && type.trim() ? type.trim() : "other";
  let expiresAt: Date | null = null;
  if (typeof expiresField === "string" && expiresField.trim()) {
    const d = parsePersonDocumentExpiresAtInput(expiresField);
    if (!d) {
      return c.json({ error: { message: "Invalid expiration date", code: "BAD_REQUEST" } }, 400);
    }
    expiresAt = d;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const document = await prisma.personDocument.create({
    data: {
      personId: person.id,
      name: rawName,
      type: rawType,
      filename: file.name,
      data: bytes,
      mimeType: file.type || "application/octet-stream",
      expiresAt,
    },
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return c.json(
    {
      data: {
        ...document,
        createdAt: document.createdAt.toISOString(),
        expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      },
    },
    201
  );
});

// PATCH /api/people/documents/:docId — name & expiration (metadata)
peopleRouter.patch("/people/documents/:docId", zValidator("json", UpdatePersonDocumentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const body = c.req.valid("json");
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: { id: true, person: { select: { email: true } } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const d = parsePersonDocumentExpiresAtInput(body.expiresAt);
    if (!d) {
      return c.json({ error: { message: "Invalid expiration date", code: "BAD_REQUEST" } }, 400);
    }
  }
  const updated = await prisma.personDocument.update({
    where: { id: doc.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.expiresAt !== undefined && {
        expiresAt: body.expiresAt === null ? null : parsePersonDocumentExpiresAtInput(body.expiresAt),
      }),
    },
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return c.json({
    data: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
    },
  });
});

// GET /api/people/documents/:docId/download
peopleRouter.get("/people/documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
      "Content-Length": String(doc.data.length),
    },
  });
});

// DELETE /api/people/documents/:docId
peopleRouter.delete("/people/documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: { id: true, person: { select: { email: true } } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  await prisma.personDocument.delete({ where: { id: doc.id } });
  return new Response(null, { status: 204 });
});

// DELETE /api/people/:id
peopleRouter.delete("/people/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.person.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default peopleRouter;
