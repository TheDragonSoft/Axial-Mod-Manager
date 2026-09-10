import type { ComponentType, InputHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export const INPUT_CLASS =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50";

export default function Input({
  icon: Icon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  /** Optional leading icon (e.g. a search magnifier). */
  icon?: ComponentType<{ className?: string }>;
}) {
  const control = (
    <input className={clsx(INPUT_CLASS, className)} {...props} />
  );
  if (!Icon) return control;
  return (
    <div className="relative w-full">
      <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-600" />
      {control}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}
