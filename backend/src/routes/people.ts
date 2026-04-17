import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreatePersonSchema, UpdatePersonSchema } from "../types";
import { canWrite } from "../permissions";

const peopleRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function serializePerson(person: {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  departmentId: string | null;
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
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    email: person.email,
    phone: person.phone,
    address: person.address ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
    departmentId: person.departmentId,
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

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const uniqueAssignments = Array.from(
    new Map(body.teamAssignments.map((assignment) => [assignment.teamId, assignment])).values()
  );
  const uniqueTeamIds = uniqueAssignments.map((assignment) => assignment.teamId);
  const teams = await prisma.department.findMany({
    where: { id: { in: uniqueTeamIds }, organizationId: user.organizationId },
    select: { id: true },
  });
  if (teams.length !== uniqueTeamIds.length) {
    return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
  }

  const person = await prisma.person.create({
    data: {
      name: body.name,
      role: body.role ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      emergencyContactName: body.emergencyContactName ?? null,
      emergencyContactPhone: body.emergencyContactPhone ?? null,
      departmentId: uniqueTeamIds[0] ?? null,
      organizationId: user.organizationId,
      teamMemberships: {
        create: uniqueAssignments.map((assignment) => ({
          departmentId: assignment.teamId,
          role: assignment.role ?? null,
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

// PUT /api/people/:id
peopleRouter.put("/people/:id", zValidator("json", UpdatePersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
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
  let nextAssignments = existing.teamMemberships.map((membership) => ({
    teamId: membership.departmentId,
    role: membership.role ?? undefined,
  }));
  if (body.teamAssignments !== undefined) {
    const dedupedAssignments = Array.from(
      new Map(body.teamAssignments.map((assignment) => [assignment.teamId, assignment])).values()
    );
    const dedupedTeamIds = dedupedAssignments.map((assignment) => assignment.teamId);
    if (dedupedAssignments.length === 0) {
      return c.json(
        { error: { message: "A person must belong to at least one team", code: "BAD_REQUEST" } },
        400
      );
    }
    const teams = await prisma.department.findMany({
      where: { id: { in: dedupedTeamIds }, organizationId: user.organizationId },
      select: { id: true },
    });
    if (teams.length !== dedupedAssignments.length) {
      return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
    }
    nextAssignments = dedupedAssignments;
  }

  const person = await prisma.person.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
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

  if (!canWrite(user.orgRole)) {
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
