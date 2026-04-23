import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateInvitationSchema, UpdateRoleSchema } from "../types";
import { isOwner } from "../permissions";
import { canManageTeamRequest } from "../requestRole";
import { env } from "../env";

const INVITE_DAYS = 14;

function inviteAcceptUrl(token: string): string {
  const base = (env.FRONTEND_URL || env.BACKEND_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

async function sendInvitationEmail(to: string, orgName: string, acceptUrl: string) {
  const subject = `You're invited to ${orgName} on OrdoStage`;
  const html = `
    <p>You've been invited to join <strong>${orgName}</strong> on OrdoStage.</p>
    <p><a href="${acceptUrl}">Accept invitation</a></p>
    <p style="color:#666;font-size:12px">This link expires in ${INVITE_DAYS} days.</p>
  `;
  if (env.RESEND_API_KEY && env.FROM_EMAIL) {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.FROM_EMAIL,
      to,
      subject,
      html,
    });
  } else {
    console.log(`[INVITE EMAIL] to=${to} url=${acceptUrl}`);
  }
}

const teamRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

// GET /api/team — list all users in the org with role
teamRouter.get("/team", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: user.organizationId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true,
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const serialized = memberships.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    orgRole: row.orgRole,
    isActive: row.user.isActive,
    departmentId: null as string | null,
    department: null as { id: string; name: string; color: string; createdAt: string } | null,
    createdAt: row.user.createdAt.toISOString(),
  }));

  return c.json({ data: serialized });
});

// GET /api/team/invitations — pending invitations
teamRouter.get("/team/invitations", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canManageTeamRequest(c)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const rows = await prisma.organizationInvitation.findMany({
    where: { organizationId: user.organizationId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const data = rows
    .filter((r) => r.expiresAt > now)
    .map((r) => ({
      id: r.id,
      email: r.email,
      orgRole: r.orgRole,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));

  return c.json({ data });
});

// POST /api/team/invitations — create + email
teamRouter.post("/team/invitations", zValidator("json", CreateInvitationSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canManageTeamRequest(c)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const email = body.email.trim().toLowerCase();

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true },
  });
  if (!org) return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId: existingUser.id, organizationId: user.organizationId },
      },
    });
    if (already) {
      return c.json({ error: { message: "That user is already in your organization", code: "BAD_REQUEST" } }, 400);
    }
  }

  await prisma.organizationInvitation.deleteMany({
    where: {
      organizationId: user.organizationId,
      email,
      acceptedAt: null,
    },
  });

  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const invite = await prisma.organizationInvitation.create({
    data: {
      organizationId: user.organizationId,
      email,
      orgRole: body.role,
      invitedById: user.id,
      expiresAt,
    },
  });

  const url = inviteAcceptUrl(invite.token);
  try {
    await sendInvitationEmail(email, org.name, url);
  } catch (e) {
    console.error("[INVITE EMAIL]", e);
  }

  return c.json(
    {
      data: {
        id: invite.id,
        email: invite.email,
        orgRole: invite.orgRole,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
    },
    201
  );
});

// DELETE /api/team/invitations/:id — cancel pending invite
teamRouter.delete("/team/invitations/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canManageTeamRequest(c)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const inv = await prisma.organizationInvitation.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!inv) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  await prisma.organizationInvitation.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// POST /api/team/invitations/:id/resend — resend pending invite email
teamRouter.post("/team/invitations/:id/resend", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canManageTeamRequest(c)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const invite = await prisma.organizationInvitation.findFirst({
    where: { id, organizationId: user.organizationId, acceptedAt: null },
    include: { organization: { select: { name: true } } },
  });
  if (!invite) {
    return c.json({ error: { message: "Invitation not found", code: "NOT_FOUND" } }, 404);
  }

  // Recreate invitation so createdAt reflects the latest send time.
  await prisma.organizationInvitation.delete({ where: { id: invite.id } });
  const refreshed = await prisma.organizationInvitation.create({
    data: {
      organizationId: invite.organizationId,
      email: invite.email,
      orgRole: invite.orgRole,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const url = inviteAcceptUrl(refreshed.token);
  try {
    await sendInvitationEmail(refreshed.email, invite.organization.name, url);
  } catch (e) {
    console.error("[INVITE RESEND EMAIL]", e);
    return c.json(
      { error: { message: "Failed to send invitation email", code: "EMAIL_SEND_FAILED" } },
      502
    );
  }

  return c.json({
    data: {
      id: refreshed.id,
      email: refreshed.email,
      orgRole: refreshed.orgRole,
      expiresAt: refreshed.expiresAt.toISOString(),
      createdAt: refreshed.createdAt.toISOString(),
    },
  });
});

// POST /api/team/invitations/accept — authenticated user accepts invite
teamRouter.post("/team/invitations/accept", async (c) => {
  const user = c.get("user");
  if (!user?.id) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return c.json({ error: { message: "Token is required", code: "BAD_REQUEST" } }, 400);
  }

  const invite = await prisma.organizationInvitation.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (!invite || invite.acceptedAt) {
    return c.json({ error: { message: "Invalid or expired invitation", code: "NOT_FOUND" } }, 404);
  }
  if (invite.expiresAt < new Date()) {
    return c.json({ error: { message: "Invitation has expired", code: "GONE" } }, 410);
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  if (dbUser.email.toLowerCase() !== invite.email.toLowerCase()) {
    return c.json(
      {
        error: {
          message: "Sign in with the email address that received the invitation.",
          code: "EMAIL_MISMATCH",
        },
      },
      403
    );
  }

  await prisma.$transaction([
    prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: invite.organizationId },
      },
      create: {
        userId: user.id,
        organizationId: invite.organizationId,
        orgRole: invite.orgRole,
      },
      update: { orgRole: invite.orgRole },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        organizationId: invite.organizationId,
        orgRole: invite.orgRole,
        isActive: true,
      },
    }),
    prisma.organizationInvitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return c.json({ data: { organizationId: invite.organizationId, orgRole: invite.orgRole } });
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

  const targetMem = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: user.organizationId },
    },
    include: { user: true },
  });

  if (!targetMem) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.organizationMembership.update({
    where: {
      userId_organizationId: { userId, organizationId: user.organizationId },
    },
    data: { orgRole: body.role },
  });

  if (targetMem.user.organizationId === user.organizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { orgRole: body.role },
    });
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      organizationId: true,
    },
  });
  if (!updated) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      orgRole: body.role,
      isActive: updated.isActive,
      departmentId: null as string | null,
      department: null as { id: string; name: string; color: string; createdAt: string } | null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// PUT /api/team/:userId/active — owner or manager (cannot deactivate owner except self handled)
teamRouter.put("/team/:userId/active", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canManageTeamRequest(c)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { userId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const isActive = typeof body.isActive === "boolean" ? body.isActive : null;
  if (isActive === null) {
    return c.json({ error: { message: "isActive boolean required", code: "BAD_REQUEST" } }, 400);
  }

  if (userId === user.id) {
    return c.json({ error: { message: "You cannot change your own active status", code: "FORBIDDEN" } }, 403);
  }

  const targetMem = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: user.organizationId },
    },
    include: { user: true },
  });
  if (!targetMem) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  if (targetMem.orgRole === "owner" && !isOwner(user.orgRole)) {
    return c.json({ error: { message: "Only the owner can deactivate an owner", code: "FORBIDDEN" } }, 403);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });

  if (!isActive) {
    await prisma.session.deleteMany({ where: { userId } });
  }

  return c.json({ data: { id: userId, isActive } });
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

  if (userId === user.id) {
    return c.json({ error: { message: "Cannot remove yourself", code: "FORBIDDEN" } }, 403);
  }

  const targetMem = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: user.organizationId },
    },
    include: { user: true },
  });

  if (!targetMem) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.organizationMembership.delete({
    where: {
      userId_organizationId: { userId, organizationId: user.organizationId },
    },
  });

  const other = await prisma.organizationMembership.findFirst({
    where: { userId, organizationId: { not: user.organizationId } },
  });

  if (targetMem.user.organizationId === user.organizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: other?.organizationId ?? null,
        orgRole: other?.orgRole ?? "member",
        isActive: true,
      },
    });
  }

  await prisma.session.deleteMany({ where: { userId } });

  return new Response(null, { status: 204 });
});

export default teamRouter;
