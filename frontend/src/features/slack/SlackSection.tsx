import { Hash } from "lucide-react";
import { Button, buttonClasses } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { slackConnectUrl } from "../../lib/api/endpoints";
import { useDisconnectSlack, useSlackStatus } from "./useSlack";

// Lives in the user menu: shows where rate-limit alerts go, with Connect/Disconnect.
export function SlackSection() {
  const status = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const toast = useToast();

  const onDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => toast("Slack disconnected", "success"),
      onError: (err) => toast(`Couldn't disconnect Slack: ${err.message}`, "error"),
    });

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-xs font-medium tracking-wide text-[#B6B6B6] uppercase">Slack alerts</p>
      {status.isPending && <Skeleton className="h-8 w-full" />}
      {status.isError && <p className="text-xs text-red-600">Couldn't load Slack status</p>}
      {status.data?.connected && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-900">
            <Hash className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
            <span className="truncate">{status.data.channel?.replace(/^#/, "") ?? "connected"}</span>
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" loading={disconnect.isPending} onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      )}
      {status.data && !status.data.connected && (
        // A real navigation: Slack's consent screen is a different site.
        <a href={slackConnectUrl} className={buttonClasses("outline", "sm", "w-full")}>
          <Hash className="h-4 w-4" aria-hidden />
          Connect Slack
        </a>
      )}
    </div>
  );
}
