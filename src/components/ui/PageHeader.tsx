import type { ComponentType, ReactNode } from "react";

/**
 * Big page header: bordered icon tile + title + muted subtitle,
 * with an actions slot aligned right (the reference layout pattern).
 */
export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-stone-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-200">{title}</h1>
          {subtitle && (
            <p className="truncate text-sm text-stone-500">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
