import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}

// The green-outlined recipient pill from the compose screen.
export function Chip({ children, onRemove, removeLabel }: ChipProps) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-green-500 bg-brand-50 pr-1.5 pl-2.5 text-xs text-gray-900">
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Remove"}
          className="rounded-full p-0.5 text-gray-500 hover:bg-white hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-green-600"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}
