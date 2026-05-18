import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "@/components/Layout";

interface GuestAuthLayoutProps {
  children: React.ReactNode;
  /** Document title segment before " · OrdoStage" */
  pageTitle?: string;
}

export function GuestAuthLayout({ children, pageTitle = "Sign in" }: GuestAuthLayoutProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.title = `${pageTitle} · OrdoStage`;
  }, [pageTitle]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[260] -translate-y-full bg-ordo-violet/95 px-4 py-2 text-sm text-white shadow-lg transition-transform focus:translate-y-4 focus:outline-none focus:ring-2 focus:ring-ordo-yellow/50"
      >
        Skip to main content
      </a>

      {!isMobile ? (
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col overflow-hidden border-r border-white/10 bg-[#0d0d14]">
          <SidebarContent />
        </aside>
      ) : null}

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", !isMobile && "pl-56")}>
        {isMobile ? (
          <header className="flex-shrink-0 h-12 border-b border-ordo-violet/20 bg-[#0d0d14]/80 backdrop-blur flex items-center px-3 pt-[env(safe-area-inset-top)]">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/60 hover:text-white h-9 w-9 min-h-9 min-w-9"
                  aria-label="Open menu"
                >
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="p-0 w-56 bg-[#0d0d14] border-r border-white/10 pb-[env(safe-area-inset-bottom)]"
              >
                <SidebarContent onNav={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
          </header>
        ) : null}

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/15"
        >
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
