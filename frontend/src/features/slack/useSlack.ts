import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectSlack, getSlackStatus } from "../../lib/api/endpoints";
import { queryKeys } from "../../lib/queryClient";

export function useSlackStatus() {
  return useQuery({ queryKey: queryKeys.slack, queryFn: getSlackStatus });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.slack }),
  });
}
