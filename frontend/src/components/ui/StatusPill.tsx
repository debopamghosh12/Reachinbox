import { Clock } from "lucide-react";
import type { EmailStatus } from "../../types/api";
import { formatFullDate, formatPillTime } from "../../lib/format";
import { cn } from "../../lib/cn";

const BASE = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap";

// Orange time pill for upcoming emails, gray "Sent", red "Failed".
// `error` (failed emails) becomes the pill's tooltip; the detail page shows it in full.
// `simulated`: sent with SMTP_DRY_RUN on, so the pill must not claim a real delivery.
export function StatusPill({
  status,
  scheduledAt,
  error,
  simulated,
}: {
  status: EmailStatus;
  scheduledAt: string;
  error?: string | null;
  simulated?: boolean;
}) {
  if (status === "sent") {
    return simulated ? (
      <span className={cn(BASE, "bg-gray-100 text-[#747D89]")} title="Delivery simulated: SMTP is blocked on this hosting plan">
        Sent (simulated)
      </span>
    ) : (
      <span className={cn(BASE, "bg-gray-100 text-[#747D89]")}>Sent</span>
    );
  }
  if (status === "failed") {
    return (
      <span className={cn(BASE, "bg-red-50 text-red-700")} title={error ? `Failed: ${error}` : "Failed"}>
        Failed
      </span>
    );
  }
  return (
    <time dateTime={scheduledAt} title={formatFullDate(scheduledAt)} className={cn(BASE, "bg-orange-100 text-orange-700")}>
      <Clock className="h-3 w-3" aria-hidden />
      {status === "sending" ? "Sending…" : formatPillTime(scheduledAt)}
    </time>
  );
}
