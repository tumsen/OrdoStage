import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

/**
 * DELETE /api/me/account — irreversible; body must be { phrase: "DELETETHISACCOUNT" }
 */
const accountRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

accountRouter.delete("/me/account", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  let body: { phrase?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  if (body.phrase !== "DELETETHISACCOUNT") {
    return c.json(
      {
        error: {
          message: 'Confirmation phrase required: send JSON { "phrase": "DELETETHISACCOUNT" }',
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, organizationId: true, orgRole: true },
  });
  if (!user) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  const orgId = user.organizationId;
  if (orgId) {
    const memberCount = await prisma.user.count({ where: { organizationId: orgId } });
    if (user.orgRole === "owner" && memberCount > 1) {
      return c.json(
        {
          error: {
            message: "Transfer ownership to another member before deleting your account.",
            code: "OWNER_MUST_TRANSFER",
          },
        },
        400
      );
    }
  }

  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  if (orgId) {
    const left = await prisma.user.count({ where: { organizationId: orgId } });
    if (left === 0) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  }

  return new Response(null, { status: 204 });
});

export default accountRouter;
