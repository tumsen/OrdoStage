import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarDays, MapPin, Users, Share2, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/venues", label: "Venues", icon: MapPin },
  { to: "/people", label: "People", icon: Users },
  { to: "/calendars", label: "Calendars", icon: Share2 },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/events": "Events",
  "/events/new": "New Event",
  "/venues": "Venues",
  "/people": "People",
  "/calendars": "Calendars",
};

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/events/") && pathname !== "/events/new") {
    return "Event Detail";
  }
  return pageTitles[pathname] ?? "Theater Planner";
}

function SidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-red-900/80 flex items-center justify-center">
            <span className="text-red-200 text-sm font-bold">T</span>
          </div>
          <div>
            <div className="text-white font-semibold text-sm tracking-wide">THEATER</div>
            <div className="text-white/40 text-xs tracking-widest uppercase">Planner</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === "/"
              ? location.pathname === "/"
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
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <div className="text-white/20 text-xs">Stage &amp; Curtain Co.</div>
      </div>
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = getPageTitle(location.pathname);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <SidebarContent />
        </aside>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-white/10 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3">
          {isMobile && (
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
          )}
          <h1 className="text-sm font-semibold text-white/80 tracking-wide uppercase">{title}</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
