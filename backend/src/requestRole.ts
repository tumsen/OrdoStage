import type { Context } from "hono";
import type { EffectiveRole } from "./effectiveRole";

export function getEffectiveRole(c: Context): EffectiveRole | undefined {
  return c.get("effectiveRole") as EffectiveRole | undefined;
}

export function canWriteRequest(c: Context): boolean {
  return Boolean(getEffectiveRole(c)?.canWrite);
}

export function canManageTeamRequest(c: Context): boolean {
  return Boolean(getEffectiveRole(c)?.canManageTeam);
}

export function canAction(c: Context, actionId: string): boolean {
  return getEffectiveRole(c)?.actions?.includes(actionId) ?? false;
}

export function canView(c: Context, viewId: string): boolean {
  return getEffectiveRole(c)?.views?.includes(viewId) ?? false;
}
