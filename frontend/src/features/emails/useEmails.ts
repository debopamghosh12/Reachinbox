import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { countEmails, getEmail, listEmails, type ListParams } from "../../lib/api/endpoints";
import { queryKeys } from "../../lib/queryClient";
import type { ListTab } from "../../types/api";

// How often the open list (and with it the counts) refreshes while emails are
// still waiting to be sent. Polling stops when the Scheduled count is 0, and
// TanStack Query also pauses it while the browser tab is in the background.
const POLL_MS = 5000;

// True while anything is scheduled or sending (the Scheduled count covers both).
// Reads the same cached query as the sidebar, so it adds no request.
function usePending(): boolean {
  const scheduled = useEmailCount("scheduled");
  return (scheduled.data ?? 0) > 0;
}

export function useEmailList(params: ListParams) {
  const pending = usePending();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: queryKeys.list(params),
    queryFn: () => listEmails(params),
    // While page 2 loads, keep showing page 1 instead of flashing skeletons.
    placeholderData: keepPreviousData,
    refetchInterval: pending ? POLL_MS : false,
  });

  // Each time the list gets fresh data (first load, poll, refresh, new page or
  // search), refresh the sidebar counts too, so they never disagree with it.
  // This is also how polling stops: the last send makes Scheduled 0.
  useEffect(() => {
    if (list.dataUpdatedAt) void queryClient.invalidateQueries({ queryKey: queryKeys.counts });
  }, [list.dataUpdatedAt, queryClient]);

  return list;
}

export function useEmailCount(tab: ListTab) {
  return useQuery({ queryKey: queryKeys.count(tab), queryFn: () => countEmails(tab) });
}

export function useEmail(id: string) {
  return useQuery({ queryKey: queryKeys.detail(id), queryFn: () => getEmail(id) });
}
