import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "outline" | "soft" | "ghost";
export type ButtonSize = "md" | "sm" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-green-600 text-white hover:bg-green-700",
  outline: "border border-green-600 text-green-600 bg-white hover:bg-brand-50",
  soft: "bg-brand-50 text-gray-900 hover:bg-[#d6f0e0]", // the Google button
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-4 rounded-lg text-sm",
  sm: "h-8 px-4 rounded-full text-sm",
  icon: "h-8 w-8 rounded-full",
};

// Exported so links (<a>, <Link>) can look exactly like buttons.
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant, size, loading = false, className, disabled, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
