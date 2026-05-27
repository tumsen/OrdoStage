import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RoleFeatureBinder } from "@/components/marketing/RoleFeatureBinder";
import { PLATFORM_FEATURE_HIGHLIGHTS } from "@/lib/publicPlatformFeatures";
import { ORDO_ACCENT_STYLES } from "@/lib/roleAccentStyles";

export default function PublicFeatures() {
  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-12 md:space-y-16">
        <header className="space-y-4 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-widest text-ordo-yellow">Features</p>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight">
            Built for the people who run the show
          </h1>
          <p className="text-lg text-white/75 leading-relaxed">
            OrdoStage ties events, venues, tours, staffing, time tracking, and documents together — so every role in
            your organisation works from the same live picture from first hold to load-out.
          </p>
        </header>

        <section aria-labelledby="platform-features-heading" className="space-y-5">
          <h2 id="platform-features-heading" className="text-xl md:text-2xl font-semibold text-white">
            Everything in one platform
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_FEATURE_HIGHLIGHTS.map((feature) => {
              const styles = ORDO_ACCENT_STYLES[feature.accent];
              return (
                <div
                  key={feature.title}
                  className={`rounded-xl border p-4 space-y-2 ${styles.section}`}
                >
                  <h3 className={`text-sm font-bold ${styles.sectionHeading}`}>{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-white/75">{feature.description}</p>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-white/60">
            <strong className="text-ordo-yellow/90">Time tracking</strong> is available across the organisation — every
            role below includes how hours and reports fit that job.
          </p>
        </section>

        <section
          aria-labelledby="roles-features-heading"
          className="space-y-6 rounded-2xl border border-ordo-magenta/25 bg-gradient-to-br from-ordo-magenta/[0.08] via-black/30 to-ordo-violet/[0.10] p-5 sm:p-7 shadow-[0_0_40px_rgba(131,56,236,0.08)]"
        >
          <div className="space-y-2">
            <h2 id="roles-features-heading" className="text-xl md:text-2xl font-semibold text-white">
              By role
            </h2>
            <p className="text-sm md:text-base text-white/80 leading-relaxed max-w-3xl">
              Pick your job to see how OrdoStage supports your day-to-day — including time tracking, scheduling, and
              the tools your department shares with the rest of the company.
            </p>
          </div>
          <RoleFeatureBinder />
        </section>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
          <Button
            asChild
            className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
          >
            <Link to="/signup">Get started free</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/25 text-white/90 bg-white/5 hover:bg-white/10">
            <Link to="/pricing">View pricing</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/25 text-white/90 bg-white/5 hover:bg-white/10">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
