import { Link, useLocation } from "react-router-dom";
import { CreditCard, FileText, LogIn, Menu, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

const navItems: { label: string; icon: LucideIcon; to: string; homeHash?: string; exact?: boolean }[] = [
  { to: "/", label: "Features", icon: Sparkles, homeHash: "features" },
  { to: "/pricing", label: "Pricing", icon: CreditCard, exact: true },
  { to: "/terms-of-service", label: "Terms", icon: FileText, exact: true },
];

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/pricing": "Pricing",
  "/terms-of-service": "Terms of Service",
  "/privacy-policy": "Privacy Policy",
  "/accept-invite": "Invitation",
};

function getPublicPageTitle(pathname: string): string {
  if (pathname in pageTitles) return pageTitles[pathname]!;
  return "OrdoStage";
}

function PublicSidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  function isNavActive(
    to: string,
    exact: boolean | undefined,
    homeHash: string | undefined
  ): boolean {
    if (homeHash) {
      return location.pathname === "/" && location.hash === `#${homeHash}`;
    }
    if (exact) {
      return location.pathname === to;
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-4 border-b border-white/10 contain-layout">
        <Link
          to="/"
          onClick={onNav}
          className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#ffbe0b]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d14]"
        >
          <OrdoStageLogo variant="sidebar" className="rounded-md max-h-[7.75rem]" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Homepage sections and legal">
        {navItems.map(({ to, label, icon: Icon, exact, homeHash }) => {
          const isActive = isNavActive(to, exact, homeHash);
          const linkTo = homeHash ? { pathname: "/" as const, hash: homeHash } : to;
          return (
            <Link
              key={label + (homeHash ?? to)}
              to={linkTo}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-gradient-to-r from-ordo-magenta/30 via-ordo-yellow/15 to-ordo-violet/30 text-white border border-ordo-yellow/40"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
            >
              <Icon size={16} className={isActive ? "text-ordo-yellow" : "text-white/40"} />
              <span className="font-medium">{label}</span>
              {isActive ? <div className="ml-auto w-1.5 h-1.5 rounded-full bg-ordo-yellow" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <Link
          to="/login"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ordo-magenta/90 hover:text-white hover:bg-ordo-violet/20 border border-transparent hover:border-ordo-magenta/35 transition-all duration-150"
        >
          <LogIn size={16} className="text-ordo-magenta" />
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
        className="absolute left-4 top-0 z-[200] -translate-y-full bg-ordo-violet/95 px-4 py-2 text-sm text-white shadow-lg transition-transform focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-ordo-yellow/50"
      >
        Skip to main content
      </a>

      {!isMobile ? (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <PublicSidebarContent />
        </aside>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {isMobile ? (
          <header className="flex-shrink-0 h-12 border-b border-ordo-magenta/25 bg-[#0d0d14]/80 backdrop-blur flex items-center px-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/60 hover:text-white h-8 w-8">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-56 bg-[#0d0d14] border-r border-white/10">
                <PublicSidebarContent onNav={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          </header>
        ) : null}

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
