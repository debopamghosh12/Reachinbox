import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { getMe, logout } from "../../lib/api/endpoints";
import { queryKeys } from "../../lib/queryClient";

// The logged-in user. A 401 here means "not logged in" (see RequireAuth).
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: getMe, staleTime: 5 * 60_000 });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear(); // drop every cached response of the old session
      navigate("/login", { replace: true });
    },
  });
}
