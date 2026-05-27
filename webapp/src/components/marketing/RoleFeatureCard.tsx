import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { PublicRoleFeature } from "@/lib/publicRoleFeatures";
import { PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";

type RoleFeatureCardProps = {
  role: PublicRoleFeature;
  compact?: boolean;
  className?: string;
};

export function RoleFeatureCard({ role, compact = false, className }: RoleFeatureCardProps) {
  return (
    <Link
      to={`/features/${role.slug}`}
      className={cn(
        "group flex flex-col rounded-xl border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-ordo-yellow/35 hover:bg-white/[0.06]",
        compact ? "p-3 gap-1.5 min-h-[7.5rem]" : "p-4 gap-2",
        className
      )}
    >
      <h3 className={cn("font-semibold text-white", compact ? "text-sm leading-snug" : "text-base")}>
        {role.title}
      </h3>
      <p
        className={cn(
          "flex-1 leading-relaxed text-white/70",
          compact ? "text-xs line-clamp-2" : "text-sm line-clamp-3"
        )}
      >
        {role.intro}
      </p>
      <span className="text-xs font-medium text-ordo-yellow/90 group-hover:text-ordo-yellow">
        Learn more →
      </span>
    </Link>
  );
}

type RoleFeatureCardGridProps = {
  roles?: readonly PublicRoleFeature[];
  compact?: boolean;
  className?: string;
};

export function RoleFeatureCardGrid({
  roles = PUBLIC_ROLE_FEATURES,
  compact = true,
  className,
}: RoleFeatureCardGridProps) {
  return (
    <div
      className={cn(
        "grid w-full gap-3",
        compact
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {roles.map((role) => (
        <RoleFeatureCard key={role.slug} role={role} compact={compact} />
      ))}
    </div>
  );
}
