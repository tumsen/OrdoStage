import { Link } from "react-router-dom";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";

type RoleFeatureDetailContentProps = {
  role: PublicRoleFeature;
  compact?: boolean;
  showHeroLead?: boolean;
};

export function RoleFeatureDetailContent({
  role,
  compact = false,
  showHeroLead = true,
}: RoleFeatureDetailContentProps) {
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

      <div className={compact ? "grid gap-4 md:grid-cols-2" : "space-y-6"}>
        {role.sections.map((section) => (
          <section
            key={section.heading}
            className={
              compact
                ? "rounded-lg border border-white/10 bg-black/20 p-4 space-y-2"
                : "rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-3"
            }
          >
            <h3 className={compact ? "text-sm font-semibold text-white" : "text-lg md:text-xl font-semibold text-white"}>
              {section.heading}
            </h3>
            {section.body ? (
              <p className="text-sm leading-relaxed text-white/70">{section.body}</p>
            ) : null}
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-white/85 marker:text-ordo-yellow">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {role.slug === "accountant" && section.heading === "Plans & billing" ? (
              <p className="text-sm text-white/70 pt-1">
                Compare Flex and Yearly on the{" "}
                <Link to="/pricing" className="text-ordo-yellow hover:underline">
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
