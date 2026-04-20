import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { viewIdForPath } from "@/lib/viewPath";
import { usePermissions } from "@/hooks/usePermissions";
import { api } from "@/lib/api";

function InactiveAccountNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-950 px-6">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-white">Account deactivated</h1>
        <p className="mt-2 text-sm text-white/50">
          Your access to this organization has been turned off. Contact an owner or manager if you need back in.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="secondary" asChild>
          <Link to="/account">Delete my account instead</Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const location = useLocation();
  const allowInactiveAccountDeletion = location.pathname === "/account";

  const { data: session, isPending } = useSession();
  const email = session?.user?.email?.toLowerCase?.() ?? "";
  const isSupport = email === "tumsen@gmail.com";
  const isAdmin = Boolean((session?.user as unknown as { isAdmin?: boolean } | undefined)?.isAdmin) || isSupport;

  const { me, canView, isPending: permsLoading } = usePermissions();

  const orgId = (session?.user as unknown as { organizationId?: string } | undefined)?.organizationId;
  const { data: orgMemberships, isPending: membershipsLoading } = useQuery({
    queryKey: ["org-memberships"],
    queryFn: () =>
      api.get<{ organizationId: string; name: string; orgRole: string }[]>("/api/org/memberships"),
    enabled: Boolean(session?.user && requireOrg && !orgId && !isAdmin),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }
  if (!session?.user) return <Navigate to="/login" replace />;

  if (session.user && permsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (
    me &&
    me.hasOrganization &&
    !me.isActive &&
    !isAdmin &&
    !isSupport &&
    !allowInactiveAccountDeletion
  ) {
    return <InactiveAccountNotice />;
  }

  if (requireOrg && !isAdmin && !orgId) {
    if (membershipsLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      );
    }
    if (orgMemberships && orgMemberships.length > 0) {
      return <Navigate to="/select-org" replace />;
    }
    return <Navigate to="/setup-org" replace />;
  }

  const vid = viewIdForPath(location.pathname);
  if (
    vid &&
    me &&
    me.hasOrganization &&
    !isAdmin &&
    !isSupport &&
    !permsLoading &&
    !canView(vid)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
