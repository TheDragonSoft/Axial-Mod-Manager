import type { ReactNode } from "react";

/** Settings row: label + description on the left, control on the right. */
export default function SettingRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-white">{title}</h4>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
