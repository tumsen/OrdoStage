import { prisma } from "./prisma";

const DEFAULT_PACKS = [
  { packId: "pack_100", days: 100, amountCents: 900, label: "100 days" },
  { packId: "pack_500", days: 500, amountCents: 3900, label: "500 days" },
  { packId: "pack_1000", days: 1000, amountCents: 6900, label: "1000 days" },
  { packId: "pack_5000", days: 5000, amountCents: 29900, label: "5000 days" },
];

export async function seedPacks() {
  for (const pack of DEFAULT_PACKS) {
    await prisma.pricePack.upsert({
      where: { packId: pack.packId },
      update: {},
      create: pack,
    });
  }
}
