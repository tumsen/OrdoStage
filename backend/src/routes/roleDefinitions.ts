import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { isOwner, isAdmin } from "../permissions";
import { canAction } from "../requestRole";
import { ensureSystemRoles } from "../effectiveRole";
import { ALL_ACTION_IDS, ALL_VIEW_IDS, ACTION_DEFS, VIEW_DEFS } from "../roleCatalog";

function canManagePermissionGroups(
  c: Context,
  orgRole: string | null | undefined
): boolean {
  if (isOwner(orgRole) || isAdmin(orgRole)) return true;
  return canAction(c, "roles.manage");
}

function sanitizeActionsForRoleSlug(slug: string, actions: string[]): string[] {
  // org.delete is owner-only; never allow persisting it on non-owner groups.
  if (slug !== "owner") return actions.filter((a) => a !== "org.delete");
  return actions;
}

const CreateSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, underscore; start with a letter"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  views: z.array(z.string()),
  actions: z.array(z.string()),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  views: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

const roleDefRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

/** Catalog of available view/action keys (for the editor UI). */
roleDefRouter.get("/org/role-definitions/catalog", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  return c.json({
    data: {
      views: VIEW_DEFS,
      actions: ACTION_DEFS,
    },
  });
});

/** List role definitions; bootstraps system roles on first call. */
roleDefRouter.get("/org/role-definitions", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  await ensureSystemRoles(prisma, sessionUser.organizationId);

  const rows = await prisma.roleDefinition.findMany({
    where: { organizationId: sessionUser.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const counts = await prisma.user.groupBy({
    by: ["orgRole"],
    where: { organizationId: sessionUser.organizationId },
    _count: { id: true },
  });
  const memberCountBySlug = Object.fromEntries(counts.map((x) => [x.orgRole, x._count.id]));

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      views: r.views,
      actions: r.actions,
      sortOrder: r.sortOrder,
      isSystem: r.isSystem,
      assignedUserCount: memberCountBySlug[r.slug] ?? 0,
    })),
  });
});

roleDefRouter.post("/org/role-definitions", zValidator("json", CreateSchema), async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { orgRole: true },
  });
  if (!canManagePermissionGroups(c, dbUser?.orgRole)) {
    return c.json(
      { error: { message: "You do not have permission to create permission groups", code: "FORBIDDEN" } },
      403
    );
  }

  const body = c.req.valid("json");
  const reserved = new Set(["owner", "admin"]);
  if (reserved.has(body.slug)) {
    return c.json({ error: { message: "That slug is reserved for a system group", code: "BAD_REQUEST" } }, 400);
  }

  const views = body.views.filter((id) => ALL_VIEW_IDS.includes(id));
  const actions = sanitizeActionsForRoleSlug(
    body.slug,
    body.actions.filter((id) => ALL_ACTION_IDS.includes(id))
  );

  const maxOrder = await prisma.roleDefinition.aggregate({
    where: { organizationId: sessionUser.organizationId },
    _max: { sortOrder: true },
  });

  try {
    const row = await prisma.roleDefinition.create({
      data: {
        organizationId: sessionUser.organizationId,
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        views,
        actions,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        isSystem: false,
      },
    });
    return c.json({ data: row }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return c.json({ error: { message: "A role with that slug already exists", code: "CONFLICT" } }, 409);
    }
    throw e;
  }
});

roleDefRouter.patch("/org/role-definitions/:id", zValidator("json", PatchSchema), async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { orgRole: true },
  });
  if (!canManagePermissionGroups(c, dbUser?.orgRole)) {
    return c.json(
      { error: { message: "You do not have permission to edit permission groups", code: "FORBIDDEN" } },
      403
    );
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.roleDefinition.findFirst({
    where: { id, organizationId: sessionUser.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Role not found", code: "NOT_FOUND" } }, 404);
  }
  if (existing.slug === "owner") {
    return c.json(
      { error: { message: "The system Owner group cannot be changed.", code: "FORBIDDEN" } },
      403
    );
  }

  const data: {
    name?: string;
    description?: string | null;
    views?: string[];
    actions?: string[];
    sortOrder?: number;
  } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.views !== undefined) data.views = body.views.filter((x) => ALL_VIEW_IDS.includes(x));
  if (body.actions !== undefined) {
    const act = sanitizeActionsForRoleSlug(
      existing.slug,
      body.actions.filter((x) => ALL_ACTION_IDS.includes(x))
    );
    data.actions = act;
  }
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const updated = await prisma.roleDefinition.update({
    where: { id },
    data,
  });

  return c.json({ data: updated });
});

roleDefRouter.delete("/org/role-definitions/:id", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { orgRole: true },
  });
  if (!canManagePermissionGroups(c, dbUser?.orgRole)) {
    return c.json(
      { error: { message: "You do not have permission to delete permission groups", code: "FORBIDDEN" } },
      403
    );
  }

  const { id } = c.req.param();

  const existing = await prisma.roleDefinition.findFirst({
    where: { id, organizationId: sessionUser.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Role not found", code: "NOT_FOUND" } }, 404);
  }
  if (existing.slug === "owner" || existing.slug === "admin") {
    return c.json({ error: { message: "System groups cannot be deleted", code: "FORBIDDEN" } }, 403);
  }

  const assigned = await prisma.user.count({
    where: { organizationId: sessionUser.organizationId, orgRole: existing.slug },
  });
  if (assigned > 0) {
    return c.json(
      {
        error: {
          message: `Cannot delete: ${assigned} user(s) still have this role. Reassign them first.`,
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  const peopleUsing = await prisma.person.count({
    where: { organizationId: sessionUser.organizationId, permissionGroupId: id },
  });
  if (peopleUsing > 0) {
    return c.json(
      {
        error: {
          message: `Cannot delete: ${peopleUsing} person(s) are assigned this group. Reassign them first.`,
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  await prisma.roleDefinition.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default roleDefRouter;
