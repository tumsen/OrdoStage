import { Link, Navigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RoleFeatureCardGrid } from "@/components/marketing/RoleFeatureCard";
import { RoleFeatureDetailContent } from "@/components/marketing/RoleFeatureDetailContent";
import { getRoleBySlug, isPublicRoleSlug, PUBLIC_ROLE_FEATURES } from "@/lib/publicRoleFeatures";
import { getRoleAccent } from "@/lib/roleAccentStyles";

function SectionDivider() {
  return (
    <div className="my-10 md:my-12 flex items-center gap-4" aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-magenta/50 to-transparent" />
      <div className="h-px w-16 bg-gradient-to-r from-ordo-yellow/60 to-ordo-violet/60 opacity-90" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-violet/50 to-transparent" />
    </div>
  );
}

export default function PublicRoleFeatures() {
  const { roleSlug } = useParams<{ roleSlug: string }>();

  if (!isPublicRoleSlug(roleSlug)) {
    return <Navigate to="/" replace />;
  }

  const role = getRoleBySlug(roleSlug);
  if (!role) {
    return <Navigate to="/" replace />;
  }

  const relatedRoles = role.relatedSlugs
    .map((slug) => PUBLIC_ROLE_FEATURES.find((r) => r.slug === slug))
    .filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">
        <nav aria-label="Breadcrumb" className="text-sm text-white/55">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-white/80 transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-white/35">
              /
            </li>
            <li>
              <Link to="/#features" className="hover:text-white/80 transition-colors">
                Features
              </Link>
            </li>
            <li aria-hidden className="text-white/35">
              /
            </li>
            <li className="text-white/85">{role.title}</li>
          </ol>
        </nav>

        <header className="space-y-4 max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-ordo-yellow/90">For {role.title}s</p>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">{role.title}</h1>
          <p className="text-lg text-white/75 leading-relaxed">{role.heroLead}</p>
        </header>

        <div className="space-y-6">
          <RoleFeatureDetailContent role={role} showHeroLead={false} accent={getRoleAccent(role.slug)} />
        </div>

        {relatedRoles.length > 0 ? (
          <>
            <SectionDivider />
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">See also</h2>
              <p className="text-sm text-white/65">Other roles that often work closely with {role.title}s.</p>
              <RoleFeatureCardGrid roles={relatedRoles} compact={false} className="xl:grid-cols-3" />
            </section>
          </>
        ) : null}

        <SectionDivider />

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
            <Link to="/#features">All roles</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
