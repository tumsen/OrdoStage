import { isAPIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { env, isDeployedRuntime } from "./env";
import { findUserByEmailLoose } from "./findUserByEmail";
import { createPasswordResetTokenAndSendEmail } from "./passwordResetFlow";
import { sendHtmlEmail } from "./resendMail";

export type AccountSetupResult =
  | { status: "skipped" }
  | { status: "sent"; createdUser: boolean }
  | { status: "failed"; error: string };

async function sendExistingUserAddedOrgEmail(input: { to: string; organizationName: string; roleName: string }) {
  const subject = `You've been added to ${input.organizationName} in OrdoStage`;
  const html = `
    <p>Hello,</p>
    <p>You have been added as a user in <strong>${input.organizationName}</strong> with the role <strong>${input.roleName}</strong>.</p>
    <p>You use the <strong>same login email and password</strong> for all organizations in OrdoStage.</p>
    <p>Just sign in as usual and choose the organization from your workspace list.</p>
  `;

  if (env.RESEND_API_KEY?.trim()) {
    await sendHtmlEmail({
      to: input.to,
      subject,
      html,
      text: `${subject}\n\nYou've been added to ${input.organizationName} with role ${input.roleName}.`,
    });
    return;
  }
  if (isDeployedRuntime()) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  console.log(`[DEV] Multi-org invite email to ${input.to}: ${subject}`);
}

/**
 * Provisions a `User` + `OrganizationMembership` (when the person has app access via email
 * and permission group) and sends a password set/reset link. Idempotent: existing users
 * get membership for this org and a new reset email.
 */
export async function provisionPersonAppAccountAndEmail(opts: {
  organizationId: string;
  personName: string;
  email: string | null | undefined;
  permissionGroupId: string | null | undefined;
}): Promise<AccountSetupResult> {
  const groupId = opts.permissionGroupId?.trim();
  const rawEmail = opts.email?.trim();
  if (!rawEmail || !groupId) {
    return { status: "skipped" };
  }

  const group = await prisma.roleDefinition.findFirst({
    where: { id: groupId, organizationId: opts.organizationId },
    select: { slug: true, name: true },
  });
  if (!group) {
    return { status: "failed", error: "Invalid permission group" };
  }
  const orgRoleSlug = group.slug;

  const emailNorm = rawEmail.toLowerCase();

  let u = await findUserByEmailLoose(rawEmail);
  let createdUser = false;

  if (!u) {
    const tempPassword = generateRandomString(32);
    try {
      const result = (await auth.api.signUpEmail({
        body: {
          name: opts.personName.trim() || emailNorm,
          email: emailNorm,
          password: tempPassword,
        },
      })) as { user?: { id: string } } | void;
      if (result && typeof result === "object" && "user" in result && result.user) {
        createdUser = true;
        u = await prisma.user.findUnique({ where: { id: result.user.id } });
      }
    } catch (e: unknown) {
      if (isAPIError(e)) {
        const msg = e.message?.toLowerCase() || "";
        if (msg.includes("exists") || msg.includes("already") || (e as { code?: string }).code === "USER_ALREADY_EXISTS") {
          u = await findUserByEmailLoose(rawEmail);
        } else {
          return { status: "failed", error: e.message || "Could not create user account" };
        }
      } else {
        return { status: "failed", error: e instanceof Error ? e.message : "Sign up failed" };
      }
    }
    if (!u) u = await findUserByEmailLoose(rawEmail);
  }

  if (!u) {
    return { status: "failed", error: "Could not create or look up a user for this email" };
  }

  const existingOtherMembershipCount = await prisma.organizationMembership.count({
    where: { userId: u.id, organizationId: { not: opts.organizationId } },
  });
  const isExistingMultiOrgInvite = !createdUser && existingOtherMembershipCount > 0;

  if (!u.organizationId || u.organizationId === opts.organizationId) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        organizationId: opts.organizationId,
        orgRole: orgRoleSlug,
        isActive: true,
      },
    });
  }

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: u.id, organizationId: opts.organizationId } },
    create: { userId: u.id, organizationId: opts.organizationId, orgRole: orgRoleSlug },
    update: { orgRole: orgRoleSlug },
  });

  try {
    if (isExistingMultiOrgInvite) {
      const org = await prisma.organization.findUnique({
        where: { id: opts.organizationId },
        select: { name: true },
      });
      await sendExistingUserAddedOrgEmail({
        to: u.email,
        organizationName: org?.name || "your organization",
        roleName: group.name || group.slug,
      });
    } else {
      await createPasswordResetTokenAndSendEmail(u.email);
    }
  } catch (e: unknown) {
    if (isAPIError(e)) {
      return { status: "failed", error: e.message || "Failed to send app access email" };
    }
    return { status: "failed", error: e instanceof Error ? e.message : "Failed to send app access email" };
  }

  return { status: "sent", createdUser };
}

export function accountSetupEmailForResponse(r: AccountSetupResult) {
  if (r.status === "skipped") return { status: "skipped" as const };
  if (r.status === "failed") return { status: "failed" as const, error: r.error };
  return { status: "sent" as const, createdUser: r.createdUser };
}
