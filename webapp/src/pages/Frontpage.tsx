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

  const ctaText = data?.landing_cta_text ?? "Get started";
  const ctaUrl = data?.landing_cta_url ?? "/login";

  const heroTitle = data?.landing_title?.trim() || DEFAULT_HERO_TITLE;
  const heroSubtitle = data?.landing_subtitle?.trim() || DEFAULT_HERO_SUBTITLE;
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#09090f] text-white">
      {/* Curtain borders */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[11vw] min-w-[44px] max-w-[140px] bg-[radial-gradient(circle_at_10%_50%,rgba(255,70,120,0.45),rgba(121,22,63,0.88)_48%,rgba(59,11,32,0.98)_76%)] shadow-[inset_-18px_0_30px_rgba(0,0,0,0.55)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[11vw] min-w-[44px] max-w-[140px] bg-[radial-gradient(circle_at_90%_50%,rgba(255,70,120,0.45),rgba(121,22,63,0.88)_48%,rgba(59,11,32,0.98)_76%)] shadow-[inset_18px_0_30px_rgba(0,0,0,0.55)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 h-10 bg-gradient-to-b from-[#5d1638] via-[#4d102f] to-transparent"
      />

      {/* Stage glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(255,190,11,0.28),rgba(251,86,7,0.16)_26%,rgba(131,56,236,0.18)_44%,rgba(9,9,15,0.94)_78%)]"
      />

      <main className="relative z-[1] mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-8 px-8 py-16 text-center">
        <div className="relative w-full max-w-[860px]">
          <div
            aria-hidden
            className="absolute inset-x-[6%] -inset-y-8 rounded-[3rem] bg-[radial-gradient(circle_at_50%_38%,rgba(255,190,11,0.24),rgba(251,86,7,0.18)_35%,rgba(131,56,236,0.2)_58%,rgba(9,9,15,0)_82%)] blur-3xl"
          />
          <OrdoStageLogo
            variant="sidebar"
            interactive
            className="relative z-[1] mx-auto w-full max-w-[820px]"
          />
        </div>

        <div className="max-w-3xl space-y-5">
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">{heroTitle}</h1>
          <p className="text-lg leading-relaxed text-white/80 md:text-2xl">{heroSubtitle}</p>
          <p className="text-base leading-relaxed text-white/70 md:text-lg">
            Expect production planning built for theater workflows, shared scheduling for events and tours, team
            coordination across departments, and venue plus technical details organized in one platform.
          </p>
          <p className="text-sm leading-relaxed text-ordo-yellow/90 md:text-base">
            We are in private rollout now. Early access theaters will be onboarded first.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            asChild
            className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
          >
            <Link to={ctaUrl}>{ctaText}</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/25 text-white bg-white/[0.02] hover:bg-white/5">
            <Link to="/pricing">View pricing</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
