import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreatePersonSchema,
  UpdatePersonSchema,
  PersonActiveSchema,
  type TeamAssignmentInput,
} from "../types";
import { canAction } from "../requestRole";

const TEAM_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4"];

const peopleRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

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
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
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
}) {
  const aff =
    person.affiliation === "external" ? "external" : "internal";
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    affiliation: aff,
    email: person.email,
    phone: person.phone,
    address: person.address ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
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
    },
  });
  return c.json({ data: people.map(serializePerson) });
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
      address: body.address ?? null,
      emergencyContactName: body.emergencyContactName ?? null,
      emergencyContactPhone: body.emergencyContactPhone ?? null,
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
    },
  });
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

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

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
      ...(body.address !== undefined && { address: body.address }),
      ...(body.emergencyContactName !== undefined && { emergencyContactName: body.emergencyContactName }),
      ...(body.emergencyContactPhone !== undefined && { emergencyContactPhone: body.emergencyContactPhone }),
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
    },
  });
  return c.json({ data: serializePerson(person) });
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
