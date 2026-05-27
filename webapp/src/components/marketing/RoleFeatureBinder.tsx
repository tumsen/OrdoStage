import { useState } from "react";
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

  const activeRole = roles.find((r) => r.slug === activeSlug) ?? roles[0];
  const activeAccent = activeRole ? getRoleAccent(activeRole.slug) : "magenta";
  const activeStyles = ORDO_ACCENT_STYLES[activeAccent];

  if (!activeRole) return null;

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex w-full flex-wrap sm:flex-nowrap gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
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
              onClick={() => setActiveSlug(role.slug)}
              className={cn(
                "shrink-0 whitespace-nowrap px-4 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-base font-semibold transition-colors duration-200",
                "border-2 border-b-0",
                isActive
                  ? cn("z-20 -mb-0.5 rounded-t-xl text-white", styles.panelBorder, styles.panelBg)
                  : cn(
                      "z-10 rounded-t-xl text-white/70 opacity-80 hover:text-white/90 hover:opacity-100",
                      styles.tabInactive
                    )
              )}
            >
              {role.title}
            </button>
          );
        })}
      </div>

      <div
        id="role-feature-panel"
        role="tabpanel"
        aria-labelledby={`role-tab-${activeRole.slug}`}
        className={cn(
          "relative w-full rounded-b-2xl border-2 border-t-0 p-6 sm:p-8 md:p-9",
          activeStyles.panelBorder,
          activeStyles.panelBg
        )}
      >
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
