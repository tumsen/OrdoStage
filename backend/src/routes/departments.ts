import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateDepartmentSchema, UpdateDepartmentSchema } from "../types";
import { canWrite } from "../permissions";

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

// POST /api/departments
departmentsRouter.post("/departments", zValidator("json", CreateDepartmentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
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

    if (!canWrite(user.orgRole)) {
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

  if (!canWrite(user.orgRole)) {
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
