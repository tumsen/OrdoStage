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
      left: tabRect.left - panelRect.left,
      width: tabRect.width,
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
        className="flex w-full flex-wrap sm:flex-nowrap overflow-x-auto overscroll-x-contain border-b border-white/10 [scrollbar-width:thin]"
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
                "relative shrink-0 whitespace-nowrap px-4 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-base font-semibold transition-all duration-200",
                "border border-b-0 -mb-px",
                isActive
                  ? cn(
                      "z-20 rounded-t-xl",
                      styles.panelBorder,
                      styles.panelBg,
                      styles.tabTitle,
                      "shadow-[0_2px_0_0_#12121c]"
                    )
                  : cn(
                      "z-10 mb-0 rounded-t-lg opacity-80 hover:opacity-100",
                      styles.tabInactive,
                      styles.tabTitleInactive
                    )
              )}
            >
              {isActive ? (
                <span
                  aria-hidden
                  className={cn("absolute inset-x-0 top-0 h-0.5 rounded-t-[inherit]", styles.tabBar)}
                />
              ) : null}
              {role.title}
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
          "relative w-full rounded-b-2xl border border-t-0 p-6 sm:p-8 md:p-9",
          activeStyles.panelBorder,
          activeStyles.panelBg,
          activeStyles.panelInset
        )}
      >
        {connector ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 h-0.5 transition-all duration-200 ease-out",
              activeStyles.connector
            )}
            style={{ left: connector.left, width: connector.width }}
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
