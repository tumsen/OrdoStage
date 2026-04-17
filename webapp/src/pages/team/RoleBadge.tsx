import { cn } from "@/lib/utils";

type OrgRole = "owner" | "manager" | "member" | "viewer";

const roleStyles: Record<OrgRole, string> = {
  owner: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  manager: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  member: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  viewer: "bg-white/5 text-white/40 border border-white/10",
};

interface RoleBadgeProps {
  role: string;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const style = roleStyles[role as OrgRole] ?? roleStyles.viewer;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize", style, className)}>
      {role}
    </span>
  );
}
