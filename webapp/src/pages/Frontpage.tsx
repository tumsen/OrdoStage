import { useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { isPublicFlagOn } from "@/lib/publicSiteFlags";

type SiteContent = Record<string, string>;

const DEFAULT_HERO_TITLE =
  "OrdoStage is launching soon — production management built for theaters.";
const DEFAULT_HERO_SUBTITLE =
  "Plan productions, coordinate teams, manage venues, and keep schedules in sync — in one platform.";

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

function MaintenanceWelcome({ siteContent }: { siteContent: SiteContent | undefined }) {
  const title =
    siteContent?.public_maintenance_title?.trim() || "We will be back soon";
  const subtitle =
    siteContent?.public_maintenance_subtitle?.trim() ||
    "OrdoStage is being updated. Please try again in a little while.";
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] flex min-h-full flex-col gap-10 px-4 pb-12 pt-6 sm:px-6">
        <section className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
          <p className="text-base leading-relaxed text-white/85">{subtitle}</p>
        </section>

        <section
          id="features"
          className="mx-auto w-full max-w-2xl scroll-mt-6 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-6"
        >
          <h2 className="text-lg font-semibold text-white">Features</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            OrdoStage is production and scheduling software for theaters: productions, events, tours, venues, and teams in
            one place. For credit packs, automatic top-up, and billing, see <Link to="/pricing" className="text-ordo-yellow hover:underline">Pricing</Link> after we are back, or <Link to="/login" className="text-ordo-yellow hover:underline">log in</Link> with your
            account.
          </p>
        </section>
      </main>
    </FrontShell>
  );
}

function EarlyBirdFrontpage({ siteContent }: { siteContent: SiteContent | undefined }) {
  const heroTitle = siteContent?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = siteContent?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] mx-auto flex min-h-full max-w-5xl flex-col items-center justify-start gap-10 px-4 pb-12 pt-6 text-center sm:px-6 md:pt-8">
        <section className="max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-4xl">{heroTitle}</h1>
          <p className="text-base leading-relaxed text-white/85 md:text-xl">{heroSubtitle}</p>
          <p className="text-sm leading-relaxed text-white/80 md:text-base">
            Expect production planning built for theater workflows, shared scheduling for events and tours, team
            coordination across departments, and venue plus technical details organized in one platform.
          </p>
          <p className="text-sm leading-relaxed text-ordo-yellow/90 md:text-base">
            We are in private rollout now. Early access theaters will be onboarded first.
          </p>
          <p className="text-sm leading-relaxed text-white/90 md:text-base">
            Early-bird tester offer: theaters that join testing get unlimited use for 6 months. Contact: mail@ordostage.com
          </p>
        </section>

        <section
          id="features"
          className="w-full max-w-4xl scroll-mt-6 space-y-5 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-7"
        >
          <h2 className="text-center text-xl font-semibold text-white md:text-2xl">
            What OrdoStage can do for your theater
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold text-white">Production planning in one place</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Build complete productions with run sheets, notes, timing, responsibilities and attached files so every
                department works from the same source.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold text-white">Events, tours and venues connected</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Coordinate venue requirements, technical rider details, people, travel legs and show dates without
                duplicating data across separate tools.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold text-white">Shared scheduling across teams</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Keep production, operations, FOH and technical teams synchronized with up-to-date calendars and clear
                change visibility when plans shift.
              </p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
              <h3 className="text-base font-semibold text-white">Built for real stage workflows</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Designed specifically for theaters and live productions with practical tools for rehearsals, get-in/get-out,
                venue communication and execution day control.
              </p>
            </div>
          </div>
          <p className="text-sm text-white/80">
            Access is invite-only during rollout. Use your early-bird login to enter the platform.
          </p>
        </section>

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
  const heroTitle = siteContent?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = siteContent?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
  const ctaText = siteContent?.landing_cta_text?.trim() || "View pricing & sign up";
  const ctaPath = siteContent?.landing_cta_url?.trim() || "/pricing";
  const ctaExternal = /^https?:\/\//i.test(ctaPath);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative z-[1] mx-auto flex min-h-full max-w-3xl flex-col items-center justify-start gap-8 px-4 pb-12 pt-6 text-center sm:px-6 md:pt-8">
        <section className="max-w-2xl space-y-4">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-4xl">{heroTitle}</h1>
          <p className="text-base leading-relaxed text-white/85 md:text-lg">{heroSubtitle}</p>
          <p className="text-sm leading-relaxed text-white/70">
            Check <strong>Features</strong> in the sidebar to jump to product highlights. Use <strong>Pricing</strong> for
            credit packs and Paddle checkout after sign-up. <strong>Terms</strong> covers legal use of the service.
          </p>
        </section>

        <section
          id="features"
          className="w-full max-w-2xl scroll-mt-6 space-y-3 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-6"
        >
          <h2 className="text-center text-lg font-semibold text-white">Features at a glance</h2>
          <ul className="list-inside list-disc text-sm text-white/80 space-y-2">
            <li>Productions, events, and tours in one schedule</li>
            <li>Venue and tech rider information linked to the right people</li>
            <li>Departments, roles, and read/write access for your org</li>
            <li>Credits and billing: see Pricing for day packs and automatic top-up</li>
          </ul>
        </section>

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
