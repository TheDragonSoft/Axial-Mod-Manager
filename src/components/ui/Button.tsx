import type { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  // Primary actions are the reference's warm off-white (sampled #E7E5E4).
  primary: "bg-stone-200 text-stone-950 hover:bg-stone-300",
  secondary:
    "border border-line bg-input text-stone-200 hover:border-stone-600 hover:text-stone-100",
  ghost: "text-stone-400 hover:bg-surface-2 hover:text-stone-100",
  danger:
    "border border-red-900/60 bg-red-950/40 text-red-300 hover:border-red-700 hover:text-red-200",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm"
          ? "px-2.5 py-1.5 text-xs"
          : size === "icon"
            ? "h-9 w-9 p-0"
            : "px-3.5 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
