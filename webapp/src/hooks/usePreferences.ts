import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PreferencesPayload } from "@/lib/preferences";

export function usePreferences() {
  const query = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.get<PreferencesPayload>("/api/preferences"),
    staleTime: 60_000,
  });

  return {
    ...query,
    preferences: query.data,
    effective: query.data?.effective,
  };
}

