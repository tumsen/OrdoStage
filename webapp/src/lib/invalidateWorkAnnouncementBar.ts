import type { QueryClient } from "@tanstack/react-query";

/** Refetch the global work announcement strip after events, shows, jobs, or bookings change. */
export function invalidateWorkAnnouncementBar(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ["me", "announcement-bar"] });
}
