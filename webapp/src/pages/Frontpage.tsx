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
  landing_subtitle:
    "Production operations for theatres, concert halls, clubs, and touring shows — one workspace your whole company can trust on show day.",
  landing_lead:
    "Whether you run a repertory season, book a busy music room, or move a tour through cities every week, the same problems show up: dates slip, specs drift apart, and crews work from outdated notes. OrdoStage ties events, venues, tours, staffing, and documents together so technical, production, and front-of-house teams share one live picture — from first hold on the calendar to load-out.",
  landing_section_heading: "Everything your live organisation already juggles — in one place",
  landing_section_body:
    "Plan shows and venue holds on a real calendar. Route tours with day-by-day detail. Keep venue specs, files, and tech riders next to the booking they belong to. Staff jobs from the same roster your people and departments already use. Track time when you need it, share calendars when partners ask, and lock access down with roles that match how theatres and venues actually work.",
  landing_closing:
    "Built for resident companies and presenting houses. For music venues and festivals. For tour managers and road crews. For anyone who cannot afford a wrong answer on opening night.",
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

const AUDIENCE_CHIPS = [
  "Repertory theatre",
  "Presenting venue",
  "Concert hall & orchestra",
  "Club & live room",
  "Touring company",
  "Festival production office",
] as const;

const FEATURE_LIST: readonly { title: string; body: string }[] = [
  {
    title: "Events & productions",
    body: "Run your season or one-off specials with events that carry shows, rehearsals, notes, and venue links in one record. Everyone sees the same status from programming through tech week — not a scattered thread of PDFs and DMs.",
  },
  {
    title: "Schedule & venue bookings",
    body: "Week and month views combine events, internal venue bookings, rehearsals, tours, and maintenance in one filterable calendar. See holds and get-ins next to the show they support, across one building or many.",
  },
  {
    title: "Venues & room inventory",
    body: "Keep every stage, hall, and studio in a single inventory with documents and thumbnails attached to the venue. Venue pages include their own booking calendar so operations and artistic can agree on what is possible when.",
  },
  {
    title: "Tours & road dates",
    body: "Structure tours with days, cities, and shows so routing and production deadlines stay legible. Share public or personal tour schedules when artists, crew, or partners need a read-only link without logging into your whole org.",
  },
  {
    title: "Tech riders & production PDFs",
    body: "Generate and share venue tech riders from tour data so front-of-house and local production get the same pack. Fewer last-minute email chains and fewer “which version is this?” moments when the truck rolls in.",
  },
  {
    title: "Staffing & show jobs",
    body: "Line up requirements and assignments for shows and staffing views built around how performance organisations actually staff — not a generic task list bolted onto a spreadsheet.",
  },
  {
    title: "People & team structure",
    body: "Maintain your roster, photos, and org chart with departments and teams that match your house or tour. Onboard people once and reuse them across events, staffing, and permissions.",
  },
  {
    title: "Time tracking & reports",
    body: "Let crew and staff log time where it belongs so payroll prep and retrospective costing do not depend on memory after a long run. Reporting keeps managers and finance aligned.",
  },
  {
    title: "Shared calendars",
    body: "Publish calendars and exports when you need to coordinate with partners who live in Outlook or Google — without giving up your source of truth inside OrdoStage.",
  },
  {
    title: "Roles & access control",
    body: "Grant view or write access by area so volunteers, contractors, and departments see what they need — and nothing sensitive they do not. Match the way your venue already thinks about trust.",
  },
  {
    title: "Account, company profile & billing",
    body: "Store invoice and company details where finance expects them. Postpaid pricing follows real monthly usage; see the public pricing page for how seat-based billing works for growing organisations.",
  },
];

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
    <div className="relative min-h-full overflow-x-hidden bg-gradient-to-b from-[#12121a] via-[#0d0d14] to-[#0a0a0f] text-white">
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
    <section className="w-full space-y-4 text-center">
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
      className="w-full scroll-mt-6 space-y-8 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm sm:p-7"
    >
      <div className="space-y-4">
        <h2 className="text-center text-lg font-semibold text-white sm:text-left md:text-2xl">{sectionHeading}</h2>
        <p className="text-sm leading-relaxed text-white/88 md:text-base">{sectionBody}</p>
        <p className="text-center text-sm font-medium leading-relaxed text-ordo-yellow/90 sm:text-left md:text-base">
          {closing}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">Who it is for</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUDIENCE_CHIPS.map((label) => (
            <span
              key={label}
              className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_LIST.map((f) => (
          <article key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{f.body}</p>
          </article>
        ))}
      </div>

      <p className="text-center text-sm text-white/70">
        Postpaid billing scales with real usage —{" "}
        <Link to="/pricing" className="text-ordo-yellow hover:underline">
          read pricing
        </Link>
        .
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ordo-yellow/35 bg-gradient-to-br from-ordo-magenta/[0.12] to-ordo-violet/[0.10] p-5">
          <h3 className="text-base font-semibold text-white">What teams get with OrdoStage</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-white/85 marker:text-ordo-yellow">
            <li>One calendar for events, venue holds, tours, and rehearsals</li>
            <li>Venue specs, files, and tech riders tied to the right booking</li>
            <li>Staffing and roster data that stays in sync with permissions</li>
            <li>Time and exports when finance and partners need them</li>
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-base font-semibold text-white">Why organisations switch</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Less re-keying between tools. Fewer “did you see the update?” moments before load-in. Technical, production, and operations leadership see the same live picture — so decisions on show day rest on current data, not memory.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">Fewer planning mistakes</span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">Faster handovers</span>
            <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/75">Better team alignment</span>
          </div>
        </div>
      </div>
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
      <main className="relative flex min-h-full w-full flex-col gap-10 px-6 pb-12 pt-6 md:pt-8">
        <section className="flex min-h-[40vh] w-full flex-col items-center justify-center gap-6 px-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h1>
          <p className="text-base leading-relaxed text-white/85">{subtitle}</p>
        </section>

        <section
          className="w-full scroll-mt-6 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-6"
          id="features"
        >
          <h2 className="text-lg font-semibold text-white">Features</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            {welcome.lead} When we are back online, use the menu for{" "}
            <Link to="/pricing" className="text-ordo-yellow hover:underline">
              Pricing
            </Link>{" "}
            (postpaid billing) and{" "}
            <Link to="/login" className="text-ordo-yellow hover:underline">
              Log in
            </Link>
            . The full platform covers events, schedules, venues, tours, staffing, people, time, calendars, roles, and
            documents — all described on the live homepage when maintenance is off.
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
      <main className="relative flex min-h-full w-full flex-col items-center justify-start gap-8 px-6 pb-12 pt-6 md:pt-8">
        <WelcomeHero title={welcome.title} subtitle={welcome.subtitle} lead={welcome.lead} />
        <FeatureBlock
          sectionHeading={welcome.sectionHeading}
          sectionBody={welcome.sectionBody}
          closing={welcome.closing}
        />
        {welcome.postscript ? (
          <p className="w-full text-center text-sm leading-relaxed text-white/80">{welcome.postscript}</p>
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
      <main className="relative flex min-h-full w-full flex-col items-center justify-start gap-8 px-6 pb-12 pt-6 text-center md:pt-8">
        <WelcomeHero title={welcome.title} subtitle={welcome.subtitle} lead={welcome.lead} titleClass="md:text-4xl" />
        <p className="w-full text-sm leading-relaxed text-white/70">
          Use the sidebar to jump to <strong>Features</strong>, or open <strong>Pricing</strong> for billing details.{" "}
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
