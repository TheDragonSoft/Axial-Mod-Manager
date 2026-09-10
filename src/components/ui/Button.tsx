import type { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Primary actions are white by design (see index.css tokens note).
  primary: "bg-white text-zinc-950 hover:bg-zinc-200",
  secondary:
    "border border-line bg-surface-2 text-zinc-200 hover:border-zinc-600 hover:text-white",
  ghost: "text-zinc-400 hover:bg-surface-2 hover:text-zinc-100",
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
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
