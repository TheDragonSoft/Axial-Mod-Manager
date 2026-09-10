import { useCallback, useEffect, useState } from "react";
import { enqueueDownload, getModDetails, toAppError } from "../lib/api";
import { compareVersions, formatBytes } from "../lib/format";
import { useQueueStore } from "../store/useQueueStore";
import type { AppError, InstalledMod, ModDetails } from "../types";

export default function VersionsModal({ mod, onClose }: { mod: InstalledMod; onClose: () => void }) {
  const [details, setDetails] = useState<ModDetails | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    getModDetails(mod.name)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toAppError(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true; // a closed/retried load must not overwrite fresh state
    };
  }, [mod.name]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function install(version: string) {
    setInstalling(version);
    try {
      await enqueueDownload(mod.name, version);
      onClose();
      useQueueStore.getState().open();
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setInstalling(null);
    }
  }

  const releases = details
    ? [...details.releases].sort((a, b) => compareVersions(b.version, a.version))
    : [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Versions — {mod.name}</h3>
            <p className="text-xs text-zinc-500">
              installed: v{mod.version} · switching versions replaces the old zip
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>

        {loading && <p className="mt-4 text-sm text-zinc-500">Loading releases…</p>}
        {error && (
          <div className="mt-3 rounded border border-red-900/60 bg-red-950/40 p-3">
            <p className="text-xs text-red-400">{error.message}</p>
            <button onClick={load} className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-200">Retry</button>
          </div>
        )}

        {details && (
          <ul className="mt-3 divide-y divide-zinc-800/60 rounded border border-zinc-800">
            {releases.map((r) => {
              const isInstalled = r.version === mod.version;
              return (
                <li key={r.version} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-zinc-200">
                      v{r.version}
                      {isInstalled && (
                        <span className="ml-2 rounded bg-green-900/40 px-1.5 py-0.5 text-[10px] text-green-400">
                          installed
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      game {r.factorioVersion || "?"}
                      {r.fileSize !== null && ` · ${formatBytes(r.fileSize)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => void install(r.version)}
                    disabled={isInstalled || installing !== null}
                    className="shrink-0 rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {installing === r.version ? "…" : isInstalled ? "✓" : "Install"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
