import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PreferenceSet } from "@/lib/preferences";

export function useUserPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<PreferenceSet>) =>
      api.patch<{ ok: boolean }>("/api/preferences", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });
}
