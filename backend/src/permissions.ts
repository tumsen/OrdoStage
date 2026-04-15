export function canWrite(orgRole: string): boolean {
  return ["owner", "manager"].includes(orgRole);
}

export function isOwner(orgRole: string): boolean {
  return orgRole === "owner";
}
