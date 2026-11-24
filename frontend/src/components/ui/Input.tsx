import { useId, type ComponentProps } from "react";
import { cn } from "../../lib/cn";

interface InputProps extends ComponentProps<"input"> {
  label: string; // always required, for screen readers
  showLabel?: boolean; // the Figma uses placeholders instead of visible labels
  error?: string;
}

// The gray, borderless field from the login screen.
export function Input({ label, showLabel = false, error, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={showLabel ? "mb-1 block text-sm text-gray-600" : "sr-only"}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          "h-11 w-full rounded-lg bg-field px-4 text-sm text-gray-900 placeholder:text-gray-500",
          "focus:outline-2 focus:outline-green-600 disabled:cursor-not-allowed disabled:opacity-60",
        )}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
