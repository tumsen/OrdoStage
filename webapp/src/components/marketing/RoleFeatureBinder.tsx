import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";
import { getRoleAccent, ORDO_ACCENT_STYLES } from "@/lib/roleAccentStyles";
import { RoleFeatureDetailContent } from "@/components/marketing/RoleFeatureDetailContent";

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
  const activeAccent = activeRole ? getRoleAccent(activeRole.slug) : "magenta";
  const activeStyles = ORDO_ACCENT_STYLES[activeAccent];

  const updateConnector = useCallback(() => {
    if (!activeRole || !panelRef.current) return;
    const tab = tabRefs.current.get(activeRole.slug);
    const panel = panelRef.current;
    if (!tab) return;

    const tabRect = tab.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    setConnector({
      left: tabRect.left - panelRect.left + tabRect.width / 2,
      width: Math.min(tabRect.width - 16, 180),
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
        className="grid w-full gap-3 sm:gap-4 grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7"
        role="tablist"
        aria-label="Roles in your organisation"
      >
        {roles.map((role) => {
          const isActive = role.slug === activeRole.slug;
          const accent = getRoleAccent(role.slug);
          const styles = ORDO_ACCENT_STYLES[accent];

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
                "relative flex flex-col overflow-hidden rounded-t-2xl border text-left transition-all duration-200",
                "p-5 sm:p-6 gap-2.5 min-h-[11rem] sm:min-h-[12rem]",
                isActive ? cn("z-20 rounded-b-none", styles.tabActive) : cn("z-10 rounded-2xl", styles.tabInactive)
              )}
            >
              <span
                aria-hidden
                className={cn("absolute inset-x-0 top-0 h-1", styles.tabBar, isActive ? "opacity-100" : "opacity-70")}
              />
              <span
                className={cn(
                  "pt-1 text-lg sm:text-xl font-bold leading-snug tracking-tight",
                  isActive ? styles.tabTitle : styles.tabTitleInactive
                )}
              >
                {role.title}
              </span>
              <span className="flex-1 text-sm sm:text-base leading-relaxed text-white/75">{role.intro}</span>
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
          "relative -mt-px rounded-b-2xl rounded-tr-2xl border p-6 sm:p-8 md:p-9",
          activeStyles.panelBorder,
          activeStyles.panelBg,
          activeStyles.panelInset
        )}
      >
        {connector ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 h-1 rounded-full transition-all duration-200 ease-out",
              activeStyles.connector
            )}
            style={{
              left: connector.left - connector.width / 2,
              width: connector.width,
            }}
          />
        ) : null}

        <header className="mb-8 space-y-3 border-b border-white/10 pb-6">
          <p className={cn("text-xs font-bold uppercase tracking-widest", activeStyles.headerEyebrow)}>
            For {activeRole.title}s
          </p>
          <h3 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl tracking-tight">{activeRole.title}</h3>
          <p className="text-base sm:text-lg leading-relaxed text-white/80 max-w-4xl">{activeRole.heroLead}</p>
        </header>

        <RoleFeatureDetailContent role={activeRole} showHeroLead={false} accent={activeAccent} />
      </div>
    </div>
  );
}
