import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getPublicRoleFeatures, type PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { usePublicSiteLanguage } from "@/contexts/PublicSiteLanguageContext";
import { useMarketingCopy } from "@/lib/marketing/i18n";
import { buildCardFramePath, buildCardTopJoinPaths, PANEL_STROKE } from "@/lib/roleFeatureFrame";
import {
  getRoleAccent,
  ORDO_ACCENT_STYLES,
  roleActiveTabSurface,
  rolePanelBackground,
  rolePanelFill,
  roleTabCard,
} from "@/lib/roleAccentStyles";
import { RoleFeatureDetailContent } from "@/components/marketing/RoleFeatureDetailContent";

type FrameLayout = {
  width: number;
  height: number;
  path: string;
  topJoinLeft: string;
  topJoinRight: string;
  inactiveClipBottom: Record<string, number>;
};

type RoleFeatureBinderProps = {
  roles?: readonly PublicRoleFeature[];
  defaultSlug?: string;
  className?: string;
};

const TAB_BASE =
  "relative shrink-0 whitespace-nowrap rounded-t-xl rounded-bl-none rounded-br-none border-2 border-b-0 px-3 py-2.5 shadow-none sm:px-4 sm:py-3 text-sm sm:text-base font-semibold";

const STACKED_CARD_BASE =
  "w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold shadow-none sm:text-base";

export function RoleFeatureBinder({
  roles: rolesProp,
  defaultSlug: defaultSlugProp,
  className,
}: RoleFeatureBinderProps) {
  const { language } = usePublicSiteLanguage();
  const { t } = useMarketingCopy();
  const roles = rolesProp ?? getPublicRoleFeatures(language);
  const defaultSlug = defaultSlugProp ?? roles[0]?.slug;
  const [activeSlug, setActiveSlug] = useState(defaultSlug ?? roles[0]?.slug ?? "");
  const [stacked, setStacked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<FrameLayout | null>(null);

  const activeRole = roles.find((r) => r.slug === activeSlug) ?? roles[0];
  const activeAccent = activeRole ? getRoleAccent(activeRole.slug) : "magenta";
  const activeStyles = ORDO_ACCENT_STYLES[activeAccent];

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measureRow = measureRowRef.current;
    if (!container || !measureRow) return;

    const update = () => {
      setStacked(measureRow.scrollWidth > container.clientWidth);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measureRow);
    return () => observer.disconnect();
  }, [roles, language]);

  useLayoutEffect(() => {
    if (stacked) {
      setFrame(null);
      return;
    }

    const container = containerRef.current;
    const activeTab = activeTabRef.current;
    const panel = panelRef.current;
    if (!container || !activeTab || !panel) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeTab.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');

      const width = containerRect.width;
      let joinY = 0;
      const inactiveClipBottom: Record<string, number> = {};
      tabs.forEach((tab) => {
        const bottom = tab.getBoundingClientRect().bottom - containerRect.top;
        joinY = Math.max(joinY, bottom);
        const slug = tab.id.replace("role-tab-", "");
        inactiveClipBottom[slug] = 0;
      });
      tabs.forEach((tab) => {
        const bottom = tab.getBoundingClientRect().bottom - containerRect.top;
        const slug = tab.id.replace("role-tab-", "");
        inactiveClipBottom[slug] = Math.max(0, Math.round(bottom - joinY));
      });

      const panelBottom = panelRect.bottom - containerRect.top;
      const tabLeft = activeRect.left - containerRect.left;
      const tabRight = activeRect.right - containerRect.left;
      const tabTop = activeRect.top - containerRect.top;
      const topJoin = buildCardTopJoinPaths(width, joinY, tabLeft, tabRight);

      setFrame({
        width,
        height: containerRect.height,
        path: buildCardFramePath(width, joinY, panelBottom, tabLeft, tabRight, tabTop),
        topJoinLeft: topJoin.left,
        topJoinRight: topJoin.right,
        inactiveClipBottom,
      });
    };

    measure();
    const raf = requestAnimationFrame(() => measure());
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [activeSlug, stacked, roles, language]);

  if (!activeRole) return null;

  const panelBody = (
    <>
      <header className="mb-8 space-y-3 border-b border-white/10 pb-6">
        <p className={cn("text-xs font-bold uppercase tracking-widest", activeStyles.headerEyebrow)}>
          For {activeRole.title}s
        </p>
        <h3 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl tracking-tight">{activeRole.title}</h3>
        <p className="text-base sm:text-lg leading-relaxed text-white/80 max-w-4xl">{activeRole.heroLead}</p>
      </header>
      <RoleFeatureDetailContent role={activeRole} showHeroLead={false} accent={activeAccent} />
    </>
  );

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        ref={measureRowRef}
        className="pointer-events-none invisible absolute left-0 top-0 flex gap-2 pl-4 sm:pl-5"
        aria-hidden
      >
        {roles.map((role) => (
          <span key={role.slug} className={cn(TAB_BASE, roleTabCard(ORDO_ACCENT_STYLES[getRoleAccent(role.slug)]))}>
            {role.title}
          </span>
        ))}
      </div>

      {stacked ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist" aria-label={t.roleBinderAriaLabel}>
            {roles.map((role) => {
              const isActive = role.slug === activeRole.slug;
              const tabStyles = ORDO_ACCENT_STYLES[getRoleAccent(role.slug)];

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
                    STACKED_CARD_BASE,
                    isActive
                      ? cn("text-white", rolePanelFill(tabStyles))
                      : cn("text-white/90 hover:text-white", roleTabCard(tabStyles))
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
            className={cn("rounded-2xl p-6 sm:p-8 md:p-9", rolePanelFill(activeStyles))}
          >
            {panelBody}
          </div>
        </div>
      ) : (
        <>
          {frame != null ? (
            <>
              <svg
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-[8] overflow-visible"
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
              <svg
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-[15] overflow-visible"
                width={frame.width}
                height={frame.height}
              >
                {frame.topJoinLeft ? (
                  <path
                    d={frame.topJoinLeft}
                    fill="none"
                    stroke={PANEL_STROKE[activeAccent]}
                    strokeWidth={2}
                    strokeLinecap="butt"
                  />
                ) : null}
                {frame.topJoinRight ? (
                  <path
                    d={frame.topJoinRight}
                    fill="none"
                    stroke={PANEL_STROKE[activeAccent]}
                    strokeWidth={2}
                    strokeLinecap="butt"
                  />
                ) : null}
              </svg>
            </>
          ) : null}

          <div
            className="relative z-10 flex shrink-0 items-end gap-2 overflow-x-auto overscroll-x-contain bg-transparent pl-4 pb-0.5 sm:pl-5 [scrollbar-width:thin]"
            role="tablist"
            aria-label={t.roleBinderAriaLabel}
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
                  style={
                    !isActive && frame?.inactiveClipBottom[role.slug]
                      ? { clipPath: `inset(0 0 ${frame.inactiveClipBottom[role.slug]}px 0)` }
                      : undefined
                  }
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
            {panelBody}
          </div>
        </>
      )}
    </div>
  );
}
