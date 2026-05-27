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
  landing_section_heading: "Built for the people who run the show",
  landing_section_body:
    "Every role in your organisation sees the same live data — filtered to what they need. Jump to your job below, or scroll through how OrdoStage supports the whole company from programming to payroll.",
  landing_closing:
    "Built for resident companies and presenting houses. For music venues and festivals. For tour managers and road crews. For anyone who cannot afford a wrong answer on opening night.",
} as const;

function useWelcomeCopy(site: SiteContent | undefined) {
  return useMemo(() => {
    return {
      title: site?.landing_title?.trim() || W.landing_title,
      subtitle: site?.landing_subtitle?.trim() || W.landing_subtitle,
      lead: site?.landing_lead?.trim() || W.landing_lead,
      sectionHeading: site?.landing_section_heading?.trim() || W.landing_section_heading,
      sectionBody: site?.landing_section_body?.trim() || W.landing_section_body,
      closing: site?.landing_closing?.trim() || W.landing_closing,
    };
  }, [site]);
}

const ROLE_SECTIONS: readonly {
  id: string;
  title: string;
  intro: string;
  bullets: readonly string[];
}[] = [
  {
    id: "role-hr-manager",
    title: "HR Manager",
    intro: "Keep your roster accurate and your people onboarded without chasing spreadsheets.",
    bullets: [
      "Maintain people profiles, photos, and contact details in one roster",
      "Organise departments and teams that match how your house or tour is structured",
      "Invite new members and reuse the same people across events and staffing",
      "Align access with permission groups so each department sees what they need",
    ],
  },
  {
    id: "role-producer",
    title: "Producer",
    intro: "Program the season and keep artistic planning tied to real dates and venues.",
    bullets: [
      "Run events and productions with shows, rehearsals, and notes in one record",
      "See holds, get-ins, and venue availability on a shared schedule",
      "Track status from first programming conversation through tech week",
      "Publish calendars when partners need a read-only view without full access",
    ],
  },
  {
    id: "role-production-manager",
    title: "Production Manager",
    intro: "Coordinate deadlines, documents, and crew requirements across the whole production.",
    bullets: [
      "Plan phases and tasks in the production planner with costs and notes",
      "Keep production documents and details next to the event they belong to",
      "Line up staffing requirements and assignments for each show",
      "Filter the schedule across events, tours, rehearsals, and venue bookings",
    ],
  },
  {
    id: "role-stage-manager",
    title: "Stage Manager",
    intro: "Trust the schedule and staffing picture on show day — not a thread of outdated messages.",
    bullets: [
      "See get-ins, rehearsals, and performances in one filterable calendar",
      "Review show staffing and assignments from the same data the office uses",
      "Open event records with notes and links your crew can rely on at call time",
      "Let crew log time against the right work when your organisation tracks hours",
    ],
  },
  {
    id: "role-tour-manager",
    title: "Tour Manager",
    intro: "Route the tour and keep every city, day, and local pack aligned.",
    bullets: [
      "Structure tours with days, cities, and shows so routing stays legible",
      "Generate and share tech riders from tour data for local production teams",
      "Share public or personal tour schedules when artists and partners need a link",
      "Coordinate tour dates alongside venue bookings and production deadlines",
    ],
  },
  {
    id: "role-head-of-stage",
    title: "Head of Stage",
    intro: "Own venue specs, room inventory, and technical information where bookings live.",
    bullets: [
      "Maintain every stage, hall, and studio with documents attached to the venue",
      "Use venue booking calendars so artistic and operations agree on what is possible",
      "Keep specs and files next to the room — not lost in email attachments",
      "Support touring shows with consistent tech information at each stop",
    ],
  },
  {
    id: "role-accountant",
    title: "Accountant",
    intro: "Turn crew hours and company details into numbers finance can work with.",
    bullets: [
      "Collect time entries from staff and crew linked to the work they did",
      "Run time reports for payroll prep and retrospective costing",
      "Export data when finance needs to reconcile outside OrdoStage",
      "Store company and invoice details in the organisation account",
    ],
  },
];

function HashScroll() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (pathname !== "/") return;
    if (!hash) return;
    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
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

      <nav aria-label="Jump to role">
        <p className="text-xs font-medium uppercase tracking-wide text-white/50">By role</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLE_SECTIONS.map((role) => (
            <a
              key={role.id}
              href={`#${role.id}`}
              className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80 transition-colors hover:border-ordo-yellow/40 hover:text-white"
            >
              {role.title}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-5">
        {ROLE_SECTIONS.map((role) => (
          <article
            key={role.id}
            id={role.id}
            className="scroll-mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          >
            <h3 className="text-base font-semibold text-white">{role.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{role.intro}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-white/85 marker:text-ordo-yellow">
              {role.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
              {role.id === "role-accountant" ? (
                <li>
                  Flex and Yearly billing for your organisation —{" "}
                  <Link to="/pricing" className="text-ordo-yellow hover:underline">
                    see pricing
                  </Link>
                </li>
              ) : null}
            </ul>
          </article>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ordo-yellow/35 bg-gradient-to-br from-ordo-magenta/[0.12] to-ordo-violet/[0.10] p-5">
          <h3 className="text-base font-semibold text-white">Everything in one platform</h3>
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
            and{" "}
            <Link to="/login" className="text-ordo-yellow hover:underline">
              Log in
            </Link>
            . The live homepage describes OrdoStage by role — HR, production, stage management, touring, technical, and
            finance — when maintenance is off.
          </p>
        </section>
      </main>
    </FrontShell>
  );
}

function MarketingHome({ siteContent }: { siteContent: SiteContent | undefined }) {
  const welcome = useWelcomeCopy(siteContent);
  const ctaText = siteContent?.landing_cta_text?.trim() || "Get started free";
  const ctaPath = siteContent?.landing_cta_url?.trim() || "/signup";
  const ctaExternal = /^https?:\/\//i.test(ctaPath);
  return (
    <FrontShell>
      <HashScroll />
      <main className="relative flex min-h-full w-full flex-col items-center justify-start gap-8 px-6 pb-12 pt-6 text-center md:pt-8">
        <WelcomeHero title={welcome.title} subtitle={welcome.subtitle} lead={welcome.lead} titleClass="md:text-4xl" />
        <p className="w-full text-sm leading-relaxed text-white/70">
          Use the sidebar for <strong>Features</strong> and <strong>Pricing</strong>, plus{" "}
          <strong>Terms</strong> and <strong>Privacy</strong>.
        </p>
        <FeatureBlock
          sectionHeading={welcome.sectionHeading}
          sectionBody={welcome.sectionBody}
          closing={welcome.closing}
        />
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
            <Link to="/pricing">View pricing</Link>
          </Button>
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

  if (maintenance) {
    return <MaintenanceWelcome siteContent={siteContent} />;
  }
  return <MarketingHome siteContent={siteContent} />;
}
