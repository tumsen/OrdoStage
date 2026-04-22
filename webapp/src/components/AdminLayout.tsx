import { Link, useLocation } from "react-router-dom";
import { BarChart3, Building2, Users, Tag, ArrowLeft, Menu, FileText } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";
import { AdminPanelLanguageProvider } from "@/contexts/AdminPanelLanguageContext";
import { useAdminI18n, type TranslationKey } from "@/lib/i18n";
import { SUPPORTED_LANGUAGES, type Language, languageLabel } from "@/lib/preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const adminNavDefs = [
  { to: "/admin", labelKey: "admin.nav.dashboard" as const, icon: BarChart3, exact: true },
  { to: "/admin/orgs", labelKey: "admin.nav.organizations" as const, icon: Building2, exact: false },
  { to: "/admin/users", labelKey: "admin.nav.users" as const, icon: Users, exact: false },
  { to: "/admin/pricing", labelKey: "admin.nav.pricing" as const, icon: Tag, exact: false },
  { to: "/admin/site-content", labelKey: "admin.nav.websiteContent" as const, icon: FileText, exact: false },
] satisfies ReadonlyArray<{
  to: string;
  labelKey: TranslationKey;
  icon: typeof BarChart3;
  exact: boolean;
}>;

type TFn = (key: TranslationKey) => string;

function AdminSidebarContent({ onNav, t }: { onNav?: () => void; t: TFn }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-white/10">
        <Link
          to="/admin"
          onClick={onNav}
          className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#ffbe0b]/55"
        >
          <OrdoStageLogo size={44} />
          <div>
            <div className="text-white font-semibold text-xs tracking-wide">{t("admin.badge")}</div>
            <div className="text-white/40 text-[10px] tracking-widest uppercase">{t("admin.panel")}</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {adminNavDefs.map(({ to, labelKey, icon: Icon, exact }) => {
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
                  ? "bg-gradient-to-r from-ordo-magenta/30 via-ordo-yellow/15 to-ordo-violet/30 text-white border border-ordo-yellow/40"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
            >
              <Icon size={16} className={isActive ? "text-ordo-yellow" : "text-white/40"} />
              <span className="font-medium">{t(labelKey)}</span>
              {isActive ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-ordo-yellow" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <Link
          to="/dashboard"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-150"
        >
          <ArrowLeft size={15} />
          <span>{t("admin.backToApp")}</span>
        </Link>
      </div>
    </div>
  );
}

function AdminPageTitle() {
  const location = useLocation();
  const { t } = useAdminI18n();
  if (location.pathname === "/admin") return <>{t("admin.pageTitle.dashboard")}</>;
  if (location.pathname.startsWith("/admin/orgs/")) return <>{t("admin.pageTitle.orgDetail")}</>;
  if (location.pathname === "/admin/orgs") return <>{t("admin.pageTitle.organizations")}</>;
  if (location.pathname === "/admin/users") return <>{t("admin.pageTitle.users")}</>;
  if (location.pathname === "/admin/pricing") return <>{t("admin.pageTitle.pricing")}</>;
  if (location.pathname === "/admin/site-content") return <>{t("admin.pageTitle.websiteContent")}</>;
  return <>{t("admin.pageTitle.unknown")}</>;
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { t, language, setLanguage } = useAdminI18n();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {!isMobile ? (
        <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
          <AdminSidebarContent t={t} />
        </aside>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-14 border-b border-ordo-violet/25 bg-[#0d0d14]/80 backdrop-blur flex items-center px-4 md:px-6 gap-3 min-w-0">
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
                <AdminSidebarContent onNav={() => setMobileOpen(false)} t={t} />
              </SheetContent>
            </Sheet>
          ) : null}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-semibold text-ordo-yellow uppercase tracking-wider border border-ordo-magenta/45 bg-ordo-violet/25 px-2 py-0.5 rounded flex-shrink-0">
              {t("admin.badge")}
            </span>
            <h1 className="text-sm font-semibold text-white/80 tracking-wide uppercase truncate">
              <AdminPageTitle />
            </h1>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
              <span className="text-[11px] text-white/40 hidden sm:inline max-w-[9rem] text-right">
                {t("admin.uiLanguage")}
              </span>
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as Language)}
                aria-label={t("admin.uiLanguage")}
              >
                <SelectTrigger
                  className="h-8 w-[min(11rem,42vw)] border-white/20 bg-[#0a0a0f] text-white/90 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang} className="text-sm">
                      {languageLabel(lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminPanelLanguageProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminPanelLanguageProvider>
  );
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending: sessionPending } = useSession();

  const { isPending: adminPending, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/api/admin/stats"),
    enabled: !!session?.user,
    retry: false,
  });

  if (sessionPending || (session?.user && adminPending)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ordo-yellow" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="text-center">
          <div className="text-ordo-magenta text-2xl font-bold mb-2">Access Denied</div>
          <div className="text-white/50 text-sm mb-4">You must be logged in to access this area.</div>
          <Link to="/login" className="text-ordo-yellow underline underline-offset-2 hover:text-white">
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
          <div className="w-16 h-16 rounded-full bg-ordo-violet/35 border border-ordo-magenta/35 flex items-center justify-center mx-auto mb-4">
            <span className="text-ordo-yellow text-2xl">!</span>
          </div>
          <div className="text-ordo-magenta text-xl font-bold mb-2">Access Denied</div>
          <div className="text-white/50 text-sm mb-4">You don&apos;t have admin permissions to access this area.</div>
          <Link to="/dashboard" className="text-ordo-yellow underline underline-offset-2 hover:text-white">
            Back to App
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
