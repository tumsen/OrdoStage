import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";

type MePayload = {
  orgRole: string;
  canWrite: boolean;
  hasOrganization: boolean;
  isActive: boolean;
};

/** Uses GET /api/me so permissions match the database (client session sometimes omits orgRole). */
export function usePermissions() {
  const { data: session } = useSession();
  const { data: me } = useQuery({
    queryKey: ["me", "permissions"],
    queryFn: () => api.get<MePayload>("/api/me"),
    enabled: Boolean(session?.user),
    staleTime: 60_000,
  });

  const sessionRole = (session?.user as Record<string, unknown>)?.orgRole as string | undefined;
  const orgRole = me?.orgRole ?? sessionRole ?? "viewer";
  const isActive = me?.isActive ?? true;
  const canWrite = me != null ? me.canWrite : ["owner", "manager", "member"].includes(orgRole) && isActive;
  const canManageTeam =
    me != null
      ? ["owner", "manager"].includes(me.orgRole) && me.isActive
      : ["owner", "manager"].includes(orgRole);

  return {
    canWrite,
    canManageTeam,
    isOwner: orgRole === "owner",
    orgRole,
    isActive,
  };
}
