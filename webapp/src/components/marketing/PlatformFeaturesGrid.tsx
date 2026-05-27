import { cn } from "@/lib/utils";
import { PLATFORM_FEATURE_HIGHLIGHTS } from "@/lib/publicPlatformFeatures";
import { ORDO_ACCENT_STYLES } from "@/lib/roleAccentStyles";

type PlatformFeaturesGridProps = {
  id?: string;
  heading?: string;
  className?: string;
};

export function PlatformFeaturesGrid({
  id = "platform-features-heading",
  heading = "Everything in one platform",
  className,
}: PlatformFeaturesGridProps) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="text-xl md:text-2xl font-semibold text-white mb-5">
        {heading}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORM_FEATURE_HIGHLIGHTS.map((feature) => {
          const styles = ORDO_ACCENT_STYLES[feature.accent];
          return (
            <div key={feature.title} className={cn("rounded-xl border p-4 space-y-2", styles.section)}>
              <h3 className={cn("text-sm font-bold", styles.sectionHeading)}>{feature.title}</h3>
              <p className="text-sm leading-relaxed text-white/75">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
