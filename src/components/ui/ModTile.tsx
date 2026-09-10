import { useState } from "react";
import { clsx } from "clsx";

/**
 * Thumbnail tile for a mod. Shows the portal thumbnail when one exists,
 * otherwise a deterministic tinted letter tile (portal has no image for
 * every mod). `url === undefined` renders the fallback immediately.
 */
/* Letter-tile tints use the reference palette (blue/green/purple/orange/red). */
const TINTS = [
  "from-[#00CC46]/25 to-[#00CC46]/5 text-[#7FE79F]",
  "from-[#0285EE]/25 to-[#0285EE]/5 text-[#7FC4F6]",
  "from-[#BB3FF2]/25 to-[#BB3FF2]/5 text-[#DA9FF8]",
  "from-[#F97316]/25 to-[#F97316]/5 text-[#FDBA8C]",
  "from-red-500/25 to-red-500/5 text-red-300",
  "from-stone-400/25 to-stone-400/5 text-stone-300",
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

const SIZES = {
  sm: "h-9 w-9 rounded-lg text-xs",
  md: "h-11 w-11 rounded-lg text-sm",
  lg: "h-16 w-16 rounded-xl text-lg",
  xl: "h-20 w-20 rounded-xl text-xl",
} as const;

export default function ModTile({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  /** Absolute thumbnail URL, null (known missing) or undefined (unknown yet). */
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const letter = (name.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  const showImage = url != null && !failed;

  return (
    <div
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-line bg-gradient-to-br font-bold",
        SIZES[size],
        tintFor(name),
        className,
      )}
    >
      <span className={clsx(showImage && "opacity-0")}>{letter}</span>
      {showImage && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={clsx(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
