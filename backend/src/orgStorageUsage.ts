import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type OrgStorageBreakdown = {
  companyLogoBytes: number;
  personPhotoBytes: number;
  personDocumentBytes: number;
  venueDocumentBytes: number;
  eventDocumentBytes: number;
  eventTeamDocumentBytes: number;
  tourTechRiderBytes: number;
  tourShowTechRiderBytes: number;
  productionTechRiderBytes: number;
  productionDocumentBytes: number;
  productionPhaseDocumentBytes: number;
};

export type OrgStorageUsage = OrgStorageBreakdown & {
  totalBytes: number;
};

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Logical payload size of org-scoped BYTEA blobs (Postgres octet_length).
 * Does not load file contents into the app process.
 */
export async function getOrgStorageUsage(
  prisma: PrismaClient,
  organizationId: string,
): Promise<OrgStorageUsage> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT
      COALESCE((
        SELECT octet_length("companyLogoData")
        FROM "Organization"
        WHERE id = ${organizationId} AND "companyLogoData" IS NOT NULL
      ), 0) AS "companyLogoBytes",
      COALESCE((
        SELECT SUM(octet_length("photoData"))
        FROM "Person"
        WHERE "organizationId" = ${organizationId} AND "photoData" IS NOT NULL
      ), 0) AS "personPhotoBytes",
      COALESCE((
        SELECT SUM(octet_length(pd.data))
        FROM "PersonDocument" pd
        INNER JOIN "Person" p ON p.id = pd."personId"
        WHERE p."organizationId" = ${organizationId}
      ), 0) AS "personDocumentBytes",
      COALESCE((
        SELECT SUM(octet_length(vd.data))
        FROM "VenueDocument" vd
        INNER JOIN "Venue" v ON v.id = vd."venueId"
        WHERE v."organizationId" = ${organizationId}
      ), 0) AS "venueDocumentBytes",
      COALESCE((
        SELECT SUM(octet_length(d.data))
        FROM "Document" d
        INNER JOIN "Event" e ON e.id = d."eventId"
        WHERE e."organizationId" = ${organizationId}
      ), 0) AS "eventDocumentBytes",
      COALESCE((
        SELECT SUM(octet_length(etd.data))
        FROM "EventTeamDocument" etd
        INNER JOIN "Event" e ON e.id = etd."eventId"
        WHERE e."organizationId" = ${organizationId}
      ), 0) AS "eventTeamDocumentBytes",
      COALESCE((
        SELECT SUM(octet_length("techRiderPdfData"))
        FROM "Tour"
        WHERE "organizationId" = ${organizationId} AND "techRiderPdfData" IS NOT NULL
      ), 0) AS "tourTechRiderBytes",
      COALESCE((
        SELECT SUM(octet_length(ts."venueTechRiderPdfData"))
        FROM "TourShow" ts
        INNER JOIN "Tour" t ON t.id = ts."tourId"
        WHERE t."organizationId" = ${organizationId} AND ts."venueTechRiderPdfData" IS NOT NULL
      ), 0) AS "tourShowTechRiderBytes",
      COALESCE((
        SELECT SUM(octet_length("techRiderPdfData"))
        FROM "Production"
        WHERE "organizationId" = ${organizationId} AND "techRiderPdfData" IS NOT NULL
      ), 0) AS "productionTechRiderBytes",
      COALESCE((
        SELECT SUM(octet_length(data))
        FROM "ProductionDocument"
        WHERE "organizationId" = ${organizationId}
      ), 0) AS "productionDocumentBytes",
      COALESCE((
        SELECT SUM(octet_length(data))
        FROM "ProductionPhaseDocument"
        WHERE "organizationId" = ${organizationId}
      ), 0) AS "productionPhaseDocumentBytes"
  `);

  const row = rows[0] ?? {};
  const breakdown: OrgStorageBreakdown = {
    companyLogoBytes: n(row.companyLogoBytes),
    personPhotoBytes: n(row.personPhotoBytes),
    personDocumentBytes: n(row.personDocumentBytes),
    venueDocumentBytes: n(row.venueDocumentBytes),
    eventDocumentBytes: n(row.eventDocumentBytes),
    eventTeamDocumentBytes: n(row.eventTeamDocumentBytes),
    tourTechRiderBytes: n(row.tourTechRiderBytes),
    tourShowTechRiderBytes: n(row.tourShowTechRiderBytes),
    productionTechRiderBytes: n(row.productionTechRiderBytes),
    productionDocumentBytes: n(row.productionDocumentBytes),
    productionPhaseDocumentBytes: n(row.productionPhaseDocumentBytes),
  };

  const totalBytes = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { ...breakdown, totalBytes };
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}
