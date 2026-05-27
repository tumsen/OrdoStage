import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";
import { getRoleAccent, ORDO_ACCENT_STYLES, rolePanelFill, roleTabCard } from "@/lib/roleAccentStyles";
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
        className="relative flex shrink-0 items-end gap-2 overflow-x-auto overscroll-x-contain bg-transparent pl-4 sm:pl-5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Roles in your organisation"
      >
        {roles.map((role) => {
          const isActive = role.slug === activeRole.slug;
          const styles = ORDO_ACCENT_STYLES[getRoleAccent(role.slug)];

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
                "relative shrink-0 whitespace-nowrap rounded-t-xl rounded-bl-none rounded-br-none border-2 border-b-0 px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base font-semibold transition-shadow duration-200",
                roleTabCard(styles),
                isActive
                  ? "z-20 -mb-0.5 text-white shadow-[0_-4px_14px_rgba(0,0,0,0.35)]"
                  : "z-10 text-white/90 hover:text-white"
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
          "relative z-[1] overflow-hidden rounded-2xl border-2 border-t-0 p-6 sm:p-8 md:p-9",
          rolePanelFill(activeStyles)
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
