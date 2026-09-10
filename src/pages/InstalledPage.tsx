import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, History, Package, RefreshCw, Trash2 } from "lucide-react";
import Toggle from "../components/ui/Toggle";
import VersionsModal from "../components/VersionsModal";
import {
  checkUpdates,
  enqueueDownload,
  listInstalled,
  toAppError,
  toggleMod,
  uninstallMod,
} from "../lib/api";
import { onInstalledChanged, onSettingsChanged } from "../lib/events";
import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import { useThumbnails, useThumbnailUrl } from "../lib/thumbnails";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import ModTile from "../components/ui/ModTile";
import PageHeader from "../components/ui/PageHeader";
import Spinner from "../components/ui/Spinner";
import { useConfirm } from "../components/ui/useConfirm";
import type { InstalledMod, UpdatesReport } from "../types";

function ModRow({
  mod,
  confirming,
  busy,
  updateTo,
  onToggle,
  onUninstall,
  onUpdate,
  onVersions,
}: {
  mod: InstalledMod;
  confirming: boolean;
  busy: boolean;
  updateTo: string | null;
  onToggle: (mod: InstalledMod, next: boolean) => void;
  onUninstall: (mod: InstalledMod) => void;
  onUpdate: (mod: InstalledMod) => void;
  onVersions: (mod: InstalledMod) => void;
}) {
  const thumbnail = useThumbnailUrl(mod.name);

  return (
    <Card className="flex items-center gap-4 p-4">
      <ModTile name={mod.name} url={thumbnail} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-zinc-100">{mod.name}</p>
          {mod.problem && (
            <Badge tone="red" title={mod.problem}>
              problem
            </Badge>
          )}
          {updateTo && <Badge tone="green">update → v{updateTo}</Badge>}
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
          v{mod.version} · Factorio {mod.factorioVersion} ·{" "}
          {mod.dependencies.length} deps
        </p>
        {mod.problem && (
          <p className="mt-0.5 max-w-md truncate text-[11px] text-red-400" title={mod.problem}>
            {mod.problem}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
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
            label={`Enable ${mod.name}`}
          />
        </div>
      </div>
    </Card>
  );
}

export default function InstalledPage() {
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof listInstalled>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [report, setReport] = useState<UpdatesReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [versionsFor, setVersionsFor] = useState<InstalledMod | null>(null);
  const { confirming, arm, disarm } = useConfirm();

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await listInstalled());
      setError(null);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const u1 = onInstalledChanged(() => void refresh());
    const u2 = onSettingsChanged(() => {
      setLoading(true);
      void refresh();
    });
    return () => {
      void Promise.all([u1, u2]).then(([f1, f2]) => {
        f1();
        f2();
      });
    };
  }, [refresh]);

  const mods = snapshot?.mods ?? [];
  useThumbnails(mods.map((m) => m.name));

  const updateByName = useMemo(() => {
    const m = new Map<string, string>();
    report?.updates.forEach((u) => m.set(u.name, u.availableVersion));
    return m;
  }, [report]);

  async function runCheck() {
    setChecking(true);
    try {
      const r = await checkUpdates();
      setReport(r);
      useAppStore
        .getState()
        .setUpdateCount(r.updates.length > 0 ? r.updates.length : null);
    } catch (e) {
      setError(toAppError(e).message);
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
      return;
    }
    disarm();
    setBusyFile(mod.fileName);
    try {
      await uninstallMod(mod.fileName);
      await refresh();
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusyFile(null);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Package}
        title="Installed"
        subtitle={snapshot?.modsDir ?? "Scanning mods folder…"}
        actions={
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
        }
      />

      <p className="-mt-3 mb-4 text-xs text-zinc-600">
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

      {report && report.errors.length > 0 && (
        <p className="mb-4 text-[11px] text-zinc-600">
          {report.errors
            .slice(0, 5)
            .map(([n, r]) => `${n}: ${r}`)
            .join(" · ")}
          {report.errors.length > 5 && " …"}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-900/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
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
          {mods.map((m) => (
            <ModRow
              key={m.fileName}
              mod={m}
              confirming={confirming === m.fileName}
              busy={busyFile === m.fileName}
              updateTo={updateByName.get(m.name) ?? null}
              onToggle={handleToggle}
              onUninstall={handleUninstall}
              onUpdate={handleUpdate}
              onVersions={setVersionsFor}
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
