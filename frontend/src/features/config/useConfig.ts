import { useQuery } from "@tanstack/react-query";
import { getConfig } from "../../lib/api/endpoints";
import { queryKeys } from "../../lib/queryClient";

// Server facts that only change on a redeploy: fetched once per page load.
export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: getConfig, staleTime: Infinity });
}
