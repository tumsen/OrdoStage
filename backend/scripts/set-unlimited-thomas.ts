import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "thomas@baggaardteatret.dk";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email}), id=${user.id}`);

  if (!user.organizationId) {
    console.error(`User has no organizationId`);
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
  });
  if (!org) {
    console.error(`Organization not found: ${user.organizationId}`);
    process.exit(1);
  }

  console.log(`Found org: ${org.name} (${org.id}), creditBalance=${org.creditBalance}`);

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      unlimitedCredits: true,
      creditBalance: 999999999,
    },
  });

  console.log(
    `Done. Org "${updated.name}" now has unlimitedCredits=${updated.unlimitedCredits}, creditBalance=${updated.creditBalance}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
