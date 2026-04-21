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

export default function Frontpage() {
  const { data: siteContent } = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api.get<SiteContent>("/api/site-content"),
  });

  const heroTitle = siteContent?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = siteContent?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* User-provided curtain image background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/curtain-bg.png')" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/18" />

      <div className="absolute left-4 top-4 z-[2] w-[180px] sm:w-[220px] md:w-[260px]">
        <OrdoStageLogo variant="sidebar" interactive showBackdrop={false} className="w-full" />
      </div>

      <main className="relative z-[1] mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-start gap-10 px-6 pb-12 pt-28 text-center md:pt-32">
        <section className="max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-4xl">
            {heroTitle}
          </h1>
          <p className="text-base leading-relaxed text-white/85 md:text-xl">{heroSubtitle}</p>
          <p className="text-sm leading-relaxed text-white/80 md:text-base">
            Expect production planning built for theater workflows, shared scheduling for events and tours, team
            coordination across departments, and venue plus technical details organized in one platform.
          </p>
          <p className="text-sm leading-relaxed text-ordo-yellow/90 md:text-base">
            We are in private rollout now. Early access theaters will be onboarded first.
          </p>
          <p className="text-sm leading-relaxed text-white/90 md:text-base">
            Early-bird tester offer: theaters that join testing get unlimited use for 6 months.
            Contact: mail@ordostage.com
          </p>
        </section>

        <section className="w-full max-w-4xl space-y-5 rounded-2xl border border-white/15 bg-black/25 p-5 text-left backdrop-blur-sm md:p-7">
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
    </div>
  );
}
