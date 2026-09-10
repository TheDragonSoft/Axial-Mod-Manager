import type { HTMLAttributes } from "react";
import { clsx } from "clsx";

export default function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-line bg-surface", className)}
      {...props}
    />
  );
}
