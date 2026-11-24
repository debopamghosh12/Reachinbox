import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router";
import { useToast } from "../../components/ui/Toast";
import { queryKeys } from "../../lib/queryClient";
import { Sidebar } from "./Sidebar";

// Readable text for the ?slack=error&reason=... flags the backend sends back.
const SLACK_ERRORS: Record<string, string> = {
  cancelled: "Slack connection was cancelled.",
  invalid_state: "That Slack link expired or was already used. Please try again.",
  not_configured: "Slack isn't set up on the server.",
  missing_code: "Slack didn't send an authorization code. Please try again.",
  exchange_failed: "Slack connection failed. Please try again.",
  slack_error: "Slack reported an error. Please try again.",
};

export function DashboardLayout() {
  useSlackRedirectToast();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-4">
        <Outlet />
      </main>
    </div>
  );
}

// After Slack's OAuth the backend sends the browser to /dashboard?slack=connected
// (or ?slack=error&reason=...). Show a toast once, then remove the flags from the URL.
function useSlackRedirectToast() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  // React StrictMode runs effects twice in development: remember which URL we
  // already handled so the toast doesn't show twice.
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    const result = params.get("slack");
    if (!result || handledKey.current === location.key) return;
    handledKey.current = location.key;

    if (result === "connected") toast("Slack connected. Rate-limit alerts will be posted to your channel.", "success");
    else toast(SLACK_ERRORS[params.get("reason") ?? ""] ?? SLACK_ERRORS.slack_error, "error");
    void queryClient.invalidateQueries({ queryKey: queryKeys.slack });

    const clean = new URLSearchParams(params);
    clean.delete("slack");
    clean.delete("reason");
    setParams(clean, { replace: true }); // replace: Back doesn't bring the flags back
  }, [params, setParams, location.key, toast, queryClient]);
}
