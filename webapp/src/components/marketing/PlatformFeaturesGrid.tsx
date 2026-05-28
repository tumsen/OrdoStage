import { cn } from "@/lib/utils";
import { getPlatformFeatureAreas } from "@/lib/publicPlatformFeatures";
import { usePublicSiteLanguage } from "@/contexts/PublicSiteLanguageContext";
import { useMarketingCopy } from "@/lib/marketing/i18n";
import { ORDO_ACCENT_STYLES } from "@/lib/roleAccentStyles";

type PlatformFeaturesGridProps = {
  id?: string;
  heading?: string;
  intro?: string;
  className?: string;
};

export function PlatformFeaturesGrid({
  id = "platform-features-heading",
  heading: headingProp,
  intro: introProp,
  className,
}: PlatformFeaturesGridProps) {
  const { language } = usePublicSiteLanguage();
  const { t } = useMarketingCopy();
  const areas = getPlatformFeatureAreas(language);
  const heading = headingProp ?? t.platformGridHeading;
  const intro = introProp ?? t.platformGridIntro;
  return (
    <section aria-labelledby={id} className={cn("space-y-6", className)}>
      <div className="space-y-2 max-w-3xl">
        <h2 id={id} className="text-xl font-semibold text-white md:text-2xl">
          {heading}
        </h2>
        {intro ? <p className="text-sm leading-relaxed text-white/75 md:text-base">{intro}</p> : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {areas.map((feature) => {
          const styles = ORDO_ACCENT_STYLES[feature.accent];
          return (
            <article
              key={feature.title}
              className={cn("rounded-xl border p-5 md:p-6 space-y-3", styles.section)}
            >
              <div className="space-y-1">
                <h3 className={cn("text-base font-bold tracking-tight md:text-lg", styles.sectionHeading)}>
                  {feature.title}
                </h3>
                <p className="text-sm font-medium leading-snug text-white/90">{feature.summary}</p>
              </div>
              <p className="text-sm leading-relaxed text-white/75">{feature.body}</p>
              <ul
                className={cn(
                  "list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-white/88",
                  styles.marker
                )}
              >
                {feature.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
