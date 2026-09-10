import { useCallback, useEffect, useState } from "react";
import ModCard from "../components/ModCard";
import ModDetailsModal from "../components/ModDetailsModal";
import { getSettings, indexHealthCheck, searchMods, toAppError } from "../lib/api";
import type { AppError, IndexHealth, ModSummary, SearchResult, SortKey } from "../types";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="h-4 w-2/3 rounded bg-zinc-800" />
      <div className="mt-2 h-3 w-1/3 rounded bg-zinc-800" />
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-zinc-800" />
        <div className="h-3 w-full rounded bg-zinc-800" />
        <div className="h-3 w-3/4 rounded bg-zinc-800" />
      </div>
      <div className="mt-4 h-7 w-24 self-end rounded bg-zinc-800" />
    </div>
  );
}

/** Network-layer diagnostics — proves the Rust HTTP stack from the UI. */
function DiagnosticsPanel() {
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<IndexHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setHealth(await indexHealthCheck());
    } catch (e) {
      setHealth(null);
      setError(toAppError(e).message);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={running}
        className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
      >
        {running ? "Probing…" : "Run index diagnostics"}
      </button>
      {error && <p className="mt-2 font-mono text-xs text-red-400">{error}</p>}
      {health && (
        <div className="mt-2 rounded border border-green-900/60 bg-green-950/30 p-3 text-xs">
          <p className="text-green-400">
            OK · HTTP {health.httpStatus} · {health.byteLength.toLocaleString()} bytes
          </p>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-500">
            {health.excerpt}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function BrowsePage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("downloads");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<ModSummary | null>(null);
  const [_gameVersion, setGameVersion] = useState("2.0");
  void _gameVersion;

  // Debounce the search input (350ms).
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Any query/sort change resets pagination.
  useEffect(() => setPage(1), [query, sort]);

  // Target game version (for compat badges) + live updates.
  useEffect(() => {
    getSettings()
      .then((s) => setGameVersion(s.targetFactorioVersion))
      .catch(() => undefined);
  }, []);

  // Fetch — the one effect that talks to the backend.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchMods(query, page, sort)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(toAppError(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, page, sort, reloadKey]);

  const showSkeletons = data === null && loading;
  const results = data?.results ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Browse</h2>
        <div className="flex items-center gap-2">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search mods…"
            className="w-64 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 outline-none focus:border-amber-500"
          >
            <option value="downloads">Most downloads</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-900/60 bg-red-950/40 p-4">
          <p className="text-sm text-red-400">
            <span className="mr-2 rounded bg-red-900/60 px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {error.kind}
            </span>
            {error.message}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-xs text-zinc-400 underline hover:text-zinc-200"
            >
              Retry
            </button>
          </div>
          {error.kind === "not_implemented" && (
            <p className="mt-2 text-xs text-amber-500/80">
              Expected in Phase 4A — the adapter is wired once the discovery report is provided.
            </p>
          )}
          <DiagnosticsPanel />
        </div>
      )}

      {showSkeletons && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-zinc-600">
              {data.totalCount.toLocaleString()} mods · page {data.page} of {data.pageCount}
            </p>
            {data.pageCount > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-amber-500 disabled:opacity-40"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= data.pageCount || loading}
                  onClick={() => setPage((p) => Math.min(data.pageCount, p + 1))}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-amber-500 disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          <div
            className={`mt-3 grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${
              loading ? "opacity-50" : ""
            }`}
          >
            {results.length === 0 && !loading ? (
              <div className="col-span-full mt-16 text-center text-sm text-zinc-500">
                No mods match “{query}”.
              </div>
            ) : (
              results.map((mod) => (
                <ModCard key={mod.name} mod={mod} onOpen={setSelected} />
              ))
            )}
          </div>
        </>
      )}

      {selected && <ModDetailsModal mod={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
