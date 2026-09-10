import { useCallback, useEffect, useMemo, useState } from "react";
import Toggle from "../components/Toggle";
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
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-900/60">
      <td className="py-2.5 pr-4">
        <p className="font-mono text-zinc-200">
          {mod.name}
          <span className="ml-2 text-[10px] text-zinc-600">{mod.dependencies.length} deps</span>
        </p>
        {mod.problem && (
          <p className="mt-0.5 max-w-md truncate text-[11px] text-red-400" title={mod.problem}>
            ⚠ {mod.problem}
          </p>
        )}
      </td>
      <td className="py-2.5 pr-4 text-zinc-400">v{mod.version}</td>
      <td className="py-2.5 pr-4">
        <span className={mod.factorioVersion === "2.0" ? "text-green-400" : "text-zinc-500"}>
          {mod.factorioVersion}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <Toggle checked={mod.enabled} onChange={(v) => onToggle(mod, v)} label={`Enable ${mod.name}`} />
      </td>
      <td className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-3">
          {updateTo && (
            <button
              onClick={() => onUpdate(mod)}
              className="text-xs font-medium text-amber-400 hover:text-amber-300"
            >
              Update → v{updateTo}
            </button>
          )}
          <button
            onClick={() => onVersions(mod)}
            className="text-xs text-zinc-500 hover:text-amber-400"
          >
            Versions
          </button>
          <button
            onClick={() => onUninstall(mod)}
            disabled={busy}
            className={
              busy
                ? "text-xs text-zinc-600"
                : confirming
                  ? "text-xs font-medium text-red-400 hover:text-red-300"
                  : "text-xs text-zinc-500 hover:text-red-400"
            }
          >
            {busy ? "Removing…" : confirming ? "Confirm remove?" : "Remove"}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function InstalledPage() {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof listInstalled>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [report, setReport] = useState<UpdatesReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [versionsFor, setVersionsFor] = useState<InstalledMod | null>(null);

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
      useAppStore.getState().setUpdateCount(r.updates.length > 0 ? r.updates.length : null);
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
      setConfirming(mod.fileName);
      window.setTimeout(
        () => setConfirming((c) => (c === mod.fileName ? null : c)),
        3000,
      );
      return;
    }
    setConfirming(null);
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

  if (loading) return <p className="text-sm text-zinc-500">Scanning mods folder…</p>;

  const mods = snapshot?.mods ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">Installed</h2>
        <p className="font-mono text-xs text-zinc-500">{snapshot?.modsDir ?? ""}</p>
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        {mods.length} mod{mods.length === 1 ? "" : "s"} on disk
        {snapshot && !snapshot.modListExists &&
          " · mod-list.json not found — everything counts as enabled until first toggle"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runCheck()}
          disabled={checking}
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check for updates"}
        </button>
        {report && report.updates.length > 0 && (
          <button
            onClick={() => void updateAll()}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-400"
          >
            Update all ({report.updates.length})
          </button>
        )}
        {report && (
          <span className="text-xs text-zinc-600">
            {report.updates.length} update{report.updates.length === 1 ? "" : "s"} ·{" "}
            {report.upToDate.length} up to date
            {report.errors.length > 0 && ` · ${report.errors.length} could not be checked`}
            {` · target ${report.target}`}
          </span>
        )}
      </div>

      {report && report.errors.length > 0 && (
        <p className="mt-2 text-[11px] text-zinc-600">
          {report.errors.slice(0, 5).map(([n, r]) => `${n}: ${r}`).join(" · ")}
          {report.errors.length > 5 && " …"}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded border border-red-900/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {mods.length === 0 ? (
        <div className="mt-16 text-center text-sm text-zinc-500">
          No mods installed.
          <br />
          <span className="text-xs text-zinc-600">Find some on the Browse tab.</span>
        </div>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4 font-medium">Mod</th>
              <th className="py-2 pr-4 font-medium">Version</th>
              <th className="py-2 pr-4 font-medium">Game</th>
              <th className="py-2 pr-4 font-medium">Enabled</th>
              <th className="py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
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
          </tbody>
        </table>
      )}

      {versionsFor && (
        <VersionsModal mod={versionsFor} onClose={() => setVersionsFor(null)} />
      )}
    </div>
  );
}
