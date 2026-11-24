import { ChevronDown, LogOut } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Avatar } from "../../components/ui/Avatar";
import { Popover } from "../../components/ui/Popover";
import { useToast } from "../../components/ui/Toast";
import { SlackSection } from "../slack/SlackSection";
import { useLogout, useMe } from "../auth/useAuth";

// The gray user card at the top of the sidebar. Click it for Slack and Logout.
export function UserMenu() {
  const { data: me } = useMe(); // already loaded by RequireAuth
  const logout = useLogout();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  if (!me) return null;

  const onLogout = () => logout.mutate(undefined, { onError: (err) => toast(`Couldn't log out: ${err.message}`, "error") });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? menuId : undefined}
        className="flex w-full items-center gap-2.5 rounded-xl bg-field px-3 py-2.5 text-left hover:bg-[#ecf0ed] focus-visible:outline-2 focus-visible:outline-green-600"
      >
        <Avatar name={me.name} src={me.avatarUrl} className="h-8 w-8 text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{me.name}</span>
          <span className="block truncate text-xs text-muted">{me.email}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} rootRef={rootRef} label="Account menu" align="left" className="w-full">
        <div id={menuId}>
          <SlackSection />
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={onLogout}
              disabled={logout.isPending}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-green-600 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      </Popover>
    </div>
  );
}
