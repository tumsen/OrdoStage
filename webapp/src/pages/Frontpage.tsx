import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type SiteContent = Record<string, string>;

/** Defaults match marketing copy when Website Content fields are empty. */
const DEFAULT_HERO_TITLE =
  "Ordo Stage is a planning platform built for theatres, venues, and touring productions.";
const DEFAULT_HERO_SUBTITLE =
  "It brings everything together in one place — from the first booking to the final curtain call.";

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

  return (
    <div className="text-white">
      <article className="max-w-3xl mx-auto px-6 py-14 md:py-20 space-y-10 md:space-y-12">
        {/* Hero */}
        <header className="space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {heroTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            {heroSubtitle}
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
