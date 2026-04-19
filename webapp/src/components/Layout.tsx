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
  const { canView, isPending: permsLoading, me } = usePermissions();

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
      <div className="px-3 py-4 border-b border-white/10 contain-layout">
        <Link
          to="/dashboard"
          onClick={onNav}
          className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#ffbe0b]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d14]"
        >
          <OrdoStageLogo variant="sidebar" className="rounded-md max-h-[7.75rem]" />
        </Link>
      </div>

      {/* Nav — avoid showing every link then hiding (blink); skeleton until /api/me */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {permsLoading && session?.user && !navBypass && !me ? (
          <div className="space-y-1.5" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-white/[0.06] animate-pulse" />
            ))}
          </div>
        ) : (
          navItems
          .filter((item) => navBypass || canView(item.view))
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border border-transparent",
                "transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
                isActive
                  ? "bg-gradient-to-r from-ordo-magenta/28 via-ordo-yellow/18 to-ordo-violet/28 text-white border-ordo-yellow/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  : "text-white/55 hover:text-white hover:bg-white/[0.06] hover:border-white/5"
              )}
            >
              <Icon size={16} className={isActive ? "text-ordo-yellow" : "text-white/45"} />
              <span className="font-medium">{label}</span>
              {isActive ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-ordo-yellow shadow-[0_0_10px_rgba(255,190,59,0.65)]" />
              ) : null}
            </Link>
          );
        })
        )}
        {canAccessOwnerAdmin ? (
          <Link
            to="/admin"
            onClick={onNav}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border border-transparent",
              "transition-[color,background-color,border-color] duration-200 ease-out",
              location.pathname === "/admin" || location.pathname.startsWith("/admin/")
                ? "bg-gradient-to-r from-ordo-magenta/35 to-ordo-violet/35 text-white border-ordo-magenta/45"
                : "text-ordo-magenta/85 hover:text-white hover:bg-ordo-violet/15 hover:border-ordo-magenta/30 border-transparent"
            )}
          >
            <ShieldCheck
              size={16}
              className={
                location.pathname === "/admin" || location.pathname.startsWith("/admin/")
                  ? "text-ordo-yellow"
                  : "text-ordo-magenta/75"
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
            <div className="w-7 h-7 rounded-full bg-ordo-violet/45 ring-1 ring-ordo-magenta/25 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">{initials || "?"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white/70 text-xs truncate">{userName}</div>
              <span className="text-xs text-white/30 capitalize">{orgRole}</span>
            </div>
          </div>
        ) : null}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors duration-200"
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
      <div className="flex-shrink-0 bg-ordo-blue/15 border-b border-ordo-blue/35 px-4 py-2 flex items-center gap-2 text-sm">
        <Sparkles size={14} className="text-ordo-blue flex-shrink-0" />
        <span className="text-blue-100/95">
          Credits are low — a checkout is ready for your automatic top-up. Complete payment to add credits.
        </span>
        <a
          href={org.pendingAutoTopUpUrl}
          className="ml-auto text-white/95 underline underline-offset-2 hover:text-ordo-yellow whitespace-nowrap"
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
      <div className="flex-shrink-0 bg-ordo-orange/15 border-b border-ordo-yellow/35 px-4 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle size={14} className="text-ordo-yellow flex-shrink-0" />
        <span className="text-ordo-yellow/95">
          Low credits: {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining. Top up to avoid read-only mode.
        </span>
        <Link to="/billing" className="ml-auto text-ordo-yellow underline underline-offset-2 hover:text-white whitespace-nowrap">
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
        <header className="flex-shrink-0 h-14 border-b border-ordo-violet/20 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3">
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
