import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const emails = ["tumsen@gmail.com", "thomas@baggaardteatret.dk"];

for (const email of emails) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.log(`NOT FOUND: ${email}`); continue; }
  if (!user.organizationId) { console.log(`NO ORG: ${email}`); continue; }

  const org = await prisma.organization.update({
    where: { id: user.organizationId },
    data: { unlimitedCredits: true, creditBalance: 999999999 },
  });
  console.log(`✅ ${email} → org "${org.name}" now has unlimitedCredits=true`);
}

await prisma.$disconnect();
