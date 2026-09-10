import type { SelectHTMLAttributes } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";

/** Styled native select with a chevron; standard select semantics preserved. */
export default function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={clsx("relative", className)}>
      <select
        className="w-full appearance-none rounded-lg border border-line bg-surface-2 py-2 pr-9 pl-3 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-zinc-600" />
    </div>
  );
}
