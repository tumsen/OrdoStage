/** Roles that may create/update org data. Includes `member` (legacy Prisma default before team roles). */
export function canWrite(orgRole: string): boolean {
  return ["owner", "manager", "member"].includes(orgRole);
}

export function isOwner(orgRole: string): boolean {
  return orgRole === "owner";
}

/** Invite members and set inactive; owners and managers. */
export function canManageTeam(orgRole: string): boolean {
  return ["owner", "manager"].includes(orgRole);
}
