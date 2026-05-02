import type { PrismaClient } from "@prisma/client";

/**
 * Removes an organization and deletes login accounts for members who belong only to this org.
 * Members with other workspaces keep their account and lose only this membership.
 */
export async function wipeOrganizationCompletely(prisma: PrismaClient, organizationId: string): Promise<void> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  const userIds = [...new Set(memberships.map((m) => m.userId))];

  for (const uid of userIds) {
    const otherCount = await prisma.organizationMembership.count({
      where: { userId: uid, organizationId: { not: organizationId } },
    });

    await prisma.organizationMembership.deleteMany({
      where: { userId: uid, organizationId },
    });

    if (otherCount === 0) {
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.account.deleteMany({ where: { userId: uid } });
      await prisma.user.delete({ where: { id: uid } });
    } else {
      const next = await prisma.organizationMembership.findFirst({ where: { userId: uid } });
      await prisma.user.update({
        where: { id: uid },
        data: {
          organizationId: next?.organizationId ?? null,
          orgRole: next?.orgRole ?? "member",
        },
      });
    }
  }

  await prisma.organization.delete({ where: { id: organizationId } });
}
