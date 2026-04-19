import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";

export type MePayload = {
  orgRole: string;
  canWrite: boolean;
  canManageTeam?: boolean;
  hasOrganization: boolean;
  isActive: boolean;
  views?: string[];
  actions?: string[];
};

/** Uses GET /api/me so permissions match the database (client session sometimes omits orgRole). */
export function usePermissions() {
  const { data: session } = useSession();
  const { data: me, isPending } = useQuery({
    queryKey: ["me", "permissions"],
    queryFn: () => api.get<MePayload>("/api/me"),
    enabled: Boolean(session?.user),
    staleTime: 60_000,
  });

  const sessionRole = (session?.user as Record<string, unknown>)?.orgRole as string | undefined;
  const orgRole = me?.orgRole ?? sessionRole ?? "viewer";
  const isActive = me?.isActive ?? true;

  const views = me?.views ?? [];
  const actions = me?.actions ?? [];
  const viewSet = new Set(views);
  const actionSet = new Set(actions);

  const canWrite =
    me != null ? me.canWrite : ["owner", "manager", "member"].includes(orgRole) && isActive;
  const canManageTeam =
    me != null && me.canManageTeam !== undefined
      ? Boolean(me.canManageTeam) && isActive
      : ["owner", "manager"].includes(orgRole) && isActive;

  const canView = (id: string) => viewSet.has(id);
  const canAction = (id: string) => actionSet.has(id);

  return {
    me,
    isPending,
    canWrite,
    canManageTeam,
    canView,
    canAction,
    isOwner: orgRole === "owner",
    orgRole,
    isActive,
    views,
    actions,
  };
}
