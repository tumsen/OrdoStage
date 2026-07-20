import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import type { PreferencesPayload } from "@/lib/preferences";

export function usePreferences() {
  const { data: session } = useSession();
  const query = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.get<PreferencesPayload>("/api/preferences"),
    staleTime: 60_000,
    enabled: Boolean(session?.user),
  });

  return {
    ...query,
    preferences: query.data,
    effective: query.data?.effective,
  };
}

