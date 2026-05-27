import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { type OrdoAccent, ORDO_ACCENT_STYLES } from "@/lib/roleAccentStyles";

type RoleFeatureDetailContentProps = {
  role: PublicRoleFeature;
  compact?: boolean;
  showHeroLead?: boolean;
  accent?: OrdoAccent;
};

export function RoleFeatureDetailContent({
  role,
  compact = false,
  showHeroLead = true,
  accent,
}: RoleFeatureDetailContentProps) {
  const vibrant = accent != null;
  const styles = accent ? ORDO_ACCENT_STYLES[accent] : null;

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      {showHeroLead ? (
        <p
          className={
            compact ? "text-sm leading-relaxed text-white/80 md:text-base" : "text-lg leading-relaxed text-white/75"
          }
        >
          {role.heroLead}
        </p>
      ) : null}

      <div className={compact ? "grid gap-4 md:grid-cols-2" : "grid gap-5 md:grid-cols-2"}>
        {role.sections.map((section) => (
          <section
            key={section.heading}
            className={cn(
              "space-y-3",
              vibrant && styles
                ? cn("rounded-xl border p-5 md:p-6", styles.section)
                : compact
                  ? "rounded-lg border border-white/10 bg-black/20 p-4 space-y-2"
                  : "rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
            )}
          >
            <h3
              className={cn(
                vibrant && styles
                  ? cn("text-lg md:text-xl font-bold tracking-tight", styles.sectionHeading)
                  : compact
                    ? "text-sm font-semibold text-white"
                    : "text-lg md:text-xl font-semibold text-white"
              )}
            >
              {section.heading}
            </h3>
            {section.body ? (
              <p className="text-sm md:text-base leading-relaxed text-white/75">{section.body}</p>
            ) : null}
            <ul
              className={cn(
                "list-disc space-y-1.5 pl-5 text-sm md:text-base leading-relaxed text-white/88",
                vibrant && styles ? styles.marker : "marker:text-ordo-yellow"
              )}
            >
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {role.slug === "accountant" && section.heading === "Plans & billing" ? (
              <p className="text-sm text-white/75 pt-1">
                Compare Flex and Yearly on the{" "}
                <Link to="/pricing" className="text-ordo-yellow hover:underline font-medium">
                  pricing page
                </Link>
                .
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
