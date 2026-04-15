import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { deductCredits } from "../credits";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

// GET /api/org — get current org info + credit status
app.get("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!user.organizationId) return c.json({ error: { message: "No organization", code: "NO_ORG" } }, 404);

  const credits = await deductCredits(user.organizationId);
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    include: { _count: { select: { users: true } } },
  });

  return c.json({ data: { ...org, ...credits } });
});

// POST /api/org — create org (called after first login)
app.post("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  // Check if user already has an org
  const existingUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (existingUser?.organizationId) {
    return c.json({ error: { message: "Already in an organization", code: "ALREADY_IN_ORG" } }, 400);
  }

  const org = await prisma.organization.create({
    data: {
      name,
      users: { connect: { id: user.id } },
    },
  });

  // Update user role to owner
  await prisma.user.update({ where: { id: user.id }, data: { orgRole: "owner" } });

  return c.json({ data: org }, 201);
});

export default app;
