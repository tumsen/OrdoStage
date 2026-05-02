import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/lib/auth-client";

/** Password flows stay reachable while logged in (session cookie, shared device, billing stress). */
const PASSWORD_RECOVERY_PATHS = new Set(["/forgot-password", "/reset-password"]);

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: session, isPending } = useSession();
  if (isPending) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
    </div>
  );
  if (session?.user && !PASSWORD_RECOVERY_PATHS.has(location.pathname)) {
    const oid = (session.user as { organizationId?: string }).organizationId;
    if (oid) return <Navigate to="/dashboard" replace />;
    return <Navigate to="/select-org" replace />;
  }
  return <>{children}</>;
}
