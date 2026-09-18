import type { ComponentType, ReactNode } from "react";
import Card from "./Card";
import { IconTile, type IconTileTone } from "./Panel";

/** Dashboard stat card: uppercase label, tinted icon tile, big value, sub-line. */
export default function StatCard({
  label,
  icon,
  iconTone = "green",
  value,
  sub,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  iconTone?: IconTileTone;
  value: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="text-[11px] font-medium tracking-widest text-stone-400 uppercase">
          {label}
        </span>
        <IconTile icon={icon} tone={iconTone} />
      </div>
      <div className="mt-3 text-3xl font-bold text-stone-200">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-stone-400">{sub}</div>}
    </>
  );
  if (!onClick) return <Card className="p-5">{body}</Card>;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer p-5 transition-colors hover:border-stone-600 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-1px]"
    >
      {body}
    </Card>
  );
}
