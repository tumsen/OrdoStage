/** Roles that may create/update org data. Includes `member` (legacy Prisma default before team roles). */
export function canWrite(orgRole: string): boolean {
  return ["owner", "manager", "member"].includes(orgRole);
}

export function isOwner(orgRole: string): boolean {
  return orgRole === "owner";
}
