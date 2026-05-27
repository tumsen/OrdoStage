import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PlatformFeaturesGrid } from "@/components/marketing/PlatformFeaturesGrid";
import { RoleFeatureBinder } from "@/components/marketing/RoleFeatureBinder";

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

        <section className="rounded-2xl bg-gradient-to-br from-ordo-magenta/[0.08] via-black/30 to-ordo-violet/[0.10] p-5 sm:p-7 shadow-[0_0_40px_rgba(131,56,236,0.08)]">
          <RoleFeatureBinder />
        </section>

        <PlatformFeaturesGrid className="space-y-0" />

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
