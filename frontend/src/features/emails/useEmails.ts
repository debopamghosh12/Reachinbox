import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { countEmails, getEmail, listEmails, type ListParams } from "../../lib/api/endpoints";
import { queryKeys } from "../../lib/queryClient";
import type { ListTab } from "../../types/api";

export function useEmailList(params: ListParams) {
  return useQuery({
    queryKey: queryKeys.list(params),
    queryFn: () => listEmails(params),
    // While page 2 loads, keep showing page 1 instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
}

export function useEmailCount(tab: ListTab) {
  return useQuery({ queryKey: queryKeys.count(tab), queryFn: () => countEmails(tab) });
}

export function useEmail(id: string) {
  return useQuery({ queryKey: queryKeys.detail(id), queryFn: () => getEmail(id) });
}
