import { clsx } from "clsx";

export default function ProgressBar({
  value,
  tone = "green",
  className,
}: {
  /** 0..100 */
  value: number;
  tone?: "green" | "red" | "white";
  className?: string;
}) {
  const fills = {
    green: "bg-accent",
    red: "bg-red-500",
    white: "bg-stone-100",
  } as const;
  return (
    <div
      className={clsx(
        "h-1.5 w-full overflow-hidden rounded-full bg-stone-800",
        className,
      )}
    >
      <div
        className={clsx(
          "h-full rounded-full transition-all duration-150 motion-reduce:transition-none",
          fills[tone],
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
