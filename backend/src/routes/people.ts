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
  departmentId: string | null;
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
    departmentId: person.departmentId,
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
  const person = await prisma.person.create({
    data: {
      name: body.name,
      role: body.role ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      departmentId: body.departmentId ?? null,
      organizationId: user.organizationId,
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
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const person = await prisma.person.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.departmentId !== undefined && { departmentId: body.departmentId }),
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
