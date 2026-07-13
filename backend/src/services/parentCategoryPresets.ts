import { prisma } from "../prisma";

export const PRESET_PARENT_CATEGORY_KEYS = [
  "guest_play",
  "own_production",
  "tour",
  "administration",
] as const;

export type PresetParentCategoryKey = (typeof PRESET_PARENT_CATEGORY_KEYS)[number];

const PRESET_DEFS: Record<
  PresetParentCategoryKey,
  { name: string; color: string; sortOrder: number }
> = {
  guest_play: { name: "Gæstespil", color: "#a78bfa", sortOrder: -40 },
  own_production: { name: "Egne forestillinger", color: "#f472b6", sortOrder: -39 },
  tour: { name: "Turne", color: "#60a5fa", sortOrder: -38 },
  administration: { name: "Administration", color: "#94a3b8", sortOrder: -37 },
};

export function isPresetParentCategoryKey(key: string | null | undefined): boolean {
  return (
    typeof key === "string" &&
    (PRESET_PARENT_CATEGORY_KEYS as readonly string[]).includes(key)
  );
}

export async function ensureDefaultParentCategories(organizationId: string) {
  for (const systemKey of PRESET_PARENT_CATEGORY_KEYS) {
    const def = PRESET_DEFS[systemKey];
    const existing = await prisma.timeParentCategory.findFirst({
      where: { organizationId, systemKey },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.timeParentCategory.create({
      data: {
        organizationId,
        name: def.name,
        color: def.color,
        systemKey,
        sortOrder: def.sortOrder,
      },
    });
  }
}

export async function resolvePresetParentCategoryId(
  organizationId: string,
  systemKey: PresetParentCategoryKey
): Promise<string | null> {
  await ensureDefaultParentCategories(organizationId);
  const row = await prisma.timeParentCategory.findFirst({
    where: { organizationId, systemKey },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function resolveOrgParentCategoryId(
  organizationId: string,
  id: string | null | undefined
): Promise<{ ok: true; value: string | null | undefined } | { ok: false }> {
  if (id === undefined) return { ok: true, value: undefined };
  if (id === null || id === "") return { ok: true, value: null };
  const row = await prisma.timeParentCategory.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!row) return { ok: false };
  return { ok: true, value: id };
}
