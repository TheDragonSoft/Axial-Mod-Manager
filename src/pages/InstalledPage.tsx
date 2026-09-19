import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpCircle,
  ChevronRight,
  History,
  Info,
  Package,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Toggle from "../components/ui/Toggle";
import VersionsModal from "../components/VersionsModal";
import {
  checkUpdates,
  enqueueDownload,
  getPack,
  isNetworkOrHttpError,
  listInstalled,
  toAppError,
  toggleMod,
  uninstallImpact,
  uninstallMod,
  VANILLA_EXPANSION_PACK_ID,
  VANILLA_PACK_ID,
} from "../lib/api";
import { onInstalledChanged, onSettingsChanged } from "../lib/events";
import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnails, useThumbnailUrl } from "../lib/thumbnails";
import { fetchSummary, useSummary } from "../lib/summaries";
import { fetchChangelog, useChangelog } from "../lib/changelog";
import { compareVersions } from "../lib/format";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ChangelogView from "../components/ChangelogView";
import EmptyState from "../components/ui/EmptyState";
import ModTile from "../components/ui/ModTile";
import PageHeader from "../components/ui/PageHeader";
import Spinner from "../components/ui/Spinner";
import { useConfirm } from "../components/ui/useConfirm";
import type { InstalledMod, UpdatesReport } from "../types";

/** Reusable Intl.Collator avoids instantiating collator options on every comparison (~50x faster sorting). */
const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });

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
  const changelog = useChangelog(mod.name);
  /** Changelog entries newer than the installed version — only meaningful
   * while `updateTo` is set (up-to-date rows never fetch the changelog). */
  const changelogDelta =
    changelog !== undefined && changelog !== null
      ? changelog.filter((e) => compareVersions(e.version, mod.version) > 0)
      : null;

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
          className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
            mod.enabled ? "text-stone-400" : "text-stone-400"
          } ${expanded ? "rotate-90" : ""}`}
        />

        <ModTile name={mod.name} url={thumbnail} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`truncate font-medium ${
                mod.enabled ? "text-stone-100" : "text-stone-400"
              }`}
              title={mod.name}
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
              className="mt-0.5 truncate font-mono text-xs text-stone-400"
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUpdate(mod)}
              aria-label={`Update ${mod.name} to v${updateTo}`}
            >
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
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line bg-surface-2/30 px-4 py-3">
            {/* Secondary facts moved here when expanded */}
            <p
              className="mb-2 font-mono text-xs text-stone-400"
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
              <p className="text-xs italic text-stone-400">Description unavailable</p>
            ) : (
              <p
                className={`max-w-xl text-sm leading-relaxed ${
                  mod.enabled ? "text-stone-300" : "text-stone-400"
                }`}
              >
                {summary}
              </p>
            )}

            {/* Changelog delta for the pending update (A3): everything newer
                than the installed version. Offline/error degrades to a muted
                inline note — never a toast. */}
            {updateTo && (
              <div className="mt-3 border-t border-line pt-2.5">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-stone-400">
                  What's new since v{mod.version}
                </p>
                {changelog === undefined ? (
                  <div className="space-y-1.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-stone-800" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-stone-800" />
                  </div>
                ) : changelog === null || changelogDelta === null ? (
                  <p className="text-xs italic text-stone-400">Changelog unavailable</p>
                ) : changelogDelta.length === 0 ? (
                  <p className="text-xs italic text-stone-400">No changelog entries</p>
                ) : (
                  <div className="max-w-xl">
                    <ChangelogView entries={changelogDelta} />
                  </div>
                )}
              </div>
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
          : "text-stone-400"
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

  /** External-change hint: an outside-the-app mods-dir edit while a pack is
   * active may have desynced disk from the pack's target state. */
  const [externalChange, setExternalChange] = useState(false);
  const [activePackName, setActivePackName] = useState<string | null>(null);
  const activePackId = useAppStore((s) => s.activePackId);

  /** Resolve the active pack's display name (built-in pseudo-packs have no
   * manifest to read); a pack switch invalidates any pending hint. */
  useEffect(() => {
    setExternalChange(false);
    if (activePackId === null) {
      setActivePackName(null);
      return;
    }
    if (activePackId === VANILLA_PACK_ID) {
      setActivePackName("Vanilla");
      return;
    }
    if (activePackId === VANILLA_EXPANSION_PACK_ID) {
      setActivePackName("Vanilla: Space Age");
      return;
    }
    let cancelled = false;
    getPack(activePackId)
      .then((p) => {
        if (!cancelled) setActivePackName(p.name);
      })
      .catch(() => {
        // Pack may have been deleted since; the id is still a usable label.
        if (!cancelled) setActivePackName(activePackId);
      });
    return () => {
      cancelled = true;
    };
  }, [activePackId]);

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
    const u1 = onInstalledChanged((payload) => {
      scheduleRefresh();
      if (payload.reason === "external") {
        // Only interesting while a pack defines the expected state.
        if (useAppStore.getState().activePackId !== null) {
          setExternalChange(true);
        }
      } else {
        // Axial's own write means the user is managing state here again.
        setExternalChange(false);
      }
    });
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
      nameCollator.compare(a.name, b.name) || a.name.localeCompare(b.name);
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
   * Lazy-fetches the portal summary on first expand (and the changelog
   * delta, but only for rows that actually have an update). */
  function handleToggleExpand(mod: InstalledMod) {
    const next = expandedName === mod.name ? null : mod.name;
    setExpandedName(next);
    if (next) {
      fetchSummary(mod.name);
      if (updateByName.get(mod.name)) {
        fetchChangelog(mod.name);
      }
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
        <p className="-mt-3 mb-4 text-xs text-stone-400">
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
        <p className="mb-4 text-[11px] text-stone-400">
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

      {/* Muted inline hint (deliberately not a modal): the game or the user
       * changed the mods dir outside Axial while a pack is active. */}
      {externalChange && activePackName !== null && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface-2/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <p className="text-xs text-stone-400">
              Mods changed outside Axial — state may differ from pack{" "}
              {activePackName}.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExternalChange(false)}
            aria-label="Dismiss external change notice"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
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
