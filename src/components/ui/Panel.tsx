import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";
import Card from "./Card";

/** Icon shown in a small tinted tile inside a Panel / StatCard header.
 *  Hues are sampled from the reference: blue #0285EE, green #00CC46,
 *  purple #BB3FF2, orange #F97316. */
export const ICON_TILE_TONES = {
  green: "bg-[#00CC46]/10 text-[#00CC46]",
  blue: "bg-[#0285EE]/10 text-[#0285EE]",
  violet: "bg-[#BB3FF2]/10 text-[#BB3FF2]",
  orange: "bg-[#F97316]/10 text-[#F97316]",
  amber: "bg-amber-500/10 text-amber-400",
  red: "bg-red-500/10 text-red-400",
  zinc: "bg-stone-500/10 text-stone-300",
} as const;

export type IconTileTone = keyof typeof ICON_TILE_TONES;

export function IconTile({
  icon: Icon,
  tone = "zinc",
  size = "md",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: IconTileTone;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        ICON_TILE_TONES[tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  );
}

export default function Panel({
  icon,
  iconTone = "zinc",
  title,
  subtitle,
  actions,
  /** Flat panels sit directly on the page background (reference Settings look). */
  flat = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ComponentType<{ className?: string }>;
  iconTone?: IconTileTone;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flat?: boolean;
}) {
  return (
    <Card
      className={clsx(flat && "border-line bg-app", "p-5", className)}
      {...props}
    >
      {(icon || title) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <IconTile icon={icon} tone={iconTone} />}
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-stone-200">{title}</h3>
              {subtitle && (
                <p
                  className="truncate text-xs text-stone-400"
                  title={typeof subtitle === "string" ? subtitle : undefined}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}
