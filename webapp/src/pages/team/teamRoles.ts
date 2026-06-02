/** Stored as comma-separated text in PersonTeam.role */
export function parseTeamRoles(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeTeamRoles(roles: string[]): string | null {
  const cleaned = roles.map((r) => r.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.join(", ");
}
