import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  AddDepartmentMemberSchema,
  UpdateDepartmentMemberRoleSchema,
} from "../types";
import { canAction } from "../requestRole";

const departmentsRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function serializeDepartment(dept: {
  id: string;
  name: string;
  color: string;
  organizationId: string;
  createdAt: Date;
}) {
  return {
    id: dept.id,
    name: dept.name,
    color: dept.color,
    createdAt: dept.createdAt.toISOString(),
  };
}

async function assertDepartmentInOrg(departmentId: string, organizationId: string) {
  return prisma.department.findFirst({
    where: { id: departmentId, organizationId },
    select: { id: true },
  });
}

// GET /api/departments
departmentsRouter.get("/departments", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const departments = await prisma.department.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });

  return c.json({ data: departments.map(serializeDepartment) });
});

// GET /api/departments/:id/members
departmentsRouter.get("/departments/:id/members", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const dept = await assertDepartmentInOrg(id, user.organizationId);
  if (!dept) {
    return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
  }

  const rows = await prisma.personTeam.findMany({
    where: { departmentId: id },
    include: {
      person: { select: { id: true, name: true, role: true, email: true } },
    },
    orderBy: { person: { name: "asc" } },
  });

  return c.json({
    data: rows.map((r) => ({
      personId: r.person.id,
      name: r.person.name,
      email: r.person.email,
      defaultRole: r.person.role,
      roleInTeam: r.role,
    })),
  });
});

// POST /api/departments/:id/members
departmentsRouter.post(
  "/departments/:id/members",
  zValidator("json", AddDepartmentMemberSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

    if (!canAction(c, "write.departments")) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    const dept = await assertDepartmentInOrg(id, user.organizationId);
    if (!dept) {
      return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
    }

    const person = await prisma.person.findFirst({
      where: { id: body.personId, organizationId: user.organizationId },
    });
    if (!person) {
      return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }

    const existing = await prisma.personTeam.findUnique({
      where: {
        personId_departmentId: { personId: body.personId, departmentId: id },
      },
    });
    if (existing) {
      return c.json({ error: { message: "Already a member of this team", code: "CONFLICT" } }, 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      const pt = await tx.personTeam.create({
        data: {
          personId: body.personId,
          departmentId: id,
          role: body.role?.trim() || null,
        },
        include: {
          person: { select: { id: true, name: true, role: true, email: true } },
        },
      });
      if (!person.departmentId) {
        await tx.person.update({
          where: { id: body.personId },
          data: { departmentId: id },
        });
      }
      return pt;
    });

    return c.json(
      {
        data: {
          personId: created.person.id,
          name: created.person.name,
          email: created.person.email,
          defaultRole: created.person.role,
          roleInTeam: created.role,
        },
      },
      201
    );
  }
);

// PATCH /api/departments/:id/members/:personId — role in this team only
departmentsRouter.patch(
  "/departments/:id/members/:personId",
  zValidator("json", UpdateDepartmentMemberRoleSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

    if (!canAction(c, "write.departments")) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }

    const { id, personId } = c.req.param();
    const body = c.req.valid("json");

    const dept = await assertDepartmentInOrg(id, user.organizationId);
    if (!dept) {
      return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
    }

    const link = await prisma.personTeam.findUnique({
      where: {
        personId_departmentId: { personId, departmentId: id },
      },
    });
    if (!link) {
      return c.json({ error: { message: "Not a member of this team", code: "NOT_FOUND" } }, 404);
    }

    const nextRole =
      body.role !== undefined ? (body.role?.trim() || null) : link.role;

    const updated = await prisma.personTeam.update({
      where: {
        personId_departmentId: { personId, departmentId: id },
      },
      data: {
        role: nextRole,
      },
      include: {
        person: { select: { id: true, name: true, role: true, email: true } },
      },
    });

    return c.json({
      data: {
        personId: updated.person.id,
        name: updated.person.name,
        email: updated.person.email,
        defaultRole: updated.person.role,
        roleInTeam: updated.role,
      },
    });
  }
);

// DELETE /api/departments/:id/members/:personId
departmentsRouter.delete("/departments/:id/members/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.departments")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id, personId } = c.req.param();

  const dept = await assertDepartmentInOrg(id, user.organizationId);
  if (!dept) {
    return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
  }

  const link = await prisma.personTeam.findUnique({
    where: {
      personId_departmentId: { personId, departmentId: id },
    },
  });
  if (!link) {
    return c.json({ error: { message: "Not a member of this team", code: "NOT_FOUND" } }, 404);
  }

  const teamCount = await prisma.personTeam.count({
    where: { personId },
  });
  if (teamCount <= 1) {
    return c.json(
      {
        error: {
          message: "A person must belong to at least one team. Add them to another team first.",
          code: "LAST_TEAM",
        },
      },
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.personTeam.delete({
      where: {
        personId_departmentId: { personId, departmentId: id },
      },
    });
    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { departmentId: true },
    });
    const still = await tx.personTeam.findFirst({
      where: { personId },
      orderBy: { createdAt: "asc" },
    });
    if (person?.departmentId === id && still) {
      await tx.person.update({
        where: { id: personId },
        data: { departmentId: still.departmentId },
      });
    }
  });

  return new Response(null, { status: 204 });
});

// POST /api/departments
departmentsRouter.post("/departments", zValidator("json", CreateDepartmentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.departments")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const department = await prisma.department.create({
    data: {
      name: body.name,
      color: body.color ?? "#6366f1",
      organizationId: user.organizationId,
    },
  });

  return c.json({ data: serializeDepartment(department) }, 201);
});

// PUT /api/departments/:id
departmentsRouter.put(
  "/departments/:id",
  zValidator("json", UpdateDepartmentSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

    if (!canAction(c, "write.departments")) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    const existing = await prisma.department.findUnique({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) {
      return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
      },
    });

    return c.json({ data: serializeDepartment(department) });
  }
);

// DELETE /api/departments/:id
departmentsRouter.delete("/departments/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.departments")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.department.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Department not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.department.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default departmentsRouter;
