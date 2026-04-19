import { Link, useLocation } from "react-router-dom";
import {
  CreditCard,
  FileText,
  Home,
  LogIn,
  Menu,
  RotateCcw,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

const navItems: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/pricing", label: "Pricing", icon: CreditCard },
  { to: "/terms-of-service", label: "Terms", icon: FileText },
  { to: "/privacy-policy", label: "Privacy", icon: Shield },
  { to: "/refund-policy", label: "Refunds", icon: RotateCcw },
];

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/pricing": "Pricing",
  "/terms-of-service": "Terms of Service",
  "/privacy-policy": "Privacy Policy",
  "/refund-policy": "Refund Policy",
  "/accept-invite": "Invitation",
};

function getPublicPageTitle(pathname: string): string {
  if (pathname in pageTitles) return pageTitles[pathname]!;
  return "OrdoStage";
}

function PublicSidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-4 border-b border-white/10 contain-layout">
        <Link
          to="/"
          onClick={onNav}
          className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d14]"
        >
          <OrdoStageLogo variant="sidebar" className="rounded-md max-h-[7.75rem]" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, exact }) => {
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
              {isActive ? <div className="ml-auto w-1.5 h-1.5 rounded-full bg-rose-400" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <Link
          to="/login"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-rose-200/90 hover:text-white hover:bg-rose-950/40 border border-transparent hover:border-rose-800/30 transition-all duration-150"
        >
          <LogIn size={16} className="text-rose-400/90" />
          <span className="font-medium">Log in</span>
        </Link>
      </div>
    </div>
  );
}

interface PublicLayoutProps {
  children: React.ReactNode;
  /** Use for catch-all routes (e.g. 404) where the pathname is not a known marketing page. */
  pageTitleOverride?: string;
}

export function PublicLayout({ children, pageTitleOverride }: PublicLayoutProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = pageTitleOverride ?? getPublicPageTitle(location.pathname);

  useEffect(() => {
    document.title = `${pageTitle} · OrdoStage`;
  }, [pageTitle]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[200] -translate-y-full bg-rose-900 px-4 py-2 text-sm text-white shadow-lg transition-transform focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        Skip to main content
      </a>

      {!isMobile ? (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <PublicSidebarContent />
        </aside>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-14 border-b border-rose-900/30 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3">
          {isMobile ? (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/60 hover:text-white h-8 w-8 -ml-1">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-56 bg-[#0d0d14] border-r border-white/10">
                <PublicSidebarContent onNav={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          ) : null}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-rose-500 uppercase tracking-wider border border-rose-800/50 bg-rose-950/40 px-2 py-0.5 rounded shrink-0">
              Site
            </span>
            <h1 className="text-sm font-semibold text-white/80 tracking-wide uppercase truncate">{pageTitle}</h1>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/15"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
