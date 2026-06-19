import { prisma } from "../prisma";

function productionStatusForTourStatus(status: string): string {
  switch (status) {
    case "active":
      return "on_tour";
    case "completed":
      return "closed";
    default:
      return "planning";
  }
}

/**
 * Tours created before show linking was required have no productionId.
 * Ensure each gets an in-house show: reuse a legacy primary production when present,
 * otherwise create one from the tour metadata.
 */
export async function ensureOrphanToursHaveProductions(organizationId: string): Promise<void> {
  const orphanCount = await prisma.tour.count({
    where: { organizationId, productionId: null },
  });
  if (orphanCount === 0) return;

  const orphans = await prisma.tour.findMany({
    where: { organizationId, productionId: null },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      notes: true,
      techRiderPdfData: true,
      techRiderPdfName: true,
    },
  });

  for (const tour of orphans) {
    const legacyProduction = await prisma.production.findFirst({
      where: { organizationId, tourId: tour.id },
      select: { id: true },
    });

    if (legacyProduction) {
      await prisma.tour.update({
        where: { id: tour.id },
        data: { productionId: legacyProduction.id },
      });
      continue;
    }

    const production = await prisma.production.create({
      data: {
        organizationId,
        name: tour.name,
        description: tour.description,
        notes: tour.notes,
        status: productionStatusForTourStatus(tour.status),
        tourId: tour.id,
        techRiderPdfData: tour.techRiderPdfData,
        techRiderPdfName: tour.techRiderPdfName,
      },
    });

    await prisma.tour.update({
      where: { id: tour.id },
      data: { productionId: production.id },
    });
  }
}
