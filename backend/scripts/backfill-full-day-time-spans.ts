/**
 * One-shot: normalize full-day / 7:24 time entry end times for all orgs.
 *
 *   cd backend && bun run scripts/backfill-full-day-time-spans.ts
 */
import "./loadDotEnv";
import { prisma } from "../src/prisma";
import { backfillExactFullDayTimeSpans } from "../src/services/backfillFullDayTimeSpans";

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  let total = 0;
  for (const org of orgs) {
    const fixed = await backfillExactFullDayTimeSpans(org.id);
    if (fixed > 0) {
      console.log(`${org.name ?? org.id}: fixed ${fixed}`);
    }
    total += fixed;
  }
  console.log(`Done. Fixed ${total} entries across ${orgs.length} orgs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
