import { useCallback, useEffect, useState } from "react";
import { getModDetails, getSettings, toAppError } from "../lib/api";
import { compareVersions, formatBytes, formatCount } from "../lib/format";
import type { AppError, ModDetails, ModRelease, ModSummary } from "../types";

interface Props {
  mod: ModSummary;
  onClose: () => void;
}

function ReleaseRow({ release, isLatest, target }: { release: ModRelease; isLatest: boolean; target: string }) {
  const compatible = release.factorioVersion === target;
  return (
    <tr className="border-b border-zinc-800/60">
      <td className="py-2 pr-3 font-mono text-zinc-200">
        v{release.version}
        {isLatest && (
          <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
            latest
          </span>
        )}
      </td>
      <td className="py-2 pr-3">
        <span
          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
            compatible ? "bg-green-900/40 text-green-400" : "bg-zinc-800 text-zinc-400"
          }`}
          title={compatible ? "Compatible with your target version" : `Targets game ${release.factorioVersion}`}
        >
          {compatible ? `✓ ${release.factorioVersion}` : `needs ${release.factorioVersion}`}
        </span>
      </td>
      <td className="py-2 pr-3 text-xs text-zinc-500">
        {release.releasedAt ? new Date(release.releasedAt).toLocaleDateString() : "—"}
      </td>
      <td className="py-2 pr-3 text-xs text-zinc-500">
        {release.fileSize !== null ? formatBytes(release.fileSize) : "—"}
      </td>
      <td className="py-2 pr-3 text-xs text-zinc-500">
        {release.downloadsCount !== null ? formatCount(release.downloadsCount) : "—"}
      </td>
      <td className="py-2 text-right">
        <button
          disabled
          title="Downloads arrive in Phase 5"
          className="cursor-not-allowed rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-500"
        >
          Download
        </button>
      </td>
    </tr>
  );
}

export default function ModDetailsModal({ mod, onClose }: Props) {
  const [details, setDetails] = useState<ModDetails | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("2.0");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getModDetails(mod.name), getSettings()])
      .then(([d, s]) => {
        setDetails(d);
        setTarget(s.targetFactorioVersion);
      })
      .catch((e) => setError(toAppError(e)))
      .finally(() => setLoading(false));
  }, [mod.name]);

  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const releases = details
    ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">{mod.title}</h3>
            <p className="font-mono text-xs text-zinc-500">{mod.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          {details?.summary ?? mod.summary}
        </p>

        {details?.owner && (
          <p className="mt-2 text-xs text-zinc-500">
            by <span className="text-zinc-400">{details.owner}</span>
            {details.downloads !== null && <> · {formatCount(details.downloads)} downloads</>}
          </p>
        )}

        <h4 className="mt-5 border-t border-zinc-800 pt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Releases {details && `(${details.releases.length})`}
          <span className="ml-2 normal-case text-zinc-600">
            · compatibility vs target {target}
          </span>
        </h4>

        {loading && <p className="mt-4 text-sm text-zinc-500">Loading releases…</p>}

        {error && (
          <div className="mt-4 rounded border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs text-red-400">{error.message}</p>
            <button onClick={load} className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-200">
              Retry
            </button>
          </div>
        )}

        {details && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-600">
                <th className="pb-1 pr-3 font-medium">Version</th>
                <th className="pb-1 pr-3 font-medium">Game</th>
                <th className="pb-1 pr-3 font-medium">Released</th>
                <th className="pb-1 pr-3 font-medium">Size</th>
                <th className="pb-1 pr-3 font-medium">DLs</th>
                <th className="pb-1 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {releases.map((r, i) => (
                <ReleaseRow key={r.version} release={r} isLatest={i === 0} target={target} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
