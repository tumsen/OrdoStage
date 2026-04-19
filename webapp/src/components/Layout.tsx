import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  MapPin,
  Users,
  UsersRound,
  Share2,
  Menu,
  CreditCard,
  LogOut,
  AlertTriangle,
  XCircle,
  Route,
  ShieldCheck,
  Sparkles,
  UserCircle,
  KeyRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useSession, signOut } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

interface OrgData {
  id: string;
  name: string;
  credits: number;
  userCount: number;
  warning: boolean;
  blocked: boolean;
  unlimitedCredits?: boolean;
  estimatedDaysRemaining?: number | null;
  pendingAutoTopUpUrl?: string | null;
}

const navItems: { to: string; label: string; icon: LucideIcon; view: string }[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
  { to: "/events", label: "Events", icon: CalendarDays, view: "events" },
  { to: "/schedule", label: "Schedule", icon: CalendarRange, view: "schedule" },
  { to: "/tours", label: "Tours", icon: Route, view: "tours" },
  { to: "/venues", label: "Venues", icon: MapPin, view: "venues" },
  { to: "/people", label: "People", icon: Users, view: "people" },
  { to: "/team", label: "Team", icon: UsersRound, view: "team" },
  { to: "/calendars", label: "Calendars", icon: Share2, view: "calendars" },
  { to: "/billing", label: "Billing", icon: CreditCard, view: "billing" },
  { to: "/roles", label: "Roles", icon: KeyRound, view: "roles" },
  { to: "/account", label: "Account", icon: UserCircle, view: "account" },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/events": "Events",
  "/events/new": "New Event",
  "/schedule": "Schedule",
  "/tours": "Tours",
  "/venues": "Venues",
  "/people": "People",
  "/team": "Team",
  "/calendars": "Calendars",
  "/billing": "Billing",
  "/roles": "Roles",
  "/account": "Account",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/events/") && pathname !== "/events/new") {
    return "Event Detail";
  }
  if (pathname.startsWith("/tours/")) {
    return "Tour Detail";
  }
  return pageTitles[pathname] ?? "OrdoStage";
}

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { canView, isPending: permsLoading } = usePermissions();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const userEmail = session?.user?.email ?? "";
  const userName = session?.user?.name ?? userEmail;
  const orgRole = (session?.user as Record<string, unknown>)?.orgRole as string ?? "viewer";
  const isAdmin = Boolean((session?.user as Record<string, unknown> | undefined)?.isAdmin);
  const isSupportUser = userEmail.toLowerCase() === "tumsen@gmail.com";
  const canAccessOwnerAdmin = isAdmin || isSupportUser;
  const navBypass = canAccessOwnerAdmin;
  const initials = userName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-3 py-4 border-b border-white/10">
        <Link
          to="/dashboard"
          onClick={onNav}
          className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
        >
          <OrdoStageLogo variant="sidebar" className="rounded-md max-h-[7.75rem]" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems
          .filter((item) => navBypass || permsLoading || canView(item.view))
          .map(({ to, label, icon: Icon }) => {
          const isActive =
            to === "/dashboard"
              ? location.pathname === "/dashboard"
              : location.pathname === to || location.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-red-900/40 text-red-200 border border-red-800/40"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
            >
              <Icon size={16} className={isActive ? "text-red-300" : "text-white/40"} />
              <span className="font-medium">{label}</span>
              {isActive ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400" />
              ) : null}
            </Link>
          );
        })}
        {canAccessOwnerAdmin ? (
          <Link
            to="/admin"
            onClick={onNav}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
              location.pathname === "/admin" || location.pathname.startsWith("/admin/")
                ? "bg-rose-900/40 text-rose-200 border border-rose-800/40"
                : "text-rose-300/70 hover:text-rose-200 hover:bg-rose-900/20 border border-rose-900/30"
            )}
          >
            <ShieldCheck
              size={16}
              className={
                location.pathname === "/admin" || location.pathname.startsWith("/admin/")
                  ? "text-rose-300"
                  : "text-rose-300/70"
              }
            />
            <span className="font-medium">Owner Admin</span>
          </Link>
        ) : null}
      </nav>

      {/* User + Sign out */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {session?.user ? (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-purple-700/60 flex items-center justify-center flex-shrink-0">
              <span className="text-purple-200 text-xs font-semibold">{initials || "?"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-xs truncate">{userName}</div>
              <span className="text-xs text-white/30 capitalize">{orgRole}</span>
            </div>
          </div>
        ) : null}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-150"
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

function CreditBanner() {
  const { data: org } = useQuery<OrgData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgData>("/api/org"),
    staleTime: 60_000,
  });

  if (!org) return null;

  if (org.unlimitedCredits) return null;

  const credits = org.credits ?? 0;
  const userCount = org.userCount ?? 1;
  const daysLeft =
    org.estimatedDaysRemaining != null
      ? org.estimatedDaysRemaining
      : userCount > 0
        ? Math.floor(credits / userCount)
        : credits;

  if (org.pendingAutoTopUpUrl) {
    return (
      <div className="flex-shrink-0 bg-indigo-950/80 border-b border-indigo-500/30 px-4 py-2 flex items-center gap-2 text-sm">
        <Sparkles size={14} className="text-indigo-300 flex-shrink-0" />
        <span className="text-indigo-200">
          Credits are low — a checkout is ready for your automatic top-up. Complete payment to add credits.
        </span>
        <a
          href={org.pendingAutoTopUpUrl}
          className="ml-auto text-indigo-100 underline underline-offset-2 hover:text-white whitespace-nowrap"
        >
          Pay now →
        </a>
      </div>
    );
  }

  if (org.blocked || credits <= 0) {
    return (
      <div className="flex-shrink-0 bg-red-950/80 border-b border-red-800/50 px-4 py-2 flex items-center gap-2 text-sm">
        <XCircle size={14} className="text-red-400 flex-shrink-0" />
        <span className="text-red-300">No credits remaining. Your account is in read-only mode.</span>
        <Link to="/billing" className="ml-auto text-red-200 underline underline-offset-2 hover:text-white whitespace-nowrap">
          Buy Credits →
        </Link>
      </div>
    );
  }

  if (org.warning && daysLeft <= 30) {
    return (
      <div className="flex-shrink-0 bg-amber-950/70 border-b border-amber-800/40 px-4 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
        <span className="text-amber-300">
          Low credits: {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining. Top up to avoid read-only mode.
        </span>
        <Link to="/billing" className="ml-auto text-amber-200 underline underline-offset-2 hover:text-white whitespace-nowrap">
          Buy Credits →
        </Link>
      </div>
    );
  }

  return null;
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = getPageTitle(location.pathname);

  useEffect(() => {
    document.title = `${title} · OrdoStage`;
  }, [title]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[200] -translate-y-full bg-red-900 px-4 py-2 text-sm text-white shadow-lg transition-transform focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        Skip to main content
      </a>
      {/* Desktop Sidebar */}
      {!isMobile ? (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <SidebarContent />
        </aside>
      ) : null}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-white/10 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3">
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
                <SidebarContent onNav={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          ) : null}
          <h1 className="text-sm font-semibold text-white/80 tracking-wide uppercase">{title}</h1>
        </header>

        {/* Credit warning banner */}
        <CreditBanner />

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/15">
          {children}
        </main>
      </div>
    </div>
  );
}
