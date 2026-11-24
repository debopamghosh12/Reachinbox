import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getEmail, getEmailSummary, listEmails, type ListParams } from "../../lib/api/endpoints";
import { pollDelay } from "../../lib/polling";
import { queryKeys } from "../../lib/queryClient";
import type { ListTab } from "../../types/api";

export function useEmailList(params: ListParams) {
  const queryClient = useQueryClient();
  // Same cached query as the sidebar's Scheduled count: no extra request.
  const next = useEmailSummary("scheduled").data?.first ?? null;

  const list = useQuery({
    queryKey: queryKeys.list(params),
    queryFn: () => listEmails(params),
    // While page 2 loads, keep showing page 1 instead of flashing skeletons.
    placeholderData: keepPreviousData,
    // A function, so TanStack Query recomputes the delay after every fetch
    // (with the current time) and whenever `next` changes. Polling pauses
    // while the tab is in the background (refetchIntervalInBackground is false).
    refetchInterval: () => pollDelay(next),
  });

  // Each time the list gets fresh data (first load, poll, refresh, new page or
  // search), refresh the sidebar counts too, so they never disagree with it.
  // That also refreshes `next`, which re-times the polling above.
  useEffect(() => {
    if (list.dataUpdatedAt) void queryClient.invalidateQueries({ queryKey: queryKeys.counts });
  }, [list.dataUpdatedAt, queryClient]);

  return list;
}

export function useEmailSummary(tab: ListTab) {
  return useQuery({ queryKey: queryKeys.count(tab), queryFn: () => getEmailSummary(tab) });
}

export function useEmail(id: string) {
  return useQuery({ queryKey: queryKeys.detail(id), queryFn: () => getEmail(id) });
}
