import { Info } from "lucide-react";
import { useConfig } from "./useConfig";

// Shown only when the server runs with SMTP_DRY_RUN=true (the hosted demo),
// so nobody mistakes a simulated send for a real delivery. Not dismissable.
// Renders nothing while loading or if the config request fails.
export function DryRunBanner() {
  const config = useConfig();
  if (!config.data?.smtpDryRun) return null;
  return (
    <p role="note" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-900">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Hosted demo:</strong> this hosting plan blocks SMTP, so email delivery is
        simulated. Scheduling, delays, rate limiting, Slack alerts and restart recovery are real. Real Ethereal sending is
        shown in the demo video and works locally (see README).
      </span>
    </p>
  );
}
