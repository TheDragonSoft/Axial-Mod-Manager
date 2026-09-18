import type { ReactNode } from "react";
import { clsx } from "clsx";

/** Settings row: label + description on the left, control on the right. */
export default function SettingRow({
  title,
  description,
  flat = false,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  flat?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-6",
        flat
          ? "border-none bg-transparent p-0"
          : "rounded-xl border border-line bg-surface px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-stone-200">{title}</h4>
        {description && (
          <p className="mt-0.5 text-xs text-stone-400">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
