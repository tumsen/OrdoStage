import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface OrgRole {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  sortOrder: number;
}

/** Fetches org role definitions, sorted by sortOrder then name. Returns empty array while loading. */
export function useOrgRoles(): { roles: OrgRole[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<OrgRole[]>({
    queryKey: ["role-definitions"],
    queryFn: () => api.get<OrgRole[]>("/api/org/role-definitions"),
    staleTime: 60_000,
  });

  const roles = [...(data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );

  return { roles, isLoading };
}
