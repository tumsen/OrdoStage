import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";
import { RoleFeatureDetailContent } from "@/components/marketing/RoleFeatureDetailContent";

const PANEL_BG = "bg-[#12121c]";

type RoleFeatureBinderProps = {
  roles?: readonly PublicRoleFeature[];
  defaultSlug?: string;
  className?: string;
};

export function RoleFeatureBinder({
  roles = PUBLIC_ROLE_FEATURES,
  defaultSlug = roles[0]?.slug,
  className,
}: RoleFeatureBinderProps) {
  const [activeSlug, setActiveSlug] = useState(defaultSlug ?? roles[0]?.slug ?? "");
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);
  const [connector, setConnector] = useState<{ left: number; width: number } | null>(null);

  const activeRole = roles.find((r) => r.slug === activeSlug) ?? roles[0];

  const updateConnector = useCallback(() => {
    if (!activeRole || !panelRef.current) return;
    const tab = tabRefs.current.get(activeRole.slug);
    const panel = panelRef.current;
    if (!tab) return;

    const tabRect = tab.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    setConnector({
      left: tabRect.left - panelRect.left + tabRect.width / 2,
      width: Math.min(tabRect.width - 12, 160),
    });
  }, [activeRole]);

  useLayoutEffect(() => {
    updateConnector();
    window.addEventListener("resize", updateConnector);
    return () => window.removeEventListener("resize", updateConnector);
  }, [updateConnector, activeSlug]);

  if (!activeRole) return null;

  return (
    <div className={cn("w-full", className)}>
      <div
        className="grid w-full gap-3 grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
        role="tablist"
        aria-label="Roles in your organisation"
      >
        {roles.map((role) => {
          const isActive = role.slug === activeRole.slug;
          return (
            <button
              key={role.slug}
              type="button"
              role="tab"
              id={`role-tab-${role.slug}`}
              aria-selected={isActive}
              aria-controls="role-feature-panel"
              ref={(el) => {
                if (el) tabRefs.current.set(role.slug, el);
                else tabRefs.current.delete(role.slug);
              }}
              onClick={() => setActiveSlug(role.slug)}
              className={cn(
                "relative flex flex-col rounded-t-xl border text-left transition-all duration-200",
                "p-4 sm:p-5 gap-2 min-h-[9.5rem] sm:min-h-[10.5rem]",
                isActive
                  ? cn(
                      "z-20 border-ordo-yellow/45 border-b-transparent",
                      PANEL_BG,
                      "shadow-[0_-2px_12px_rgba(255,190,11,0.08)]"
                    )
                  : "z-10 border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] rounded-xl"
              )}
            >
              <span
                className={cn(
                  "text-base font-semibold leading-snug",
                  isActive ? "text-white" : "text-white/90"
                )}
              >
                {role.title}
              </span>
              <span className="flex-1 text-sm leading-relaxed text-white/70">{role.intro}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={panelRef}
        id="role-feature-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${activeRole.slug}`}
        className={cn(
          "relative -mt-px rounded-b-2xl rounded-tr-2xl border border-ordo-yellow/45",
          PANEL_BG,
          "p-5 sm:p-7 shadow-[inset_0_1px_0_rgba(255,190,11,0.12)]"
        )}
      >
        {connector ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 h-0.5 bg-ordo-yellow/70 transition-all duration-200 ease-out"
            style={{
              left: connector.left - connector.width / 2,
              width: connector.width,
            }}
          />
        ) : null}

        <header className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ordo-yellow/90">
            For {activeRole.title}s
          </p>
          <h3 className="text-xl font-semibold text-white md:text-2xl">{activeRole.title}</h3>
        </header>

        <RoleFeatureDetailContent role={activeRole} />
      </div>
    </div>
  );
}
