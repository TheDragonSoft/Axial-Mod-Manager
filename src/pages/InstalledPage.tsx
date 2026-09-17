import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronRight,
  History,
  Package,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Toggle from "../components/ui/Toggle";
import VersionsModal from "../components/VersionsModal";
import {
  checkUpdates,
  enqueueDownload,
  isNetworkOrHttpError,
  listInstalled,
  toAppError,
  toggleMod,
  uninstallImpact,
  uninstallMod,
} from "../lib/api";
import { onInstalledChanged, onSettingsChanged } from "../lib/events";
import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnails, useThumbnailUrl } from "../lib/thumbnails";
import { fetchSummary, useSummary } from "../lib/summaries";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import ModTile from "../components/ui/ModTile";
import PageHeader from "../components/ui/PageHeader";
import Spinner from "../components/ui/Spinner";
import { useConfirm } from "../components/ui/useConfirm";
import type { InstalledMod, UpdatesReport } from "../types";

/** Prevent interactive controls inside the row from toggling expansion. */
function stopRow(e: React.MouseEvent) {
  e.stopPropagation();
}

function ModRow({
  mod,
  confirming,
  busy,
  updateTo,
  expanded,
  impact,
  onToggle,
  onUninstall,
  onUpdate,
  onVersions,
  onToggleExpand,
}: {
  mod: InstalledMod;
  confirming: boolean;
  busy: boolean;
  updateTo: string | null;
  expanded: boolean;
  /** Installed mods this removal would leave broken (may still be loading). */
  impact: string[] | null;
  onToggle: (mod: InstalledMod, next: boolean) => void;
  onUninstall: (mod: InstalledMod) => void;
  onUpdate: (mod: InstalledMod) => void;
  onVersions: (mod: InstalledMod) => void;
  onToggleExpand: (mod: InstalledMod) => void;
}) {
  const thumbnail = useThumbnailUrl(mod.name);
  const summary = useSummary(mod.name);

  return (
    <Card
      className={`overflow-hidden transition-opacity duration-150 ${
        mod.enabled
          ? ""
          : "opacity-60 hover:opacity-90 focus-within:opacity-100"
      }`}
    >
      {/* Clickable header — acts as the accordion trigger */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${mod.name} — ${expanded ? "collapse" : "expand"} details`}
        className={`flex cursor-pointer items-center gap-4 p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
          mod.enabled ? "hover:bg-surface-2/40" : "hover:bg-surface-2/25"
        }`}
        onClick={() => onToggleExpand(mod)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand(mod);
          }
        }}
      >
        {/* Chevron affordance with rotation transition */}
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-150 ${
            mod.enabled ? "text-stone-500" : "text-stone-600"
          } ${expanded ? "rotate-90" : ""}`}
        />

        <ModTile name={mod.name} url={thumbnail} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`truncate font-medium ${
                mod.enabled ? "text-stone-100" : "text-stone-400"
              }`}
            >
              {mod.name}
            </p>
            {mod.problem && (
              <Badge tone="red" title={mod.problem}>
                problem
              </Badge>
            )}
            {updateTo && <Badge tone="green">update → v{updateTo}</Badge>}
          </div>
          {/* Secondary facts shown in collapsed state; moved into expanded area when open */}
          {!expanded && (
            <p
              className={`mt-0.5 truncate font-mono text-xs ${
                mod.enabled ? "text-stone-500" : "text-stone-600"
              }`}
            >
              v{mod.version} · Factorio{" "}
              <GameVersionBadge factorioVersion={mod.factorioVersion} enabled={mod.enabled} /> ·{" "}
              {mod.dependencies.length} deps
            </p>
          )}
          {!expanded && mod.problem && (
            <p className="mt-0.5 max-w-md truncate text-[11px] text-red-400" title={mod.problem}>
              {mod.problem}
            </p>
          )}
        </div>

        {/* Controls — stopPropagation so they don't toggle expansion */}
        <div className="flex shrink-0 items-center gap-1.5" onClick={stopRow}>
          {/* Inform, don't block: dependents are shown during the confirm
              window; the second click still removes without extra gating. */}
          {confirming && impact && impact.length > 0 && (
            <span
              className="max-w-[240px] text-right text-[11px] leading-snug text-amber-400"
              title={impact.join(", ")}
            >
              Removing {mod.name} leaves {impact.length} mod
              {impact.length === 1 ? "" : "s"} broken: {impact.slice(0, 3).join(", ")}
              {impact.length > 3 ? `, +${impact.length - 3} more` : ""}
            </span>
          )}
          {updateTo && (
            <Button variant="secondary" size="sm" onClick={() => onUpdate(mod)}>
              <ArrowUpCircle className="h-3.5 w-3.5 text-accent" />
              Update
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            title="Versions"
            aria-label={`Versions of ${mod.name}`}
            onClick={() => onVersions(mod)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant={confirming ? "danger" : "ghost"}
            size="sm"
            onClick={() => onUninstall(mod)}
            disabled={busy}
            title="Remove"
            aria-label={`Remove ${mod.name}`}
          >
            {busy ? (
              <Spinner />
            ) : confirming ? (
              "Confirm remove?"
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
          <div className="ml-2">
            <Toggle
              checked={mod.enabled}
              onChange={(v) => onToggle(mod, v)}
              label={mod.enabled ? `Disable ${mod.name}` : `Enable ${mod.name}`}
            />
          </div>
        </div>
      </div>

      {/* Expanded panel with height transition */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line bg-surface-2/30 px-4 py-3">
            {/* Secondary facts moved here when expanded */}
            <p
              className={`mb-2 font-mono text-xs ${
                mod.enabled ? "text-stone-500" : "text-stone-600"
              }`}
            >
              v{mod.version} · Factorio{" "}
              <GameVersionBadge factorioVersion={mod.factorioVersion} enabled={mod.enabled} /> ·{" "}
              {mod.dependencies.length} dep{mod.dependencies.length === 1 ? "" : "s"}
            </p>

            {mod.problem && (
              <p className="mb-2 max-w-xl text-[11px] text-red-400">{mod.problem}</p>
            )}

            {/* Portal summary: skeleton / text / unavailable */}
            {summary === undefined ? (
              <div className="space-y-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-stone-800" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-stone-800" />
              </div>
            ) : summary === null ? (
              <p className="text-xs italic text-stone-600">Description unavailable</p>
            ) : (
              <p
                className={`max-w-xl text-sm leading-relaxed ${
                  mod.enabled ? "text-stone-400" : "text-stone-500"
                }`}
              >
                {summary}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Green when the mod targets the configured game version (not a hardcoded
 * "2.0" — gray until the real target is loaded). */
function GameVersionBadge({
  factorioVersion,
  enabled = true,
}: {
  factorioVersion: string;
  enabled?: boolean;
}) {
  const target = useAppStore((s) => s.targetFactorioVersion);
  const compatible = target !== null && factorioVersion === target;
  return (
    <span
      className={
        compatible
          ? enabled
            ? "text-green-400"
            : "text-green-500/70"
          : enabled
          ? "text-stone-500"
          : "text-stone-600"
      }
    >
      {factorioVersion}
    </span>
  );
}

export default function InstalledPage() {
  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const effectiveModsDir = useAppStore((s) => s.effectiveModsDir);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof listInstalled>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [report, setReport] = useState<UpdatesReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [versionsFor, setVersionsFor] = useState<InstalledMod | null>(null);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [impactByFile, setImpactByFile] = useState<Record<string, string[]>>({});
  const { confirming, arm, disarm } = useConfirm();

  /** Mods dir of the last snapshot — a settings save that changes it needs a
   * hard reload; any other save just refreshes quietly. */
  const modsDirRef = useRef<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snap = await listInstalled();
      modsDirRef.current = snap.modsDir;
      setSnapshot(snap);
      setError(null);
    } catch (e) {
      const err = toAppError(e);
      if (err.kind === "not_found") {
        // Factorio not found — gracefully surfaced via empty state
        setSnapshot(null);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /** Coalesce bursts (every completed download emits installed-changed) into
   * one rescan instead of N back-to-back ones. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 500);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const u1 = onInstalledChanged(() => scheduleRefresh());
    const u2 = onSettingsChanged((settings) => {
      if (settings.modsDir !== null && modsDirRef.current !== null && settings.modsDir !== modsDirRef.current) {
        setLoading(true); // different folder — the stale list is meaningless
      }
      scheduleRefresh();
    });
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      void Promise.all([u1, u2]).then(([f1, f2]) => {
        f1();
        f2();
      });
    };
  }, [scheduleRefresh]);

  const mods = snapshot?.mods ?? [];

  const { enabledMods, disabledMods } = useMemo(() => {
    const enabled: InstalledMod[] = [];
    const disabled: InstalledMod[] = [];
    for (const m of mods) {
      if (m.enabled) {
        enabled.push(m);
      } else {
        disabled.push(m);
      }
    }
    const cmp = (a: InstalledMod, b: InstalledMod) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.name.localeCompare(b.name);
    enabled.sort(cmp);
    disabled.sort(cmp);
    return { enabledMods: enabled, disabledMods: disabled };
  }, [mods]);

  useThumbnails(mods.map((m) => m.name));

  const updateByName = useMemo(() => {
    const m = new Map<string, string>();
    report?.updates.forEach((u) => m.set(u.name, u.availableVersion));
    return m;
  }, [report]);

  async function runCheck() {
    setChecking(true);
    setUpdateError(null);
    try {
      const r = await checkUpdates();
      setReport(r);
      useAppStore
        .getState()
        .setUpdateCount(r.updates.length > 0 ? r.updates.length : null);
    } catch (e) {
      const err = toAppError(e);
      if (isNetworkOrHttpError(err)) {
        setUpdateError("Can't reach the portal to check for updates.");
      } else if (err.kind === "not_found") {
        setUpdateError("Factorio not found — set your mods folder in Settings.");
      } else {
        setError(err.message);
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleUpdate(mod: InstalledMod) {
    const u = report?.updates.find((x) => x.name === mod.name);
    if (!u) return;
    try {
      await enqueueDownload(u.name, u.availableVersion);
      setReport((r) =>
        r ? { ...r, updates: r.updates.filter((x) => x.name !== u.name) } : r,
      );
      const remaining = (report?.updates.length ?? 1) - 1;
      useAppStore.getState().setUpdateCount(remaining > 0 ? remaining : null);
      useQueueStore.getState().open();
    } catch (e) {
      setError(toAppError(e).message);
    }
  }

  async function updateAll() {
    if (!report) return;
    for (const u of report.updates) {
      try {
        await enqueueDownload(u.name, u.availableVersion);
      } catch (e) {
        setError(`${u.name}: ${toAppError(e).message}`);
      }
    }
    useAppStore.getState().setUpdateCount(null);
    setReport(null);
    useQueueStore.getState().open();
  }

  async function handleToggle(mod: InstalledMod, next: boolean) {
    const apply = (enabled: boolean) =>
      setSnapshot((s) =>
        s
          ? {
              ...s,
              mods: s.mods.map((m) =>
                m.fileName === mod.fileName ? { ...m, enabled } : m,
              ),
            }
          : s,
      );
    apply(next);
    try {
      await toggleMod(mod.name, next);
    } catch (e) {
      apply(!next);
      setError(toAppError(e).message);
    }
  }

  async function handleUninstall(mod: InstalledMod) {
    if (confirming !== mod.fileName) {
      arm(mod.fileName);
      // Resolve the impact while the confirm is armed so the dependents can
      // be listed in the confirm step. Best-effort: without it the confirm
      // still works, just without the warning line.
      try {
        const dependents = await uninstallImpact(mod.fileName);
        setImpactByFile((m) => ({ ...m, [mod.fileName]: dependents }));
      } catch {
        // Graceful degradation — empty impact, no error surfaced.
      }
      return;
    }
    disarm();
    setBusyFile(mod.fileName);
    try {
      // No manual refresh here: the backend emits installed-changed, which
      // triggers the (debounced) rescan.
      await uninstallMod(mod.fileName);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusyFile(null);
    }
  }

  /** Toggle accordion expansion; exactly one row at a time.
   * Lazy-fetches the portal summary on first expand. */
  function handleToggleExpand(mod: InstalledMod) {
    const next = expandedName === mod.name ? null : mod.name;
    setExpandedName(next);
    if (next) {
      fetchSummary(mod.name);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Installed"
        subtitle={
          isFactorioDetected === false
            ? "Factorio not found — set your mods folder in Settings"
            : snapshot?.modsDir ?? effectiveModsDir ?? "Scanning mods folder…"
        }
        actions={
          isFactorioDetected === false ? undefined : (
            <>
              <Button
                variant="secondary"
                onClick={() => void runCheck()}
                disabled={checking}
              >
                {checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
                Check for updates
              </Button>
              {report && report.updates.length > 0 && (
                <Button variant="primary" onClick={() => void updateAll()}>
                  Update all ({report.updates.length})
                </Button>
              )}
            </>
          )
        }
      />

      {isFactorioDetected !== false && (
        <p className="-mt-3 mb-4 text-xs text-stone-600">
          {loading
            ? "Scanning mods folder…"
            : `${mods.length} mod${mods.length === 1 ? "" : "s"} on disk`}
          {snapshot &&
            !snapshot.modListExists &&
            " · mod-list.json not found — everything counts as enabled until first toggle"}
          {report &&
            ` · ${report.updates.length} update${report.updates.length === 1 ? "" : "s"} · ${report.upToDate.length} up to date · target ${report.target}`}
          {report &&
            report.errors.length > 0 &&
            ` · ${report.errors.length} could not be checked`}
        </p>
      )}

      {report && report.errors.length > 0 && (
        <p className="mb-4 text-[11px] text-stone-600">
          {report.errors
            .slice(0, 5)
            .map(([n, r]) => `${n}: ${r}`)
            .join(" · ")}
          {report.errors.length > 5 && " …"}
        </p>
      )}

      {updateError && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-900/60 bg-amber-950/30 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">{updateError}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void runCheck()}>
            Retry
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {isFactorioDetected === false || (!loading && snapshot === null && !error) ? (
        <EmptyState
          icon={AlertTriangle}
          title="Factorio not found"
          hint="Set your mods folder in Settings to view and manage installed mods."
          action={
            <Button variant="secondary" onClick={() => setActiveTab("settings")}>
              Open Settings
            </Button>
          }
        />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-line bg-surface"
            />
          ))}
        </div>
      ) : mods.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No mods installed"
          hint="Find some on the Browse page."
        />
      ) : (
        <div className="space-y-3">
          {enabledMods.map((m) => (
            <ModRow
              key={m.fileName}
              mod={m}
              confirming={confirming === m.fileName}
              busy={busyFile === m.fileName}
              updateTo={updateByName.get(m.name) ?? null}
              expanded={expandedName === m.name}
              impact={impactByFile[m.fileName] ?? null}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              onUpdate={handleUpdate}
              onVersions={setVersionsFor}
              onToggleExpand={handleToggleExpand}
            />
          ))}

          {enabledMods.length > 0 && disabledMods.length > 0 && (
            <hr className="border-0 border-t border-line my-1" />
          )}

          {disabledMods.map((m) => (
            <ModRow
              key={m.fileName}
              mod={m}
              confirming={confirming === m.fileName}
              busy={busyFile === m.fileName}
              updateTo={updateByName.get(m.name) ?? null}
              expanded={expandedName === m.name}
              impact={impactByFile[m.fileName] ?? null}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              onUpdate={handleUpdate}
              onVersions={setVersionsFor}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </div>
      )}

      {versionsFor && (
        <VersionsModal mod={versionsFor} onClose={() => setVersionsFor(null)} />
      )}
    </div>
  );
}
