import { useLayoutEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PlatformFeaturesGrid } from "@/components/marketing/PlatformFeaturesGrid";
import { RoleFeatureBinder } from "@/components/marketing/RoleFeatureBinder";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useMarketingCopy } from "@/lib/marketing/i18n";
import { getLandingContentDefaults } from "@/lib/siteContentDefaults";
import { isPublicFlagOn } from "@/lib/publicSiteFlags";
import { cn } from "@/lib/utils";

type SiteContent = Record<string, string>;

function parseHighlightLines(raw: string | undefined, fallback: string): string[] {
  const source = raw?.trim() ? raw : fallback;
  return source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function useWelcomeCopy(site: SiteContent | undefined, language: ReturnType<typeof useSiteContentLanguage>) {
  const defaults = getLandingContentDefaults(language);
  return useMemo(() => {
    return {
      title: site?.landing_title?.trim() || defaults.landing_title,
      subtitle: site?.landing_subtitle?.trim() || defaults.landing_subtitle,
      lead: site?.landing_lead?.trim() || defaults.landing_lead,
      highlights: parseHighlightLines(site?.landing_postscript, defaults.landing_postscript),
      closing: site?.landing_closing?.trim() || defaults.landing_closing,
      sectionHeading: site?.landing_section_heading?.trim() || defaults.landing_section_heading,
      sectionBody: site?.landing_section_body?.trim() || defaults.landing_section_body,
    };
  }, [site, defaults]);
}

function HashScroll() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (pathname !== "/") return;
    if (!hash) return;
    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    scrollToTarget();
    const t = window.setTimeout(scrollToTarget, 100);
    return () => window.clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

function FrontShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-x-hidden bg-gradient-to-b from-[#12121a] via-[#0d0d14] to-[#0a0a0f] text-white">
      {children}
    </div>
  );
}

function WelcomeHero({
  title,
  subtitle,
  lead,
  highlights,
  closing,
  titleClass = "md:text-4xl",
}: {
  title: string;
  subtitle: string;
  lead: string;
  highlights: string[];
  closing: string;
  titleClass?: string;
}) {
  return (
    <section className="w-full space-y-4 text-center">
      <h1 className={`text-2xl font-bold leading-tight tracking-tight ${titleClass}`}>{title}</h1>
      <p className="text-base font-medium leading-relaxed text-white/90 md:text-xl">{subtitle}</p>
      <p className="text-sm leading-relaxed text-white/85 md:text-base text-left sm:text-center">{lead}</p>
      {highlights.length > 0 ? (
        <ul
          className={cn(
            "mx-auto max-w-2xl space-y-2 text-left text-sm leading-relaxed text-white/85 sm:text-center",
            "list-disc pl-5 sm:list-none sm:pl-0 marker:text-ordo-yellow"
          )}
        >
          {highlights.map((line) => (
            <li key={line} className="sm:px-1">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {closing ? (
        <p className="text-sm font-medium leading-relaxed text-ordo-yellow/90 md:text-base">{closing}</p>
      ) : null}
    </section>
  );
}

function FeatureBlock({ sectionHeading, sectionBody }: { sectionHeading: string; sectionBody: string }) {
  const { t } = useMarketingCopy();
  return (
    <section id="features" className="w-full scroll-mt-6 space-y-6">
      <div className="space-y-3">
        <h2 className="text-center text-lg font-semibold text-white sm:text-left md:text-2xl">{sectionHeading}</h2>
        <p className="text-sm leading-relaxed text-white/88 md:text-base">{sectionBody}</p>
      </div>

      <RoleFeatureBinder />

      <PlatformFeaturesGrid id="platform-functions" className="scroll-mt-6" />

      <div className="grid gap-4 md:grid-cols-1">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">{t.whySwitchHeading}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/80">{t.whySwitchBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">
              {t.chipFewerMistakes}
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">
              {t.chipFasterHandovers}
            </span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">
              {t.chipBetterAlignment}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MaintenanceWelcome({ siteContent }: { siteContent: SiteContent | undefined }) {
  const siteLang = useSiteContentLanguage();
  const { t } = useMarketingCopy();
  const title = siteContent?.public_maintenance_title?.trim() || "We will be back soon";
  const subtitle =
    siteContent?.public_maintenance_subtitle?.trim() ||
    "OrdoStage is being updated. Please try again in a little while.";
  const welcome = useWelcomeCopy(siteContent, siteLang);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative flex min-h-full w-full flex-col gap-10 px-6 pb-12 pt-6 md:pt-8">
        <section className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-6 px-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
          <p className="text-base leading-relaxed text-white/85">{subtitle}</p>
        </section>

        <section
          className="w-full scroll-mt-6 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-6"
          id="features"
        >
          <h2 className="text-lg font-semibold text-white">{t.pageFeatures}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            {welcome.lead} {t.maintenanceFeaturesLead}{" "}
            <Link to="/pricing" className="text-ordo-yellow hover:underline">
              {t.maintenancePricingLink}
            </Link>{" "}
            and{" "}
            <Link to="/login" className="text-ordo-yellow hover:underline">
              {t.maintenanceLoginLink}
            </Link>
            .
          </p>
        </section>
      </main>
    </FrontShell>
  );
}

function MarketingHome({ siteContent }: { siteContent: SiteContent | undefined }) {
  const siteLang = useSiteContentLanguage();
  const { t } = useMarketingCopy();
  const welcome = useWelcomeCopy(siteContent, siteLang);
  const landingDefaults = getLandingContentDefaults(siteLang);
  const ctaText = siteContent?.landing_cta_text?.trim() || landingDefaults.landing_cta_text;
  const ctaPath = siteContent?.landing_cta_url?.trim() || "/signup";
  const ctaExternal = /^https?:\/\//i.test(ctaPath);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative flex min-h-full w-full flex-col items-stretch gap-8 px-6 pb-12 pt-6 md:pt-8">
        <WelcomeHero
          title={welcome.title}
          subtitle={welcome.subtitle}
          lead={welcome.lead}
          highlights={welcome.highlights}
          closing={welcome.closing}
          titleClass="md:text-4xl"
        />
        <FeatureBlock sectionHeading={welcome.sectionHeading} sectionBody={welcome.sectionBody} />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          {ctaExternal ? (
            <Button
              asChild
              className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
            >
              <a href={ctaPath} target="_blank" rel="noreferrer">
                {ctaText}
              </a>
            </Button>
          ) : (
            <Button
              asChild
              className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
            >
              <Link to={ctaPath || "/signup"}>{ctaText}</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="border-white/25 text-white/90 bg-white/5 hover:bg-white/10">
            <Link to="/pricing">{t.viewPricing}</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/25 text-white/90 bg-white/5 hover:bg-white/10">
            <Link to="/login">{t.logIn}</Link>
          </Button>
        </div>
      </main>
    </FrontShell>
  );
}

export default function Frontpage() {
  const siteLang = useSiteContentLanguage();
  const { data: siteContent } = useQuery({
    queryKey: ["site-content", siteLang],
    queryFn: () => api.get<SiteContent>(`/api/site-content?language=${encodeURIComponent(siteLang)}`),
  });

  const maintenance = isPublicFlagOn(siteContent?.public_maintenance_mode, false);

  if (maintenance) {
    return <MaintenanceWelcome siteContent={siteContent} />;
  }
  return <MarketingHome siteContent={siteContent} />;
}
