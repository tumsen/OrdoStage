import { Link, useLocation } from "react-router-dom";
import { CreditCard, FileText, LogIn, Mail, Menu, Shield, Sparkles, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";
import { getRoleBySlug, isPublicRoleSlug } from "@/lib/publicRoleFeatures";
import { ORDOSTAGE_MAILTO_HREF } from "@/lib/ordostageContact";

const navItems: { label: string; icon: LucideIcon; to: string; exact?: boolean }[] = [
  { to: "/#features", label: "Features", icon: Sparkles },
  { to: "/pricing", label: "Pricing", icon: CreditCard, exact: true },
  { to: "/terms-of-service", label: "Terms", icon: FileText, exact: true },
  { to: "/privacy-policy", label: "Privacy", icon: Shield, exact: true },
];

const pageTitles: Record<string, string> = {
  "/": "Home",
  "/features": "Features",
  "/pricing": "Pricing",
  "/terms-of-service": "Terms of Service",
  "/privacy-policy": "Privacy Policy",
  "/accept-invite": "Invitation",
  "/signup": "Sign up",
  "/login": "Log in",
};

function getPublicPageTitle(pathname: string): string {
  if (pathname in pageTitles) return pageTitles[pathname]!;
  const featuresMatch = /^\/features\/([^/]+)$/.exec(pathname);
  if (featuresMatch) {
    const slug = featuresMatch[1];
    if (isPublicRoleSlug(slug)) {
      const role = getRoleBySlug(slug);
      if (role) return `${role.title} · Features`;
    }
  }
  return "OrdoStage";
}

function PublicSidebarContent({ onNav }: { onNav?: () => void }) {
  const location = useLocation();

  function isNavActive(to: string, exact: boolean | undefined): boolean {
    if (to === "/#features") {
      return location.pathname === "/" || location.pathname.startsWith("/features");
    }
    if (exact) {
      return location.pathname === to;
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-4 border-b border-white/10 contain-layout">
        <Link
          to="/"
          onClick={onNav}
          className="block w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#ffbe0b]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d14]"
        >
          <OrdoStageLogo variant="sidebar" className="rounded-md max-h-[7.75rem]" />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 space-y-1" aria-label="Homepage sections and legal">
        {navItems.map(({ to, label, icon: Icon, exact }) => {
          const isActive = isNavActive(to, exact);
          return (
            <Link
              key={label + to}
              to={to}
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
        <a
          href={ORDOSTAGE_MAILTO_HREF}
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all duration-150"
        >
          <Mail size={16} className="text-white/40" />
          <span className="font-medium">Mail us</span>
        </a>
      </nav>

      <div className="shrink-0 px-3 py-4 border-t border-white/10 space-y-1">
        <Link
          to="/signup"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-gradient-to-r from-ordo-magenta/25 via-ordo-orange/15 to-ordo-violet/25 text-white border border-ordo-yellow/35 hover:border-ordo-yellow/55 transition-all duration-150"
        >
          <UserPlus size={16} className="text-ordo-yellow" />
          <span className="font-medium">Sign up free</span>
        </Link>
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
  const location = useLocation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = pageTitleOverride ?? getPublicPageTitle(location.pathname);

  useEffect(() => {
    document.title = `${pageTitle} · OrdoStage`;
  }, [pageTitle]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] bg-[#0a0a0f] text-white overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[260] -translate-y-full bg-ordo-violet/95 px-4 py-2 text-sm text-white shadow-lg transition-transform focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-ordo-yellow/50"
      >
        Skip to main content
      </a>

      {!isMobile ? (
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col overflow-hidden border-r border-white/10 bg-[#0d0d14]">
          <PublicSidebarContent />
        </aside>
      ) : null}

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", !isMobile && "pl-56")}>
        {isMobile ? (
          <header className="flex-shrink-0 min-h-12 border-b border-ordo-magenta/25 bg-[#0d0d14]/80 backdrop-blur flex items-center px-3 pt-[env(safe-area-inset-top)]">
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
          className="min-h-0 flex-1 touch-scroll-y outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/15"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
