import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "error";
}

// Used for "nothing here yet" and for errors (with a Retry action).
export function EmptyState({ icon: Icon, title, description, action, tone = "neutral" }: EmptyStateProps) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className="flex flex-col items-center px-6 py-16 text-center">
      <span className={tone === "error" ? "mb-3 rounded-full bg-red-50 p-3 text-red-600" : "mb-3 rounded-full bg-brand-50 p-3 text-green-600"}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
