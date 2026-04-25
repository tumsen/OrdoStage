import type { PrismaClient } from "@prisma/client";

/**
 * Before deleting an organization:
 * Point every user whose active org is this one to another membership (if any).
 */
export async function reassignUsersBeforeOrgDelete(
  prisma: PrismaClient,
  organizationId: string
): Promise<void> {
  // Redirect each member's active session to another org or null.
  const affected = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true },
  });
  for (const u of affected) {
    const next = await prisma.organizationMembership.findFirst({
      where: { userId: u.id, organizationId: { not: organizationId } },
    });
    await prisma.user.update({
      where: { id: u.id },
      data: {
        organizationId: next?.organizationId ?? null,
        orgRole: next?.orgRole ?? "member",
      },
    });
  }
}
