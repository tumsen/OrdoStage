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
  const { data } = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api.get<SiteContent>("/api/site-content"),
  });

  const ctaText = "Apply for Early Access";
  const ctaUrl = "mailto:mail@ordostage.com?subject=Early%20Access%20Request%20-%20OrdoStage";

  const heroTitle = data?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = data?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
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

      <main className="relative z-[1] mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 pb-10 pt-28 text-center md:pt-32">
        <div className="max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-4xl">{heroTitle}</h1>
          <p className="text-base leading-relaxed text-white/85 md:text-xl">{heroSubtitle}</p>
          <p className="text-sm leading-relaxed text-white/80 md:text-base">
            Expect production planning built for theater workflows, shared scheduling for events and tours, team
            coordination across departments, and venue plus technical details organized in one platform.
          </p>
          <p className="text-xs leading-relaxed text-ordo-yellow/90 md:text-sm">
            We are in private rollout now. Early access theaters will be onboarded first.
          </p>
          <p className="text-sm leading-relaxed text-white/90 md:text-base">
            Early-bird tester offer: theaters that join testing get unlimited use for 6 months.
            Email <a href="mailto:mail@ordostage.com" className="underline underline-offset-2 hover:text-ordo-yellow">mail@ordostage.com</a>.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <a
            href={ctaUrl}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
          >
            {ctaText}
          </a>
          <Button asChild variant="outline" className="border-white/25 text-white bg-white/[0.02] hover:bg-white/5">
            <Link to="/pricing">View pricing</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
