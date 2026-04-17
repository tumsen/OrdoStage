import { useSession } from "@/lib/auth-client";

export function usePermissions() {
  const { data: session } = useSession();
  const orgRole = (session?.user as Record<string, unknown>)?.orgRole as string ?? "viewer";
  return {
    canWrite: ["owner", "manager", "member"].includes(orgRole),
    isOwner: orgRole === "owner",
    orgRole,
  };
}
