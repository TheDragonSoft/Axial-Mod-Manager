import type { ModSummary } from "../types";
import { formatCount } from "../lib/format";

export default function ModCard({ mod }: { mod: ModSummary }) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-600">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{mod.title}</h3>
          <p className="truncate font-mono text-xs text-zinc-500">{mod.name}</p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${
            mod.factorioVersion === "2.0"
              ? "bg-green-900/40 text-green-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {mod.factorioVersion}
        </span>
      </div>

      <p className="mt-2 line-clamp-3 min-h-14 text-xs leading-relaxed text-zinc-400">
        {mod.summary}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3">
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-300">⬇ {formatCount(mod.downloads)}</span>
          <span className="mx-1.5">·</span>
          v{mod.latestVersion}
        </div>
        <button
          disabled
          title="Downloads arrive in Phase 5"
          className="cursor-not-allowed rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-500"
        >
          Download
        </button>
      </div>
    </div>
  );
}
