import type { PrismaClient } from "@prisma/client";
import {
  ALL_ACTION_IDS,
  ALL_VIEW_IDS,
  LEGACY_PRESETS,
  actionsAllowTeamManage,
  actionsAllowWrite,
  systemRoleSeeds,
} from "./roleCatalog";
import { isOwner } from "./permissions";
import { isPostgresDatabaseUrl } from "./databaseUrl";

export type EffectiveRole = {
  views: string[];
  actions: string[];
  /** Legacy compatibility */
  canWrite: boolean;
  canManageTeam: boolean;
};

const LOCKED_VIEWS = ["account"] as const;

function filterActionsForNonOwner(actions: string[], userOrgRole: string | null | undefined): string[] {
  if (isOwner(userOrgRole)) return actions;
  return actions.filter((a) => a !== "org.delete");
}

function effectiveFromRow(
  views: string[],
  actions: string[],
  userOrgRole: string | null | undefined,
  isActive: boolean
): EffectiveRole {
  const actionSet = new Set(filterActionsForNonOwner(actions, userOrgRole));
  const v = views.filter((id) => ALL_VIEW_IDS.includes(id));
  const a = [...actionSet].filter((id) => ALL_ACTION_IDS.includes(id));
  let canWrite = isActive && actionsAllowWrite(actionSet);
  let canManageTeam = isActive && actionsAllowTeamManage(actionSet);
  if (!isActive) {
    canWrite = false;
    canManageTeam = false;
  }
  return { views: v, actions: a, canWrite, canManageTeam };
}

/** Ensure org has system permission groups (owner, admin) and demote old manager/member roles. */
export async function ensureSystemRoles(prisma: PrismaClient, organizationId: string): Promise<void> {
  const seeds = systemRoleSeeds();
  for (const s of seeds) {
    const existing = await prisma.roleDefinition.findUnique({
      where: { organizationId_slug: { organizationId, slug: s.slug } },
    });
    if (!existing) {
      await prisma.roleDefinition.create({
        data: {
          organizationId,
          slug: s.slug,
          name: s.name,
          description: s.description,
          views: s.views,
          actions: s.actions,
          sortOrder: s.sortOrder,
          isSystem: true,
        },
      });
    } else {
      const mergedViews = [...new Set([...existing.views, ...s.views])].filter((id) =>
        ALL_VIEW_IDS.includes(id)
      );
      let mergedActions = [...new Set([...existing.actions, ...s.actions])].filter((id) =>
        ALL_ACTION_IDS.includes(id)
      );
      if (s.slug !== "owner") {
        mergedActions = mergedActions.filter((a) => a !== "org.delete");
      }
      await prisma.roleDefinition.update({
        where: { id: existing.id },
        data: { isSystem: true, views: mergedViews, actions: mergedActions },
      });
    }
  }
  await prisma.roleDefinition.updateMany({
    where: { organizationId, slug: { in: ["manager", "member"] } },
    data: { isSystem: false },
  });

  await retrofitTimeWithSchedule(prisma, organizationId);
}

/**
 * Permission groups created before Time tracking only store view/action ids that existed then.
 * Mirror schedule access: add `time` / `time.write` when the group already has schedule / write.schedule.
 */
async function retrofitTimeWithSchedule(prisma: PrismaClient, organizationId: string): Promise<void> {
  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    await prisma.$executeRaw`
      UPDATE "RoleDefinition"
      SET
        views = CASE
          WHEN 'schedule' = ANY(views) AND NOT ('time' = ANY(views))
          THEN array_append(views, 'time')
          ELSE views
        END,
        actions = CASE
          WHEN 'write.schedule' = ANY(actions) AND NOT ('time.write' = ANY(actions))
          THEN array_append(actions, 'time.write')
          ELSE actions
        END
      WHERE "organizationId" = ${organizationId}
        AND (
          ('schedule' = ANY(views) AND NOT ('time' = ANY(views)))
          OR ('write.schedule' = ANY(actions) AND NOT ('time.write' = ANY(actions)))
        )
    `;
    return;
  }

  const rows = await prisma.roleDefinition.findMany({ where: { organizationId } });
  for (const row of rows) {
    const views = [...row.views];
    const actions = [...row.actions];
    let changed = false;
    if (views.includes("schedule") && !views.includes("time")) {
      views.push("time");
      changed = true;
    }
    if (actions.includes("write.schedule") && !actions.includes("time.write")) {
      actions.push("time.write");
      changed = true;
    }
    if (!changed) continue;
    await prisma.roleDefinition.update({
      where: { id: row.id },
      data: {
        views: views.filter((id) => ALL_VIEW_IDS.includes(id)),
        actions: actions.filter((id) => ALL_ACTION_IDS.includes(id)),
      },
    });
  }
}

async function findPersonWithGroup(
  prisma: PrismaClient,
  organizationId: string,
  email: string
) {
  let person = await prisma.person.findFirst({
    where: { organizationId, email },
    include: { permissionGroup: true },
  });
  if (!person && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    person = await prisma.person.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
      include: { permissionGroup: true },
    });
  }
  return person;
}

/**
 * Resolve sidebar + actions for API / enforcement.
 * - `owner` (User.orgRole) always has full access.
 * - If a directory Person row exists for this user's email, `permissionGroup` on that row drives access.
 * - If the person has an email but no permission group, the user cannot work in the org (account only).
 * - Otherwise fall back to User.orgRole → RoleDefinition.
 */
export async function resolveEffectiveRole(
  prisma: PrismaClient,
  opts: {
    organizationId: string | null | undefined;
    orgRole: string | null | undefined;
    isActive?: boolean;
    userId?: string | null;
  }
): Promise<EffectiveRole> {
  const organizationId = opts.organizationId ?? null;
  const rawRole = opts.orgRole ?? "viewer";
  const active = opts.isActive !== false;

  if (!organizationId) {
    return { views: [], actions: [], canWrite: false, canManageTeam: false };
  }

  await ensureSystemRoles(prisma, organizationId);

  if (isOwner(rawRole)) {
    const views = [...ALL_VIEW_IDS];
    const actions = [...ALL_ACTION_IDS];
    return {
      views,
      actions,
      canWrite: active && actionsAllowWrite(new Set(actions)),
      canManageTeam: active && actionsAllowTeamManage(new Set(actions)),
    };
  }

  if (opts.userId) {
    const u = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true },
    });
    if (u?.email?.trim()) {
      const person = await findPersonWithGroup(prisma, organizationId, u.email);
      if (person) {
        const hasEmail = Boolean(person.email?.trim());
        if (hasEmail && !person.permissionGroupId) {
          return {
            views: [...LOCKED_VIEWS],
            actions: [],
            canWrite: false,
            canManageTeam: false,
          };
        }
        if (person.permissionGroupId) {
          if (person.permissionGroup) {
            const g = person.permissionGroup;
            let views = g.views.filter((id) => ALL_VIEW_IDS.includes(id));
            let actions = g.actions.filter((id) => ALL_ACTION_IDS.includes(id));
            actions = filterActionsForNonOwner(actions, rawRole);
            if (g.slug === "admin") {
              actions = actions.filter((a) => a !== "org.delete");
            }
            return effectiveFromRow(views, actions, rawRole, active);
          }
          // Stale id — fall back to org role
        }
      }
    }
  }

  const row = await prisma.roleDefinition.findUnique({
    where: { organizationId_slug: { organizationId, slug: rawRole } },
  });

  let views: string[];
  let actions: string[];

  if (row) {
    views = row.views.filter((id) => ALL_VIEW_IDS.includes(id));
    actions = row.actions.filter((id) => ALL_ACTION_IDS.includes(id));
  } else {
    const base = LEGACY_PRESETS[rawRole] ?? LEGACY_PRESETS.member!;
    views = [...base.views];
    actions = [...base.actions];
  }
  actions = filterActionsForNonOwner(actions, rawRole);
  if (rawRole === "admin") {
    actions = actions.filter((a) => a !== "org.delete");
  }
  return effectiveFromRow(views, actions, rawRole, active);
}
