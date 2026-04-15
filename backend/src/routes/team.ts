import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { UpdateRoleSchema } from "../types";
import { isOwner } from "../permissions";

const teamRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

// GET /api/team — list all users in the org with role + department
teamRouter.get("/team", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      orgRole: true,
      createdAt: true,
    },
  });

  // Get people linked to these users (if any) — team members may also be persons with departments
  // For now, team members are User records, not Person records.
  // We return departmentId as null since User doesn't have departmentId directly.
  const serialized = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    orgRole: m.orgRole,
    departmentId: null as string | null,
    department: null as { id: string; name: string; color: string; createdAt: string } | null,
    createdAt: m.createdAt.toISOString(),
  }));

  return c.json({ data: serialized });
});

// PUT /api/team/:userId/role — owner only, change role
teamRouter.put("/team/:userId/role", zValidator("json", UpdateRoleSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!isOwner(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { userId } = c.req.param();
  const body = c.req.valid("json");

  // Verify target user is in the same org
  const target = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { orgRole: body.role },
    select: {
      id: true,
      name: true,
      email: true,
      orgRole: true,
      createdAt: true,
    },
  });

  return c.json({
    data: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      orgRole: updated.orgRole,
      departmentId: null as string | null,
      department: null as { id: string; name: string; color: string; createdAt: string } | null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// DELETE /api/team/:userId — owner only, remove from org
teamRouter.delete("/team/:userId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!isOwner(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { userId } = c.req.param();

  // Prevent removing yourself
  if (userId === user.id) {
    return c.json({ error: { message: "Cannot remove yourself", code: "FORBIDDEN" } }, 403);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      organizationId: null,
      orgRole: "viewer",
    },
  });

  return new Response(null, { status: 204 });
});

export default teamRouter;
