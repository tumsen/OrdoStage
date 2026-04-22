import { useLayoutEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { isPublicFlagOn } from "@/lib/publicSiteFlags";

type SiteContent = Record<string, string>;

const W = {
  landing_title: "OrdoStage",
  landing_subtitle: "The operating platform for theaters, venues, and touring productions",
  landing_lead:
    "Stop managing productions across spreadsheets, emails, and shared drives. OrdoStage brings your entire operation into one place — from first rehearsal to closing night.",
  landing_section_heading: "Built for how live performance actually works:",
  landing_section_body:
    "Planning that follows your workflow, not a generic project manager. Shared scheduling across venues, tours, and departments. Technical riders, venue specs, and team coordination — all connected, always current.",
  landing_closing: "For theaters. For venues. For touring companies. For the people running the show.",
  landing_postscript:
    "We are in private rollout now. Early access theaters will be onboarded first. Early-bird tester offer: theaters that join testing get unlimited use for 6 months. Contact: mail@ordostage.com",
} as const;

function useWelcomeCopy(site: SiteContent | undefined) {
  return useMemo(() => {
    const ps = site?.landing_postscript;
    const postscript =
      ps !== undefined && String(ps).trim() === ""
        ? ""
        : String(ps?.trim() || W.landing_postscript);
    return {
      title: site?.landing_title?.trim() || W.landing_title,
      subtitle: site?.landing_subtitle?.trim() || W.landing_subtitle,
      lead: site?.landing_lead?.trim() || W.landing_lead,
      sectionHeading: site?.landing_section_heading?.trim() || W.landing_section_heading,
      sectionBody: site?.landing_section_body?.trim() || W.landing_section_body,
      closing: site?.landing_closing?.trim() || W.landing_closing,
      postscript,
    };
  }, [site]);
}

const curtainBg = (
  <>
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/curtain-bg.png')" }}
    />
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/18" />
  </>
);

function HashScroll() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (pathname !== "/") return;
    if (hash === "#features") {
      const el = document.getElementById("features");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [pathname, hash]);
  return null;
}

function FrontShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full overflow-x-hidden text-white">
      {curtainBg}
      {children}
    </div>
  );
}

function WelcomeHero({
  title,
  subtitle,
  lead,
  titleClass = "md:text-4xl",
}: {
  title: string;
  subtitle: string;
  lead: string;
  titleClass?: string;
}) {
  return (
    <section className="w-full max-w-3xl space-y-4 text-center">
      <h1 className={`text-2xl font-bold leading-tight tracking-tight ${titleClass}`}>{title}</h1>
      <p className="text-base font-medium leading-relaxed text-white/90 md:text-xl">{subtitle}</p>
      <p className="text-sm leading-relaxed text-white/85 md:text-base text-left sm:text-center">{lead}</p>
    </section>
  );
}

function FeatureBlock({
  sectionHeading,
  sectionBody,
  closing,
}: {
  sectionHeading: string;
  sectionBody: string;
  closing: string;
}) {
  return (
    <section
      id="features"
      className="w-full max-w-3xl scroll-mt-6 space-y-4 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm sm:p-7"
    >
      <h2 className="text-lg font-semibold text-white md:text-xl text-center sm:text-left">{sectionHeading}</h2>
      <p className="text-sm leading-relaxed text-white/88 md:text-base">{sectionBody}</p>
      <p className="text-sm font-medium leading-relaxed text-ordo-yellow/90 md:text-base text-center sm:text-left">
        {closing}
      </p>
    </section>
  );
}

function MaintenanceWelcome({ siteContent }: { siteContent: SiteContent | undefined }) {
  const title =
    siteContent?.public_maintenance_title?.trim() || "We will be back soon";
  const subtitle =
    siteContent?.public_maintenance_subtitle?.trim() ||
    "OrdoStage is being updated. Please try again in a little while.";
  const welcome = useWelcomeCopy(siteContent);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] flex min-h-full flex-col gap-10 px-4 pb-12 pt-6 sm:px-6">
        <section className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
          <p className="text-base leading-relaxed text-white/85">{subtitle}</p>
        </section>

        <section
          className="mx-auto w-full max-w-2xl scroll-mt-6 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-6"
          id="features"
        >
          <h2 className="text-lg font-semibold text-white">Features</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            {welcome.lead} See{" "}
            <Link to="/pricing" className="text-ordo-yellow hover:underline">
              Pricing
            </Link>{" "}
            and{" "}
            <Link to="/login" className="text-ordo-yellow hover:underline">
              Log in
            </Link>{" "}
            from the menu when the site is back.
          </p>
        </section>
      </main>
    </FrontShell>
  );
}

function EarlyBirdFrontpage({ siteContent }: { siteContent: SiteContent | undefined }) {
  const welcome = useWelcomeCopy(siteContent);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] mx-auto flex min-h-full max-w-3xl flex-col items-center justify-start gap-8 px-4 pb-12 pt-6 sm:px-6 md:pt-8">
        <WelcomeHero title={welcome.title} subtitle={welcome.subtitle} lead={welcome.lead} />
        <FeatureBlock
          sectionHeading={welcome.sectionHeading}
          sectionBody={welcome.sectionBody}
          closing={welcome.closing}
        />
        {welcome.postscript ? (
          <p className="w-full max-w-3xl text-sm leading-relaxed text-white/80 text-center">{welcome.postscript}</p>
        ) : null}
        <div className="pb-2">
          <Button
            asChild
            className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
          >
            <Link to="/login">Early-Bird Login</Link>
          </Button>
        </div>
      </main>
    </FrontShell>
  );
}

function LiveFrontpage({ siteContent }: { siteContent: SiteContent | undefined }) {
  const welcome = useWelcomeCopy(siteContent);
  const ctaText = siteContent?.landing_cta_text?.trim() || "View pricing & sign up";
  const ctaPath = siteContent?.landing_cta_url?.trim() || "/pricing";
  const ctaExternal = /^https?:\/\//i.test(ctaPath);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] mx-auto flex min-h-full max-w-3xl flex-col items-center justify-start gap-8 px-4 pb-12 pt-6 text-center sm:px-6 md:pt-8">
        <WelcomeHero title={welcome.title} subtitle={welcome.subtitle} lead={welcome.lead} titleClass="md:text-4xl" />
        <p className="w-full max-w-2xl text-sm leading-relaxed text-white/70">
          Use the sidebar to jump to <strong>Features</strong>, or open <strong>Pricing</strong> for credit packs.{" "}
          <strong>Terms</strong> and <strong>Privacy</strong> are there too.
        </p>
        <FeatureBlock
          sectionHeading={welcome.sectionHeading}
          sectionBody={welcome.sectionBody}
          closing={welcome.closing}
        />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
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
              <Link to={ctaPath || "/pricing"}>{ctaText}</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="border-white/25 text-white/90 bg-white/5 hover:bg-white/10">
            <Link to="/login">Log in</Link>
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
  const earlyBird = isPublicFlagOn(siteContent?.public_early_bird_landing, true);

  if (maintenance) {
    return <MaintenanceWelcome siteContent={siteContent} />;
  }
  if (earlyBird) {
    return <EarlyBirdFrontpage siteContent={siteContent} />;
  }
  return <LiveFrontpage siteContent={siteContent} />;
}
