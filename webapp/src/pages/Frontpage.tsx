import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

type SiteContent = Record<string, string>;

/** Defaults match marketing copy when Website Content fields are empty. */
const DEFAULT_HERO_TITLE =
  "OrdoStage is launching soon — production management built for theaters.";
const DEFAULT_HERO_SUBTITLE =
  "Plan productions, coordinate teams, manage venues, and keep schedules in sync — in one platform.";

function SectionDivider() {
  return (
    <div
      className="my-14 md:my-16 flex items-center gap-4"
      aria-hidden
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-magenta/50 to-transparent" />
      <div className="h-px w-16 bg-gradient-to-r from-ordo-yellow/60 to-ordo-violet/60 opacity-90" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-violet/50 to-transparent" />
    </div>
  );
}

export default function Frontpage() {
  const { data } = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api.get<SiteContent>("/api/site-content"),
  });

  const ctaText = data?.landing_cta_text ?? "Get started";
  const ctaUrl = data?.landing_cta_url ?? "/login";

  const heroTitle = data?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = data?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
  const signupCredits = data?.signup_credits?.trim() || "30";

  return (
    <div className="text-white">
      <article className="max-w-4xl mx-auto px-6 py-14 md:py-20 space-y-10 md:space-y-12">
        {/* Hero */}
        <header className="space-y-6">
          <div className="relative flex justify-center md:justify-start">
            <div
              aria-hidden
              className="absolute inset-x-8 -inset-y-6 rounded-[2.2rem] bg-[radial-gradient(circle_at_50%_36%,rgba(255,190,11,0.24),rgba(251,86,7,0.18)_28%,rgba(131,56,236,0.22)_52%,rgba(10,10,15,0)_74%)] blur-2xl"
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[78%] w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 shadow-[0_0_52px_rgba(255,190,59,0.24),0_0_94px_rgba(131,56,236,0.2)] animate-pulse"
            />
            <div
              aria-hidden
              className="absolute left-1/2 top-1/2 h-[88%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8 opacity-80"
              style={{
                maskImage:
                  "conic-gradient(from 120deg, transparent 0deg, rgba(255,255,255,1) 90deg, transparent 180deg, rgba(255,255,255,1) 250deg, transparent 320deg)",
              }}
            />
            <OrdoStageLogo
              variant="sidebar"
              interactive
              className="relative z-[1] w-full max-w-[300px] md:max-w-[380px]"
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {heroTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            {heroSubtitle}
          </p>
          <p className="rounded-xl border border-ordo-yellow/35 bg-gradient-to-br from-ordo-magenta/[0.12] to-ordo-violet/[0.08] px-4 py-4 text-[15px] leading-relaxed text-white/90 md:text-base">
            <span className="font-semibold text-ordo-yellow">{signupCredits} free credits</span> when you create your
            organization — enough to test scheduling, technical riders, tours, and team workflows before you buy a pack.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              asChild
              className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
            >
              <Link to={ctaUrl}>{ctaText}</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 text-white bg-transparent hover:bg-white/5">
              <Link to="/pricing">View pricing</Link>
            </Button>
          </div>
        </header>

        {/* From Planning to Show */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">From Planning to Show</h2>
          <p className="text-white/75 leading-relaxed">
            Manage the full production workflow with tools designed for live events:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>Create events and schedules</li>
            <li>Add documents, contracts, and technical riders</li>
            <li>Coordinate staff, resources, and timings</li>
            <li>Share plans with teams, artists, and technicians</li>
            <li>Keep everyone updated in real time</li>
          </ul>
        </section>

        <SectionDivider />

        {/* Venue Planning */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Venue Planning</h2>
          <p className="text-white/75 leading-relaxed">
            From contract to execution, Ordo Stage helps venues stay organized.
          </p>
          <p className="text-white/75 leading-relaxed">
            Enter your event date and times once, then use the same information everywhere:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-magenta">
            <li>Internal calendars</li>
            <li>Staff schedules</li>
            <li>Resource planning</li>
            <li>Front-of-house displays</li>
            <li>Foyer screens</li>
            <li>Daily overviews</li>
          </ul>
          <p className="text-white/90 font-medium pt-2 leading-relaxed">
            No duplicate entries. No scattered spreadsheets. No confusion.
          </p>
        </section>

        <SectionDivider />

        {/* Tour Planning */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Tour Planning</h2>
          <p className="text-white/75 leading-relaxed">
            Plan an entire tour with consistency across every stop.
          </p>
          <p className="text-white/75 leading-relaxed">Upload your standard materials such as:</p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-violet">
            <li>Technical riders</li>
            <li>Lighting plans</li>
            <li>Stage plots</li>
            <li>Production notes</li>
          </ul>
          <p className="text-white/75 leading-relaxed pt-2">
            Ordo Stage can automatically apply venue-specific details such as:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-blue">
            <li>Get-in times</li>
            <li>Load-out times</li>
            <li>Local schedules</li>
            <li>Venue requirements</li>
            <li>Contact details</li>
          </ul>
          <p className="text-white/75 leading-relaxed pt-2">
            Artists and crew can view both the full tour schedule and detailed plans for each venue.
          </p>
        </section>

        <SectionDivider />

        {/* Built for Live Production */}
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Built for Live Production</h2>
          <p className="text-white/75 leading-relaxed">
            Whether you run a single venue or manage a multi-city tour, Ordo Stage helps you stay in control,
            save time, and keep every production moving smoothly.
          </p>
          <p className="text-lg md:text-xl font-semibold leading-snug bg-gradient-to-r from-ordo-magenta via-ordo-yellow to-ordo-violet bg-clip-text text-transparent">
            Create events. Plan smarter. Deliver better shows.
          </p>
        </section>
      </article>
    </div>
  );
}
