import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreatePersonSchema,
  UpdatePersonSchema,
  PersonActiveSchema,
  UpdatePersonDocumentSchema,
  UpdatePersonDocumentVisibilitySchema,
  type TeamAssignmentInput,
} from "../types";
import { canAction } from "../requestRole";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import {
  accountSetupEmailForResponse,
  type AccountSetupResult,
  provisionPersonAppAccountAndEmail,
} from "../peopleAccountInvite";

const TEAM_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4"];
const SOFTWARE_OWNER_EMAIL = "tumsen@gmail.com";

/** `YYYY-MM-DD` (local calendar day) or any date string `Date` can parse. */
function parsePersonDocumentExpiresAtInput(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const peopleRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

async function resolvePermissionGroupSlug(
  organizationId: string,
  groupId: string | null | undefined
): Promise<string | null> {
  if (!groupId) return null;
  const g = await prisma.roleDefinition.findFirst({
    where: { id: groupId, organizationId },
    select: { slug: true },
  });
  if (!g) throw new Error("Invalid permission group.");
  return g.slug;
}

async function enforcePermissionGroupTransitionRules(input: {
  organizationId: string;
  actorUserId: string;
  actorEmail: string | null | undefined;
  actorOrgRole: string | null | undefined;
  currentSlug?: string | null;
  nextSlug: string;
  targetPersonEmail: string | null | undefined;
}): Promise<void> {
  const actorEmailNorm = (input.actorEmail || "").trim().toLowerCase();
  const targetEmailNorm = (input.targetPersonEmail || "").trim().toLowerCase();
  const isSaasOwnerAdmin = actorEmailNorm === SOFTWARE_OWNER_EMAIL;
  const actorIsOwner = input.actorOrgRole === "owner";

  if (input.nextSlug === "admin" && !actorIsOwner && !isSaasOwnerAdmin) {
    throw new Error("Only owners can grant Admin permissions.");
  }
  if (input.nextSlug === "owner" && !actorIsOwner && !isSaasOwnerAdmin) {
    throw new Error("Only owners can grant Owner permissions.");
  }

  // Only owner themselves can leave owner group, and only if another owner remains.
  if (input.currentSlug === "owner" && input.nextSlug !== "owner") {
    if (!targetEmailNorm || actorEmailNorm !== targetEmailNorm) {
      throw new Error("Only the owner themselves can leave the Owner group.");
    }
    const ownerCount = await prisma.organizationMembership.count({
      where: { organizationId: input.organizationId, orgRole: "owner" },
    });
    if (ownerCount <= 1) {
      throw new Error("You must grant owner permissions to another person before leaving the Owner group.");
    }
  }
}

/** Keeps `User.orgRole` in sync when a linked account matches this person’s email. */
async function syncUserOrgRoleFromPerson(
  organizationId: string,
  personEmail: string | null | undefined,
  permissionGroupId: string | null | undefined
): Promise<void> {
  if (!personEmail?.trim() || !permissionGroupId) return;
  const g = await prisma.roleDefinition.findFirst({
    where: { id: permissionGroupId, organizationId },
    select: { slug: true },
  });
  if (!g) return;
  let u = await prisma.user.findUnique({ where: { email: personEmail.trim().toLowerCase() } });
  if (!u && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    u = await prisma.user.findFirst({
      where: { email: { equals: personEmail.trim(), mode: "insensitive" } },
    });
  }
  if (!u || u.organizationId !== organizationId) return;
  await prisma.user.update({
    where: { id: u.id },
    data: { orgRole: g.slug },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: u.id, organizationId } },
    create: { userId: u.id, organizationId, orgRole: g.slug },
    update: { orgRole: g.slug },
  });
}

/** Resolve checkbox teamIds + typed new team names → unique department memberships. */
async function resolveAssignmentTeamIds(
  organizationId: string,
  assignments: TeamAssignmentInput[]
): Promise<Array<{ teamId: string; role: string | null }>> {
  const departments = await prisma.department.findMany({ where: { organizationId } });
  const findByName = (name: string) =>
    departments.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());

  const resolved: Array<{ teamId: string; role: string | null }> = [];
  let colorIdx = departments.length;

  for (const a of assignments) {
    const role = a.role?.trim() ? a.role.trim() : null;
    const newName = a.newTeamName?.trim();
    const tid = a.teamId?.trim();
    if (newName) {
      let dept = findByName(newName);
      if (!dept) {
        dept = await prisma.department.create({
          data: {
            name: newName,
            organizationId,
            color: TEAM_COLORS[colorIdx % TEAM_COLORS.length],
          },
        });
        departments.push(dept);
        colorIdx++;
      }
      resolved.push({ teamId: dept.id, role });
    } else if (tid) {
      resolved.push({ teamId: tid, role });
    }
  }

  const dedup = new Map<string, { teamId: string; role: string | null }>();
  for (const r of resolved) {
    dedup.set(r.teamId, r);
  }
  return Array.from(dedup.values());
}

function serializePerson(person: {
  id: string;
  name: string;
  role: string | null;
  affiliation: string;
  email: string | null;
  phone: string | null;
  addressStreet:  string | null;
  addressNumber:  string | null;
  addressZip:     string | null;
  addressCity:    string | null;
  addressState:   string | null;
  addressCountry: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes?: string | null;
  photoData?: Uint8Array | null;
  photoUpdatedAt?: Date | null;
  departmentId: string | null;
  isActive?: boolean;
  teamMemberships?: Array<{
    departmentId: string;
    role: string | null;
    department: {
      id: string;
      name: string;
      color: string;
      createdAt: Date;
    };
  }>;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  permissionGroupId?: string | null;
  permissionGroup?: { id: string; name: string; slug: string } | null;
}) {
  const aff =
    person.affiliation === "external" ? "external" : "internal";
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    affiliation: aff,
    permissionGroupId: person.permissionGroupId ?? null,
    permissionGroup: person.permissionGroup
      ? {
          id: person.permissionGroup.id,
          name: person.permissionGroup.name,
          slug: person.permissionGroup.slug,
        }
      : null,
    email: person.email,
    phone: person.phone,
    addressStreet:  person.addressStreet  ?? null,
    addressNumber:  person.addressNumber  ?? null,
    addressZip:     person.addressZip     ?? null,
    addressCity:    person.addressCity    ?? null,
    addressState:   person.addressState   ?? null,
    addressCountry: person.addressCountry ?? null,
    emergencyContactName: person.emergencyContactName ?? null,
    emergencyContactPhone: person.emergencyContactPhone ?? null,
    notes: person.notes ?? null,
    hasPhoto: Boolean(person.photoData),
    photoUpdatedAt: person.photoUpdatedAt ? person.photoUpdatedAt.toISOString() : null,
    departmentId: person.departmentId,
    isActive: person.isActive ?? true,
    teamIds: (person.teamMemberships ?? []).map((membership) => membership.departmentId),
    teams: (person.teamMemberships ?? []).map((membership) => ({
      id: membership.department.id,
      name: membership.department.name,
      color: membership.department.color,
      createdAt: membership.department.createdAt.toISOString(),
    })),
    teamMemberships: (person.teamMemberships ?? []).map((membership) => ({
      teamId: membership.departmentId,
      role: membership.role ?? null,
    })),
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function canEditOwnProfile(user: { email: string }, personEmail: string | null): boolean {
  if (!personEmail) return false;
  return personEmail.toLowerCase() === user.email.toLowerCase();
}

async function getViewerPersonContext(orgId: string, email: string) {
  const viewer = await prisma.person.findFirst({
    where: { organizationId: orgId, email },
    select: { id: true, teamMemberships: { select: { departmentId: true } } },
  });
  if (!viewer && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    const ci = await prisma.person.findFirst({
      where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, teamMemberships: { select: { departmentId: true } } },
    });
    return ci
      ? { personId: ci.id, teamIds: ci.teamMemberships.map((m) => m.departmentId) }
      : null;
  }
  return viewer
    ? { personId: viewer.id, teamIds: viewer.teamMemberships.map((m) => m.departmentId) }
    : null;
}

function canViewerAccessDocumentByPermission(
  viewer: { personId: string; teamIds: string[] } | null,
  allowedPersonIds: string[],
  allowedTeamIds: string[]
) {
  if (!viewer) return false;
  if (allowedPersonIds.includes(viewer.personId)) return true;
  if (viewer.teamIds.some((teamId) => allowedTeamIds.includes(teamId))) return true;
  return false;
}

type DocPermissionMap = Map<string, { teamIds: string[]; personIds: string[] }>;

async function loadDocPermissions(docIds: string[]): Promise<DocPermissionMap> {
  const uniqueIds = [...new Set(docIds.filter(Boolean))];
  const map: DocPermissionMap = new Map();
  if (uniqueIds.length === 0) return map;
  const values = Prisma.join(uniqueIds.map((id) => Prisma.sql`${id}`));
  const teamRows = await prisma.$queryRaw<Array<{ documentId: string; teamId: string }>>(Prisma.sql`
    SELECT "documentId", "teamId"
    FROM "PersonDocumentAllowedTeam"
    WHERE "documentId" IN (${values})
  `);
  const personRows = await prisma.$queryRaw<Array<{ documentId: string; allowedPersonId: string }>>(Prisma.sql`
    SELECT "documentId", "allowedPersonId"
    FROM "PersonDocumentAllowedPerson"
    WHERE "documentId" IN (${values})
  `);
  for (const id of uniqueIds) map.set(id, { teamIds: [], personIds: [] });
  for (const r of teamRows) {
    const cur = map.get(r.documentId);
    if (!cur) continue;
    cur.teamIds.push(r.teamId);
  }
  for (const r of personRows) {
    const cur = map.get(r.documentId);
    if (!cur) continue;
    cur.personIds.push(r.allowedPersonId);
  }
  return map;
}

async function replaceDocPermissions(documentId: string, teamIds: string[], personIds: string[]) {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "PersonDocumentAllowedTeam" WHERE "documentId" = ${documentId}`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "PersonDocumentAllowedPerson" WHERE "documentId" = ${documentId}`);
  if (teamIds.length > 0) {
    const rows = Prisma.join(teamIds.map((teamId) => Prisma.sql`(${documentId}, ${teamId}, NOW())`));
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PersonDocumentAllowedTeam" ("documentId", "teamId", "createdAt")
      VALUES ${rows}
    `);
  }
  if (personIds.length > 0) {
    const rows = Prisma.join(personIds.map((allowedPersonId) => Prisma.sql`(${documentId}, ${allowedPersonId}, NOW())`));
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PersonDocumentAllowedPerson" ("documentId", "allowedPersonId", "createdAt")
      VALUES ${rows}
    `);
  }
}

/** Calendar days from today to the document’s local expiry day (negative = expired). */
function calendarDayDiffFromToday(expiresAt: Date): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const d = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate());
  return Math.round((d.getTime() - new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate()).getTime()) / 86400000);
}

type ListDocRow = { name: string; type: string; expiresAt: Date | null; doesNotExpire: boolean };

type DocumentExpiryHint =
  | { name: string; forever: true }
  | { name: string; daysLeft: number; expired: boolean };

type PersonDocumentListSummary =
  | { name: string; type?: string; forever: true }
  | { name: string; type?: string; noExpiry: true }
  | { name: string; type?: string; daysLeft: number; expired: boolean };

/** Picks a single hint: dated docs first (expired → soonest), else a “forever” doc. */
function documentExpiryHintForList(rows: ListDocRow[]): DocumentExpiryHint | null {
  if (rows.length === 0) return null;
  const dated = rows.filter((r) => r.expiresAt && !r.doesNotExpire);
  if (dated.length > 0) {
    const scored = dated.map((r) => {
      const daysLeft = calendarDayDiffFromToday(r.expiresAt!);
      return { name: r.name, expiresAt: r.expiresAt!, daysLeft, expired: daysLeft < 0 };
    });
    const expired = scored.filter((r) => r.expired);
    if (expired.length > 0) {
      const worst = expired.reduce((a, b) => (a.expiresAt < b.expiresAt ? a : b));
      return { name: worst.name, daysLeft: worst.daysLeft, expired: true };
    }
    const soon = scored.reduce((a, b) => (a.daysLeft < b.daysLeft ? a : b));
    return { name: soon.name, daysLeft: soon.daysLeft, expired: false };
  }
  const forever = rows.find((r) => r.doesNotExpire);
  if (forever) return { name: forever.name, forever: true };
  return null;
}

function personDocumentSummaryFromRow(r: ListDocRow): PersonDocumentListSummary {
  const typeField = (r.type || "other").trim() || "other";
  if (r.doesNotExpire) {
    return { name: r.name, type: typeField, forever: true };
  }
  if (r.expiresAt) {
    const daysLeft = calendarDayDiffFromToday(r.expiresAt);
    return { name: r.name, type: typeField, daysLeft, expired: daysLeft < 0 };
  }
  return { name: r.name, type: typeField, noExpiry: true };
}

function rankDocumentSummary(s: PersonDocumentListSummary) {
  if ("expired" in s && s.expired) return 0;
  if ("daysLeft" in s && "expired" in s && !s.expired) return 1;
  if ("noExpiry" in s && s.noExpiry) return 2;
  if ("forever" in s && s.forever) return 3;
  return 4;
}

function compareDocumentSummaries(a: PersonDocumentListSummary, b: PersonDocumentListSummary) {
  const ra = rankDocumentSummary(a);
  const rb = rankDocumentSummary(b);
  if (ra !== rb) return ra - rb;
  if ("daysLeft" in a && "expired" in a && "daysLeft" in b && "expired" in b) {
    if (a.expired && b.expired) return a.daysLeft - b.daysLeft;
    if (!a.expired && !b.expired) return a.daysLeft - b.daysLeft;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** List rows that the single-badge hint can use (DNE or has expiry). */
function listDocRowsForExpiryHintFilter(rows: ListDocRow[]) {
  return rows.filter((r) => r.doesNotExpire || (r.expiresAt != null && !r.doesNotExpire));
}

function personDocumentListMetaByOrgId(orgId: string): Promise<{
  hintMap: Map<string, DocumentExpiryHint | null>;
  summariesMap: Map<string, PersonDocumentListSummary[]>;
}> {
  return prisma.personDocument
    .findMany({
      where: { person: { organizationId: orgId } },
      select: { personId: true, name: true, type: true, expiresAt: true, doesNotExpire: true },
    })
    .then((docs) => {
      const by = new Map<string, ListDocRow[]>();
      for (const d of docs) {
        const list = by.get(d.personId) ?? [];
        list.push({
          name: d.name,
          type: d.type || "other",
          expiresAt: d.expiresAt,
          doesNotExpire: d.doesNotExpire,
        });
        by.set(d.personId, list);
      }
      const hintMap = new Map<string, DocumentExpiryHint | null>();
      const summariesMap = new Map<string, PersonDocumentListSummary[]>();
      for (const [personId, list] of by) {
        const forHint = listDocRowsForExpiryHintFilter(list);
        hintMap.set(
          personId,
          forHint.length > 0 ? documentExpiryHintForList(forHint) : null,
        );
        const sorted = list
          .map((r) => personDocumentSummaryFromRow(r))
          .sort(compareDocumentSummaries);
        summariesMap.set(personId, sorted);
      }
      return { hintMap, summariesMap };
    });
}

// GET /api/people
peopleRouter.get("/people", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const [people, { hintMap, summariesMap }] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      include: {
        teamMemberships: {
          include: { department: true },
        },
        permissionGroup: { select: { id: true, name: true, slug: true } },
      },
    }),
    personDocumentListMetaByOrgId(user.organizationId),
  ]);
  return c.json({
    data: people.map((p) => ({
      ...serializePerson(p),
      documentExpiryHint: hintMap.get(p.id) ?? null,
      documentSummaries: summariesMap.get(p.id) ?? [],
    })),
  });
});

// GET /api/people/me — current user's linked person profile in active organization
peopleRouter.get("/people/me", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!user.email) {
    return c.json({ data: null });
  }

  let person = await prisma.person.findFirst({
    where: {
      organizationId: user.organizationId,
      email: user.email,
    },
    include: {
      teamMemberships: { include: { department: true } },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!person && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    person = await prisma.person.findFirst({
      where: {
        organizationId: user.organizationId,
        email: { equals: user.email, mode: "insensitive" },
      },
      include: {
        teamMemberships: { include: { department: true } },
        permissionGroup: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return c.json({ data: person ? serializePerson(person) : null });
});

// POST /api/people
peopleRouter.post("/people", zValidator("json", CreatePersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const actor = await prisma.user.findUnique({
    where: { id: user.id },
    select: { orgRole: true, email: true },
  });
  const actorOrgRole = actor?.orgRole ?? user.orgRole ?? null;

  try {
    const nextGroupSlug = (await resolvePermissionGroupSlug(user.organizationId, body.permissionGroupId))!;
    await enforcePermissionGroupTransitionRules({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorEmail: actor?.email ?? user.email,
      actorOrgRole,
      currentSlug: null,
      nextSlug: nextGroupSlug,
      targetPersonEmail: body.email,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid permission group";
    return c.json({ error: { message, code: "BAD_REQUEST" } }, 400);
  }

  const resolved = await resolveAssignmentTeamIds(user.organizationId, body.teamAssignments);
  const teamIds = resolved.map((r) => r.teamId);
  if (teamIds.length > 0) {
    const teamsFound = await prisma.department.findMany({
      where: { id: { in: teamIds }, organizationId: user.organizationId },
      select: { id: true },
    });
    if (teamsFound.length !== teamIds.length) {
      return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
    }
  }

  const person = await prisma.person.create({
    data: {
      name: body.name,
      affiliation: body.affiliation,
      role: body.role ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      addressStreet:  body.addressStreet  ?? null,
      addressNumber:  body.addressNumber  ?? null,
      addressZip:     body.addressZip     ?? null,
      addressCity:    body.addressCity    ?? null,
      addressState:   body.addressState   ?? null,
      addressCountry: body.addressCountry ?? null,
      emergencyContactName: body.emergencyContactName ?? null,
      emergencyContactPhone: body.emergencyContactPhone ?? null,
      ...(body.notes !== undefined && { notes: body.notes ?? null }),
      permissionGroupId: body.permissionGroupId,
      departmentId: teamIds[0] ?? null,
      organizationId: user.organizationId,
      teamMemberships: {
        create: resolved.map((assignment) => ({
          departmentId: assignment.teamId,
          role: assignment.role,
        })),
      },
    },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  let account: AccountSetupResult = { status: "skipped" };
  if (body.email?.trim() && body.permissionGroupId) {
    try {
      account = await provisionPersonAppAccountAndEmail({
        organizationId: user.organizationId,
        personName: person.name,
        email: person.email,
        permissionGroupId: person.permissionGroupId,
      });
    } catch (e) {
      console.error("[person app account] POST /api/people", e);
      account = { status: "failed", error: e instanceof Error ? e.message : "Account setup failed" };
    }
  }
  await syncUserOrgRoleFromPerson(user.organizationId, person.email, person.permissionGroupId);
  return c.json(
    {
      data: {
        ...serializePerson(person),
        accountSetupEmail: accountSetupEmailForResponse(account),
      },
    },
    201
  );
});

// GET /api/people/:id
peopleRouter.get("/people/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: serializePerson(person) });
});

// PATCH /api/people/:id/active
peopleRouter.patch("/people/:id/active", zValidator("json", PersonActiveSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const { active } = c.req.valid("json");

  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }

  if (existing.isActive === active) {
    const full = await prisma.person.findUnique({
      where: { id },
      include: { teamMemberships: { include: { department: true } } },
    });
    return c.json({ data: serializePerson(full!) });
  }

  await prisma.person.update({
    where: { id },
    data: { isActive: active },
  });

  const updated = await prisma.person.findUnique({
    where: { id },
    include: { teamMemberships: { include: { department: true } } },
  });
  return c.json({ data: serializePerson(updated!) });
});

// PUT /api/people/:id
peopleRouter.put("/people/:id", zValidator("json", UpdatePersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const body = c.req.valid("json");
  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    include: {
      permissionGroup: { select: { slug: true } },
      teamMemberships: {
        include: { department: true },
      },
    },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const hadEmail = Boolean(existing.email?.trim());
  const hadGroup = Boolean(existing.permissionGroupId);
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, existing.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  if (!canWritePeople && body.teamAssignments !== undefined) {
    return c.json(
      { error: { message: "Only managers can change team assignments.", code: "FORBIDDEN" } },
      403
    );
  }
  if (!canWritePeople && body.affiliation !== undefined) {
    return c.json(
      { error: { message: "Only managers can change affiliation.", code: "FORBIDDEN" } },
      403
    );
  }
  if (body.permissionGroupId !== undefined && !canWritePeople) {
    return c.json(
      { error: { message: "You cannot change the permission group for this person.", code: "FORBIDDEN" } },
      403
    );
  }
  const nextEmail =
    body.email !== undefined ? (body.email?.trim() ? body.email : null) : existing.email;
  let nextGroupId = existing.permissionGroupId;
  if (body.permissionGroupId !== undefined) {
    if (!body.permissionGroupId) {
      return c.json({ error: { message: "Permission group is required.", code: "BAD_REQUEST" } }, 400);
    }
    nextGroupId = body.permissionGroupId;
  }
  const actor = await prisma.user.findUnique({
    where: { id: user.id },
    select: { orgRole: true, email: true },
  });
  const actorOrgRole = actor?.orgRole ?? user.orgRole ?? null;
  try {
    const nextSlug = await resolvePermissionGroupSlug(user.organizationId, nextGroupId);
    if (!nextSlug) throw new Error("Permission group is required.");
    await enforcePermissionGroupTransitionRules({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorEmail: actor?.email ?? user.email,
      actorOrgRole,
      currentSlug: existing.permissionGroup?.slug ?? null,
      nextSlug,
      targetPersonEmail: nextEmail,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid permission group";
    return c.json({ error: { message, code: "BAD_REQUEST" } }, 400);
  }
  let nextAssignments: Array<{ teamId: string; role?: string | undefined }> = existing.teamMemberships.map(
    (membership) => ({
      teamId: membership.departmentId,
      role: membership.role ?? undefined,
    })
  );
  if (body.teamAssignments !== undefined) {
    const resolved = await resolveAssignmentTeamIds(user.organizationId, body.teamAssignments);
    const teamIds = resolved.map((r) => r.teamId);
    if (teamIds.length > 0) {
      const teamsFound = await prisma.department.findMany({
        where: { id: { in: teamIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (teamsFound.length !== teamIds.length) {
        return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
      }
    }
    nextAssignments = resolved.map((r) => ({ teamId: r.teamId, role: r.role ?? undefined }));
  }

  const person = await prisma.person.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.affiliation !== undefined && { affiliation: body.affiliation }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.addressStreet  !== undefined && { addressStreet:  body.addressStreet }),
      ...(body.addressNumber  !== undefined && { addressNumber:  body.addressNumber }),
      ...(body.addressZip     !== undefined && { addressZip:     body.addressZip }),
      ...(body.addressCity    !== undefined && { addressCity:    body.addressCity }),
      ...(body.addressState   !== undefined && { addressState:   body.addressState }),
      ...(body.addressCountry !== undefined && { addressCountry: body.addressCountry }),
      ...(body.emergencyContactName !== undefined && { emergencyContactName: body.emergencyContactName }),
      ...(body.emergencyContactPhone !== undefined && { emergencyContactPhone: body.emergencyContactPhone }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.permissionGroupId !== undefined && { permissionGroupId: body.permissionGroupId }),
      ...(body.teamAssignments !== undefined && { departmentId: nextAssignments[0]?.teamId ?? null }),
      ...(body.teamAssignments !== undefined && {
        teamMemberships: {
          deleteMany: {},
          create: nextAssignments.map((assignment) => ({
            departmentId: assignment.teamId,
            role: assignment.role ?? null,
          })),
        },
      }),
    },
    include: {
      teamMemberships: {
        include: { department: true },
      },
      permissionGroup: { select: { id: true, name: true, slug: true } },
    },
  });
  let account: AccountSetupResult = { status: "skipped" };
  if (canWritePeople) {
    const nowEmail = person.email?.trim();
    const nowGroup = person.permissionGroupId;
    if (nowEmail && nowGroup && (!hadEmail || !hadGroup)) {
      try {
        account = await provisionPersonAppAccountAndEmail({
          organizationId: user.organizationId,
          personName: person.name,
          email: person.email,
          permissionGroupId: person.permissionGroupId,
        });
      } catch (e) {
        console.error("[person app account] PUT /api/people/:id", e);
        account = { status: "failed", error: e instanceof Error ? e.message : "Account setup failed" };
      }
    }
  }
  await syncUserOrgRoleFromPerson(user.organizationId, person.email, person.permissionGroupId);
  return c.json({
    data: { ...serializePerson(person), accountSetupEmail: accountSetupEmailForResponse(account) },
  });
});

// POST /api/people/:id/resend-app-access-email — app login setup / password link (managers)
peopleRouter.post("/people/:id/resend-app-access-email", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  if (!person.email?.trim() || !person.permissionGroupId) {
    return c.json(
      { error: { message: "Add an email and permission group before resending a login link.", code: "BAD_REQUEST" } },
      400
    );
  }
  let r: AccountSetupResult;
  try {
    r = await provisionPersonAppAccountAndEmail({
      organizationId: user.organizationId,
      personName: person.name,
      email: person.email,
      permissionGroupId: person.permissionGroupId,
    });
  } catch (e) {
    console.error("[person app account] resend", e);
    r = { status: "failed", error: e instanceof Error ? e.message : "Account setup failed" };
  }
  if (r.status === "failed") {
    return c.json({ error: { message: r.error, code: "EMAIL_FAILED" } }, 502);
  }
  if (r.status === "skipped") {
    return c.json({ error: { message: "Could not send login email.", code: "BAD_REQUEST" } }, 400);
  }
  return c.json({ data: { accountSetupEmail: accountSetupEmailForResponse(r) } });
});

// GET /api/people/:id/documents
peopleRouter.get("/people/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  let viewerContext: { personId: string; teamIds: string[] } | null = null;
  if (!canWritePeople && !canEditSelf) {
    viewerContext = await getViewerPersonContext(user.organizationId, user.email);
  }
  const docs = await prisma.personDocument.findMany({
    where: { personId: person.id },
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      expiresAt: true,
      doesNotExpire: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const permissionMap = await loadDocPermissions(docs.map((d) => d.id));
  const visibleDocs = canWritePeople || canEditSelf
    ? docs
    : docs.filter((d) => {
        const perms = permissionMap.get(d.id) ?? { teamIds: [], personIds: [] };
        return canViewerAccessDocumentByPermission(viewerContext, perms.personIds, perms.teamIds);
      });
  return c.json({
    data: visibleDocs.map((d) => ({
      ...d,
      doesNotExpire: d.doesNotExpire,
      allowedTeamIds: (permissionMap.get(d.id)?.teamIds ?? []),
      allowedPersonIds: (permissionMap.get(d.id)?.personIds ?? []),
      createdAt: d.createdAt.toISOString(),
      expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    })),
  });
});

// POST /api/people/:id/photo
peopleRouter.post("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "Photo file is required", code: "BAD_REQUEST" } }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: { message: "Photo must be an image", code: "BAD_REQUEST" } }, 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.person.update({
    where: { id: person.id },
    data: {
      photoData: bytes,
      photoFilename: file.name,
      photoMimeType: file.type || "application/octet-stream",
      photoUpdatedAt: new Date(),
    },
  });
  return c.json({ data: { ok: true } }, 201);
});

// GET /api/people/:id/photo
peopleRouter.get("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { photoData: true, photoMimeType: true, photoFilename: true },
  });
  if (!person || !person.photoData) {
    return c.json({ error: { message: "Photo not found", code: "NOT_FOUND" } }, 404);
  }
  return new Response(person.photoData, {
    headers: {
      "Content-Type": person.photoMimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${person.photoFilename || "photo"}"`,
      "Content-Length": String(person.photoData.length),
      "Cache-Control": "private, max-age=60",
    },
  });
});

// DELETE /api/people/:id/photo
peopleRouter.delete("/people/:id/photo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  await prisma.person.update({
    where: { id: person.id },
    data: {
      photoData: null,
      photoFilename: null,
      photoMimeType: null,
      photoUpdatedAt: null,
    },
  });
  return new Response(null, { status: 204 });
});

// POST /api/people/:id/documents
peopleRouter.post("/people/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const person = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true, email: true },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = formData["name"];
  const type = formData["type"];
  const expiresField = formData["expiresAt"];
  const dneField = formData["doesNotExpire"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  const rawName = typeof name === "string" && name.trim() ? name.trim() : file.name;
  const rawType = typeof type === "string" && type.trim() ? type.trim() : "other";
  const doesNotExpire = dneField === "true" || dneField === "on" || dneField === "1";
  let expiresAt: Date | null = null;
  if (!doesNotExpire && typeof expiresField === "string" && expiresField.trim()) {
    const d = parsePersonDocumentExpiresAtInput(expiresField);
    if (!d) {
      return c.json({ error: { message: "Invalid expiration date", code: "BAD_REQUEST" } }, 400);
    }
    expiresAt = d;
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const document = await prisma.personDocument.create({
    data: {
      personId: person.id,
      name: rawName,
      type: rawType,
      filename: file.name,
      data: bytes,
      mimeType: file.type || "application/octet-stream",
      doesNotExpire,
      expiresAt: doesNotExpire ? null : expiresAt,
    },
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      doesNotExpire: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return c.json(
    {
      data: {
        ...document,
        doesNotExpire: document.doesNotExpire,
        allowedTeamIds: [],
        allowedPersonIds: [],
        createdAt: document.createdAt.toISOString(),
        expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
      },
    },
    201
  );
});

// PATCH /api/people/documents/:docId — name & expiration (metadata)
peopleRouter.patch("/people/documents/:docId", zValidator("json", UpdatePersonDocumentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const body = c.req.valid("json");
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: { id: true, person: { select: { email: true } } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const data: { name?: string; expiresAt?: Date | null; doesNotExpire?: boolean } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.doesNotExpire === true) {
    data.doesNotExpire = true;
    data.expiresAt = null;
  } else if (body.doesNotExpire === false) {
    data.doesNotExpire = false;
    if (body.expiresAt) {
      const p = parsePersonDocumentExpiresAtInput(body.expiresAt);
      if (!p) {
        return c.json({ error: { message: "Invalid expiration date", code: "BAD_REQUEST" } }, 400);
      }
      data.expiresAt = p;
    } else {
      data.expiresAt = null;
    }
  } else {
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        data.expiresAt = null;
      } else {
        const parsed = parsePersonDocumentExpiresAtInput(body.expiresAt);
        if (!parsed) {
          return c.json({ error: { message: "Invalid expiration date", code: "BAD_REQUEST" } }, 400);
        }
        data.expiresAt = parsed;
        data.doesNotExpire = false;
      }
    }
  }
  if (Object.keys(data).length === 0) {
    return c.json({ error: { message: "No fields to update", code: "BAD_REQUEST" } }, 400);
  }
  const updated = await prisma.personDocument.update({
    where: { id: doc.id },
    data,
    select: {
      id: true,
      personId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      doesNotExpire: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  const perms = await loadDocPermissions([updated.id]);
  return c.json({
    data: {
      ...updated,
      doesNotExpire: updated.doesNotExpire,
      allowedTeamIds: perms.get(updated.id)?.teamIds ?? [],
      allowedPersonIds: perms.get(updated.id)?.personIds ?? [],
      createdAt: updated.createdAt.toISOString(),
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
    },
  });
});

// GET /api/people/documents/:docId/permissions — only owner can configure
peopleRouter.get("/people/documents/:docId/permissions", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: {
      id: true,
      person: { select: { id: true, email: true } },
    },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const isSoftwareOwner = (user.email || "").toLowerCase() === SOFTWARE_OWNER_EMAIL;
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!isSoftwareOwner && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const perms = await loadDocPermissions([doc.id]);
  const entry = perms.get(doc.id) ?? { teamIds: [], personIds: [] };
  return c.json({
    data: {
      teamIds: entry.teamIds,
      personIds: entry.personIds,
    },
  });
});

// GET /api/people/documents/:docId/permissions/options — teams + team members for owner popup
peopleRouter.get("/people/documents/:docId/permissions/options", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: { id: true, person: { select: { id: true, email: true } } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const isSoftwareOwner = (user.email || "").toLowerCase() === SOFTWARE_OWNER_EMAIL;
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!isSoftwareOwner && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const teams = await prisma.department.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      teamMembers: {
        where: { person: { isActive: true } },
        select: {
          person: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return c.json({
    data: {
      ownerPersonId: doc.person.id,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        members: t.teamMembers.map((m) => ({ id: m.person.id, name: m.person.name })),
      })),
    },
  });
});

// PATCH /api/people/documents/:docId/permissions — only owner can edit visibility
peopleRouter.patch(
  "/people/documents/:docId/permissions",
  zValidator("json", UpdatePersonDocumentVisibilitySchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    const { docId } = c.req.param();
    const body = c.req.valid("json");
    const doc = await prisma.personDocument.findFirst({
      where: { id: docId, person: { organizationId: user.organizationId } },
      select: { id: true, person: { select: { id: true, email: true } } },
    });
    if (!doc) {
      return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
    }
    const isSoftwareOwner = (user.email || "").toLowerCase() === SOFTWARE_OWNER_EMAIL;
    const canEditSelf = canEditOwnProfile(user, doc.person.email);
    if (!isSoftwareOwner && !canEditSelf) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }
    const teamIds = [...new Set(body.teamIds.filter(Boolean))];
    const personIds = [...new Set(body.personIds.filter(Boolean))].filter((id) => id !== doc.person.id);

    if (teamIds.length > 0) {
      const teams = await prisma.department.findMany({
        where: { id: { in: teamIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (teams.length !== teamIds.length) {
        return c.json({ error: { message: "One or more teams were not found", code: "NOT_FOUND" } }, 404);
      }
    }
    if (personIds.length > 0) {
      const people = await prisma.person.findMany({
        where: { id: { in: personIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (people.length !== personIds.length) {
        return c.json({ error: { message: "One or more people were not found", code: "NOT_FOUND" } }, 404);
      }
    }

    await replaceDocPermissions(doc.id, teamIds, personIds);

    return c.json({ data: { teamIds, personIds } });
  }
);

// GET /api/people/documents/:docId/download
peopleRouter.get("/people/documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: {
      id: true,
      data: true,
      mimeType: true,
      filename: true,
      person: { select: { email: true } },
    },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!canWritePeople && !canEditSelf) {
    const perms = await loadDocPermissions([doc.id]);
    const entry = perms.get(doc.id) ?? { teamIds: [], personIds: [] };
    const viewerContext = await getViewerPersonContext(user.organizationId, user.email);
    const allowed = canViewerAccessDocumentByPermission(
      viewerContext,
      entry.personIds,
      entry.teamIds
    );
    if (!allowed) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }
  }
  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
      "Content-Length": String(doc.data.length),
    },
  });
});

// DELETE /api/people/documents/:docId
peopleRouter.delete("/people/documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, person: { organizationId: user.organizationId } },
    select: { id: true, person: { select: { email: true } } },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const canWritePeople = canAction(c, "write.people");
  const canEditSelf = canEditOwnProfile(user, doc.person.email);
  if (!canWritePeople && !canEditSelf) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  await prisma.personDocument.delete({ where: { id: doc.id } });
  return new Response(null, { status: 204 });
});

// DELETE /api/people/:id
peopleRouter.delete("/people/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.people")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.person.findUnique({
    where: { id, organizationId: user.organizationId },
    include: { permissionGroup: { select: { slug: true } } },
  });
  if (!existing) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  if (existing.permissionGroup?.slug === "owner") {
    const ownerCount = await prisma.organizationMembership.count({
      where: { organizationId: user.organizationId, orgRole: "owner" },
    });
    if (ownerCount <= 1) {
      return c.json(
        {
          error: {
            message: "Cannot delete the last owner. Grant owner permissions to another person first.",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
  }
  await prisma.person.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default peopleRouter;
