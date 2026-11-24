import { cn } from "../../lib/cn";

// A gray placeholder block shown while data loads.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-gray-100", className)} />;
}
