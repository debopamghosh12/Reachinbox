import { Clock, Send } from "lucide-react";
import { Link } from "react-router";
import { buttonClasses } from "../../components/ui/Button";
import { Logo } from "../../components/ui/Logo";
import { NavItem } from "../../components/ui/NavItem";
import { useEmailCount } from "../emails/useEmails";
import { UserMenu } from "./UserMenu";

export function Sidebar() {
  const scheduled = useEmailCount("scheduled");
  const sent = useEmailCount("sent");

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 px-3 pt-5">
      <div className="px-2">
        <Logo />
      </div>
      <UserMenu />
      <Link to="/compose" className={buttonClasses("outline", "sm", "h-9 w-full rounded-xl")}>
        Compose
      </Link>
      <nav aria-label="Mailboxes">
        <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-[#B6B6B6] uppercase">Core</p>
        <div className="flex flex-col gap-0.5">
          <NavItem to="/dashboard" icon={Clock} label="Scheduled" count={scheduled.data} />
          <NavItem to="/dashboard/sent" icon={Send} label="Sent" count={sent.data} />
        </div>
      </nav>
    </aside>
  );
}
