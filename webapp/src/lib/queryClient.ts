import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/** Don't waste retries on auth/validation errors. */
function queryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Fewer duplicate network hits when navigating between screens that share queries. */
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: queryRetry,
      /** Tab focus refetches were stacking with navigation and felt sluggish on large payloads. */
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
