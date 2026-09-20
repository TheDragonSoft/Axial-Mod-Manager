import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  Search,
  SearchX,
  WifiOff,
} from "lucide-react";
import {
  getBulkModDetails,
  indexHealthCheck,
  isNetworkOrHttpError,
  searchMods,
  toAppError,
} from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { useFavoritesStore } from "../store/useFavoritesStore";
import { useThumbnails } from "../lib/thumbnails";
import ModCard from "../components/ModCard";
import InstallModal from "../components/InstallModal";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Input from "../components/ui/Input";
import PageHeader from "../components/ui/PageHeader";
import Select from "../components/ui/Select";
import Spinner from "../components/ui/Spinner";
import type {
  AppError,
  IndexHealth,
  ModDetails,
  ModSummary,
  SearchResult,
  SortKey,
} from "../types";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-lg bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-surface-2" />
          <div className="h-3 w-1/3 rounded bg-surface-2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-surface-2" />
        <div className="h-3 w-3/4 rounded bg-surface-2" />
      </div>
      <div className="mt-4 flex justify-end">
        <div className="h-8 w-24 rounded-lg bg-surface-2" />
      </div>
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
    <div>
      <Button variant="secondary" size="sm" onClick={run} disabled={running}>
        {running && <Spinner />} Run index diagnostics
      </Button>
      {error && <p className="mt-2 font-mono text-xs text-red-400">{error}</p>}
      {health && (
        <div className="mt-2 rounded-lg border border-green-900/60 bg-green-950/30 p-3 text-xs">
          <p className="text-green-400">
            OK · HTTP {health.httpStatus} · {health.byteLength.toLocaleString()}{" "}
            bytes
          </p>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-stone-400">
            {health.excerpt}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Favorites-only view: the portal search can't filter by name list here, so
 * each favorite's card is built from its (cached) details response.
 */
function FavoritesView({
  targetVersion,
  onOpen,
  onInstall,
}: {
  targetVersion: string | null;
  onOpen: (mod: ModSummary) => void;
  onInstall: (mod: ModSummary) => void;
}) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const [details, setDetails] = useState<ModDetails[]>([]);
  const [loading, setLoading] = useState(true);
  useThumbnails(favorites);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBulkModDetails(favorites)
      .then((rs) => {
        if (cancelled) return;
        setDetails(rs);
      })
      .catch(() => {
        if (cancelled) return;
        setDetails([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  const toSummary = (d: ModDetails): ModSummary => {
    const latest = d.releases[0];
    return {
      name: d.name,
      title: d.title,
      downloads: d.downloads ?? 0,
      latestVersion: latest?.version ?? "?",
      factorioVersion: latest?.factorioVersion ?? "",
      summary: d.summary,
    };
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: Math.max(3, Math.min(favorites.length, 9)) }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (details.length === 0) {
    if (favorites.length > 0) {
      return (
        <EmptyState
          icon={WifiOff}
          title="Can't reach the portal"
          hint="Axial couldn't reach the portal to load your favorites."
        />
      );
    }
    return (
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        hint="Click the heart on any mod card to keep it here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {details.map((d) => (
        <ModCard
          key={d.name}
          mod={toSummary(d)}
          targetVersion={targetVersion}
          onOpen={onOpen}
          onInstall={onInstall}
        />
      ))}
    </div>
  );
}

export default function BrowsePage() {
  const targetVersion = useAppStore((s) => s.targetFactorioVersion);
  const pendingBrowseQuery = useAppStore((s) => s.pendingBrowseQuery);
  const setPendingBrowseQuery = useAppStore((s) => s.setPendingBrowseQuery);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("downloads");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [installTarget, setInstallTarget] = useState<ModSummary | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Debounce the search input (350ms); committing a new search also resets
  // pagination here (not via a separate effect, which fetched twice).
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  // One-shot hand-off from the command palette ("install a mod by name"):
  // prefill the search and drop any favorites-only filter. Consumed
  // immediately so revisiting Browse doesn't re-run a stale query.
  useEffect(() => {
    if (pendingBrowseQuery === null) return;
    setQueryInput(pendingBrowseQuery);
    setFavoritesOnly(false);
    setPendingBrowseQuery(null);
  }, [pendingBrowseQuery, setPendingBrowseQuery]);

  // Fetch — the one effect that talks to the backend.
  useEffect(() => {
    if (favoritesOnly) return;
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
  }, [query, page, sort, reloadKey, favoritesOnly]);

  const results = data?.results ?? [];
  useThumbnails(favoritesOnly ? [] : results.map((m) => m.name));

  const showSkeletons = !favoritesOnly && data === null && loading;

  return (
    <div>
      <PageHeader
        icon={Compass}
        title="Browse"
        subtitle="Discover mods from the official Factorio portal"
        actions={
          <>
            <Button
              variant={favoritesOnly ? "primary" : "secondary"}
              onClick={() => setFavoritesOnly((v) => !v)}
            >
              <Heart className={`h-4 w-4 ${favoritesOnly ? "fill-current" : ""}`} />
              Favorites
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Diagnostics"
              title="Run index diagnostics"
              onClick={() => setShowDiagnostics((v) => !v)}
              className={showDiagnostics ? "text-stone-200" : ""}
            >
              <Activity className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {!favoritesOnly && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-64 flex-1">
              <Input
                icon={Search}
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search mods…"
              />
            </div>
            <Select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPage(1); // sort change resets pagination (no separate reset effect)
              }}
              className="w-44"
            >
              <option value="downloads">Most downloads</option>
              <option value="name">Name A–Z</option>
            </Select>
            <Button variant="primary" onClick={() => setQuery(queryInput.trim())}>
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>

          {showDiagnostics && (
            <div className="mt-3 rounded-xl border border-line bg-surface p-4">
              <DiagnosticsPanel />
            </div>
          )}

          {error &&
            (isNetworkOrHttpError(error) ? (
              <EmptyState
                icon={WifiOff}
                title="Can't reach the portal"
                hint="Axial couldn't connect to the Factorio mod portal. Check your internet connection."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setReloadKey((k) => k + 1)}
                  >
                    Retry
                  </Button>
                }
              />
            ) : (
              <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/40 p-4">
                <p className="text-sm text-red-400">
                  <Badge tone="red" className="mr-2 font-mono uppercase">
                    {error.kind}
                  </Badge>
                  {error.message}
                </p>
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReloadKey((k) => k + 1)}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ))}

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
                <p className="text-xs text-stone-400">
                  {data.totalCount.toLocaleString()} mods · page {data.page} of{" "}
                  {data.pageCount}
                </p>
                {data.pageCount > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= data.pageCount || loading}
                      onClick={() => setPage((p) => Math.min(data.pageCount, p + 1))}
                      aria-label="Next page"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              <div
                className={`mt-3 grid grid-cols-1 gap-4 transition-opacity motion-reduce:transition-none md:grid-cols-2 xl:grid-cols-3 ${
                  loading ? "opacity-50" : ""
                }`}
              >
                {results.length === 0 && !loading ? (
                  <div className="col-span-full">
                    <EmptyState
                      icon={SearchX}
                      title={`No mods match “${query}”`}
                      hint="Try a different search."
                    />
                  </div>
                ) : (
                  results.map((mod) => (
                    <ModCard
                      key={mod.name}
                      mod={mod}
                      targetVersion={targetVersion}
                      onOpen={setInstallTarget}
                      onInstall={setInstallTarget}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      {favoritesOnly && (
        <FavoritesView
          targetVersion={targetVersion}
          onOpen={setInstallTarget}
          onInstall={setInstallTarget}
        />
      )}

      {installTarget && (
        <InstallModal
          mod={installTarget}
          onClose={() => setInstallTarget(null)}
        />
      )}
    </div>
  );
}
