import { Link, useLocation, useNavigate, Outlet } from "react-router-dom";
import { BarChart3, Building2, Users, Tag, ArrowLeft, Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";

const adminNavItems = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { to: "/admin/orgs", label: "Organizations", icon: Building2, exact: false },
  { to: "/admin/users", label: "Users", icon: Users, exact: false },
  { to: "/admin/pricing", label: "Pricing", icon: Tag, exact: false },
];

function AdminSidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-rose-900/80 flex items-center justify-center">
            <span className="text-rose-200 text-sm font-bold">A</span>
          </div>
          <div>
            <div className="text-white font-semibold text-sm tracking-wide">ADMIN</div>
            <div className="text-white/40 text-xs tracking-widest uppercase">Panel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {adminNavItems.map(({ to, label, icon: Icon, exact }) => {
          const isActive = exact
            ? location.pathname === to
            : location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-rose-900/40 text-rose-200 border border-rose-800/40"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
            >
              <Icon size={16} className={isActive ? "text-rose-300" : "text-white/40"} />
              <span className="font-medium">{label}</span>
              {isActive ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-400" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Back to App */}
      <div className="px-3 py-4 border-t border-white/10">
        <Link
          to="/"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-150"
        >
          <ArrowLeft size={15} />
          <span>Back to App</span>
        </Link>
      </div>
    </div>
  );
}

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = (() => {
    if (location.pathname === "/admin") return "Dashboard";
    if (location.pathname.startsWith("/admin/orgs/")) return "Organization Detail";
    if (location.pathname === "/admin/orgs") return "Organizations";
    if (location.pathname === "/admin/users") return "Users";
    if (location.pathname === "/admin/pricing") return "Pricing";
    return "Admin";
  })();

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Desktop Sidebar */}
      {!isMobile ? (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <AdminSidebarContent />
        </aside>
      ) : null}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-rose-900/30 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3">
          {isMobile ? (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/60 hover:text-white h-8 w-8 -ml-1">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="p-0 w-56 bg-[#0d0d14] border-r border-white/10"
              >
                <AdminSidebarContent onNav={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider border border-rose-800/50 bg-rose-950/40 px-2 py-0.5 rounded">
              Admin
            </span>
            <h1 className="text-sm font-semibold text-white/80 tracking-wide uppercase">{pageTitle}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// AdminRoute: checks if user is authenticated and has admin access
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();

  const { data: adminStats, isPending: adminPending, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/api/admin/stats"),
    enabled: !!session?.user,
    retry: false,
  });

  if (sessionPending || (session?.user && adminPending)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="text-center">
          <div className="text-rose-400 text-2xl font-bold mb-2">Access Denied</div>
          <div className="text-white/50 text-sm mb-4">You must be logged in to access this area.</div>
          <Link to="/login" className="text-rose-400 underline underline-offset-2 hover:text-rose-300">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const isAccessDenied = error instanceof ApiError && error.status === 403;
  if (isAccessDenied) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-rose-950/60 border border-rose-800/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-rose-400 text-2xl">!</span>
          </div>
          <div className="text-rose-400 text-xl font-bold mb-2">Access Denied</div>
          <div className="text-white/50 text-sm mb-4">
            You don't have admin permissions to access this area.
          </div>
          <Link to="/" className="text-rose-400 underline underline-offset-2 hover:text-rose-300">
            Back to App
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
