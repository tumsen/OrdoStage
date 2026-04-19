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

export type EffectiveRole = {
  views: string[];
  actions: string[];
  /** Legacy compatibility */
  canWrite: boolean;
  canManageTeam: boolean;
};

export async function ensureSystemRoles(prisma: PrismaClient, organizationId: string): Promise<void> {
  const existing = await prisma.roleDefinition.count({ where: { organizationId } });
  if (existing > 0) return;

  const seeds = systemRoleSeeds();
  await prisma.roleDefinition.createMany({
    data: seeds.map((s) => ({
      organizationId,
      slug: s.slug,
      name: s.name,
      description: s.description,
      views: s.views,
      actions: s.actions,
      sortOrder: s.sortOrder,
      isSystem: true,
    })),
  });
}

/** Resolve sidebar + actions for API / enforcement. Owner always gets full access. */
export async function resolveEffectiveRole(
  prisma: PrismaClient,
  opts: {
    organizationId: string | null | undefined;
    orgRole: string | null | undefined;
    /** When false, blocked from write-style actions unless support admin handled elsewhere */
    isActive?: boolean;
  }
): Promise<EffectiveRole> {
  const organizationId = opts.organizationId ?? null;
  const rawRole = opts.orgRole ?? "viewer";
  const active = opts.isActive !== false;

  if (!organizationId) {
    return {
      views: [],
      actions: [],
      canWrite: false,
      canManageTeam: false,
    };
  }

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

  await ensureSystemRoles(prisma, organizationId);

  const row = await prisma.roleDefinition.findUnique({
    where: {
      organizationId_slug: { organizationId, slug: rawRole },
    },
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

  const actionSet = new Set(actions);
  let canWrite = active && actionsAllowWrite(actionSet);
  let canManageTeam = active && actionsAllowTeamManage(actionSet);

  if (!active) {
    canWrite = false;
    canManageTeam = false;
  }

  return {
    views,
    actions,
    canWrite,
    canManageTeam,
  };
}
