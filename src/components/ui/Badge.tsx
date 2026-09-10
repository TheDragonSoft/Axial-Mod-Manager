import type { HTMLAttributes } from "react";
import { clsx } from "clsx";

type Tone = "neutral" | "green" | "amber" | "red" | "violet" | "sky";

/* green/violet use the reference's sampled accent hues (#00CC46 / #BB3FF2). */
const TONES: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-stone-300",
  green: "border-accent/30 bg-accent/10 text-accent",
  amber: "border-amber-900/60 bg-amber-950/40 text-amber-400",
  red: "border-red-900/60 bg-red-950/40 text-red-400",
  violet: "border-[#BB3FF2]/30 bg-[#BB3FF2]/10 text-[#BB3FF2]",
  sky: "border-sky-900/60 bg-sky-950/40 text-sky-300",
};

export default function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
