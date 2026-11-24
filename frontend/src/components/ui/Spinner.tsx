import { cn } from "../../lib/cn";

// Full-screen loading state (auth check, lazily loaded pages).
export function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center text-green-600">
      <Spinner label="Loading" />
    </div>
  );
}

// With a label it's announced to screen readers; without one it's decorative.
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
    />
  );
}
