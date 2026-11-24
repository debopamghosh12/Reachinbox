import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "../../lib/cn";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number;
}

// Sidebar link. NavLink knows when its route is active, which gives the
// light-green background (and aria-current="page" for screen readers).
export function NavItem({ to, icon: Icon, label, count }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-green-600",
          isActive ? "bg-brand-50 font-semibold text-gray-900" : "text-gray-600 hover:bg-gray-50",
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs font-normal text-muted tabular-nums">{count}</span>}
    </NavLink>
  );
}
