type OrgRoleInput = string | null | undefined;

/** Roles that may create/update org data. Includes `member` (legacy Prisma default before team roles). */
export function canWrite(orgRole: OrgRoleInput): boolean {
  if (orgRole == null) return false;
  return ["owner", "manager", "member"].includes(orgRole);
}

export function isOwner(orgRole: OrgRoleInput): boolean {
  return orgRole === "owner";
}

/** Invite members and set inactive; owners and managers. */
export function canManageTeam(orgRole: OrgRoleInput): boolean {
  if (orgRole == null) return false;
  return ["owner", "manager"].includes(orgRole);
}
