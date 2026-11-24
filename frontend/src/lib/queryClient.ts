// TanStack Query keeps server data in a cache keyed by "query keys". A component
// asks for data with useQuery(key, fn), gets { data, isPending, isError } back,
// and every component using the same key shares one request and one cache entry.
// After a change (schedule, disconnect...) we "invalidate" a key and it refetches.
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, isUnauthorized } from "./api/client";

// All query keys in one place, so invalidation can't miss one because of a typo.
export const queryKeys = {
  me: ["me"] as const,
  emails: ["emails"] as const, // prefix of every list/count/detail key below
  list: (params: object) => ["emails", "list", params] as const,
  count: (tab: string) => ["emails", "count", tab] as const,
  detail: (id: string) => ["emails", "detail", id] as const,
  slack: ["slack"] as const,
};

// If any request comes back 401 (session expired), re-check /api/me.
// It fails too, and RequireAuth sends the user to /login.
function onError(err: unknown) {
  if (isUnauthorized(err)) void queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Retrying a 4xx (not logged in, not found) would just fail again.
      retry: (failures, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && failures < 2,
      staleTime: 10_000,
    },
  },
});
