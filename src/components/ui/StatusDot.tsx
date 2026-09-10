import { clsx } from "clsx";

type Tone = "green" | "amber" | "red" | "zinc";

const TONES: Record<Tone, string> = {
  green: "bg-accent",
  amber: "bg-amber-400",
  red: "bg-red-500",
  zinc: "bg-stone-600",
};

export default function StatusDot({
  tone = "zinc",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        TONES[tone],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}
