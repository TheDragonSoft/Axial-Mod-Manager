import type { ComponentType, ReactNode } from "react";

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-surface text-stone-400">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-stone-200">{title}</p>
        {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
