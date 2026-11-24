import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/cn";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  // Element that wraps the trigger button(s) AND this panel. Clicks or focus
  // inside it don't count as "outside", so a trigger click doesn't
  // close-then-reopen the panel.
  rootRef: RefObject<HTMLElement | null>;
  label: string; // accessible name of the dialog
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

// A small floating panel under its trigger. Keyboard behavior:
//  - opening moves focus to the first control inside
//  - Escape closes it and puts focus back on the trigger
//  - tabbing out or clicking outside closes it
export function Popover({ open, onClose, rootRef, label, align = "right", className, children }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect on every render
  // (re-running would steal focus back to the first control each time).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const isOutside = (target: EventTarget | null) => !(target instanceof Node && rootRef.current?.contains(target));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onCloseRef.current();
      trigger?.focus();
    };
    const onPointerDown = (e: PointerEvent) => isOutside(e.target) && onCloseRef.current();
    const onFocusIn = (e: FocusEvent) => isOutside(e.target) && onCloseRef.current();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, rootRef]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={cn(
        "absolute top-full z-40 mt-2 rounded-xl border border-line bg-white shadow-[0_4px_16px_rgba(16,24,40,0.12)]",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
