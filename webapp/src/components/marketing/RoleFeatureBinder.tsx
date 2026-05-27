import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";
import { buildCardFramePath, PANEL_STROKE } from "@/lib/roleFeatureFrame";
import {
  getRoleAccent,
  ORDO_ACCENT_STYLES,
  roleActiveTabSurface,
  rolePanelBackground,
  roleTabCard,
} from "@/lib/roleAccentStyles";
import { RoleFeatureDetailContent } from "@/components/marketing/RoleFeatureDetailContent";

type FrameLayout = {
  width: number;
  height: number;
  path: string;
};

type RoleFeatureBinderProps = {
  roles?: readonly PublicRoleFeature[];
  defaultSlug?: string;
  className?: string;
};

const TAB_BASE =
  "relative shrink-0 whitespace-nowrap rounded-t-xl rounded-bl-none rounded-br-none border-2 border-b-0 px-3 py-2.5 shadow-none sm:px-4 sm:py-3 text-sm sm:text-base font-semibold";

export function RoleFeatureBinder({
  roles = PUBLIC_ROLE_FEATURES,
  defaultSlug = roles[0]?.slug,
  className,
}: RoleFeatureBinderProps) {
  const [activeSlug, setActiveSlug] = useState(defaultSlug ?? roles[0]?.slug ?? "");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<FrameLayout | null>(null);

  const activeRole = roles.find((r) => r.slug === activeSlug) ?? roles[0];
  const activeAccent = activeRole ? getRoleAccent(activeRole.slug) : "magenta";
  const activeStyles = ORDO_ACCENT_STYLES[activeAccent];

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeTab = activeTabRef.current;
    const panel = panelRef.current;
    if (!container || !activeTab || !panel) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeTab.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const width = containerRect.width;
      const joinY = activeRect.bottom - containerRect.top;
      const panelBottom = panelRect.bottom - containerRect.top;
      const tabLeft = activeRect.left - containerRect.left;
      const tabRight = activeRect.right - containerRect.left;
      const tabTop = activeRect.top - containerRect.top;

      setFrame({
        width,
        height: containerRect.height,
        path: buildCardFramePath(width, joinY, panelBottom, tabLeft, tabRight, tabTop),
      });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeSlug]);

  if (!activeRole) return null;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {frame != null ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={frame.width}
          height={frame.height}
        >
          <path
            d={frame.path}
            fill="none"
            stroke={PANEL_STROKE[activeAccent]}
            strokeWidth={2}
            strokeLinejoin="miter"
            strokeMiterlimit={10}
            strokeLinecap="butt"
          />
        </svg>
      ) : null}

      <div
        className="relative z-10 flex shrink-0 items-end gap-2 overflow-x-auto overscroll-x-contain bg-transparent pl-4 pb-0.5 sm:pl-5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Roles in your organisation"
      >
        {roles.map((role) => {
          const isActive = role.slug === activeRole.slug;
          const tabStyles = ORDO_ACCENT_STYLES[getRoleAccent(role.slug)];

          return (
            <button
              key={role.slug}
              ref={isActive ? activeTabRef : undefined}
              type="button"
              role="tab"
              id={`role-tab-${role.slug}`}
              aria-selected={isActive}
              aria-controls="role-feature-panel"
              onClick={() => setActiveSlug(role.slug)}
              className={cn(
                TAB_BASE,
                isActive
                  ? cn("z-20 border-transparent text-white shadow-none", roleActiveTabSurface(activeStyles))
                  : cn("z-10 text-white/90 shadow-none hover:text-white", roleTabCard(tabStyles))
              )}
            >
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
        className={cn("relative z-[1] -mt-0.5 rounded-2xl p-6 sm:p-8 md:p-9", rolePanelBackground(activeStyles))}
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
