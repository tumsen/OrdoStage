import { Navigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";

export function ProtectedRoute({ children, requireOrg = true }: { children: React.ReactNode; requireOrg?: boolean }) {
  const { data: session, isPending } = useSession();
  if (isPending) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
    </div>
  );
  if (!session?.user) return <Navigate to="/login" replace />;
  if (requireOrg && !(session.user as unknown as { organizationId?: string }).organizationId) {
    return <Navigate to="/setup-org" replace />;
  }
  return <>{children}</>;
}
