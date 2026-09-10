import { useCallback, useEffect, useState } from "react";
import Toggle from "../components/Toggle";
import { listInstalled, toAppError, toggleMod, uninstallMod } from "../lib/api";
import { onInstalledChanged, onSettingsChanged } from "../lib/events";
import type { InstalledMod } from "../types";

function ModRow({
  mod,
  confirming,
  busy,
  onToggle,
  onUninstall,
}: {
  mod: InstalledMod;
  confirming: boolean;
  busy: boolean;
  onToggle: (mod: InstalledMod, next: boolean) => void;
  onUninstall: (mod: InstalledMod) => void;
}) {
  return (
    <tr className="border-b border-zinc-800/60 hover:bg-zinc-900/60">
      <td className="py-2.5 pr-4">
        <p className="font-mono text-zinc-200">
          {mod.name}
          <span className="ml-2 text-[10px] text-zinc-600">
            {mod.dependencies.length} deps
          </span>
        </p>
        {mod.problem && (
          <p className="mt-0.5 max-w-md truncate text-[11px] text-red-400" title={mod.problem}>
            ⚠ {mod.problem}
          </p>
        )}
      </td>
      <td className="py-2.5 pr-4 text-zinc-400">v{mod.version}</td>
      <td className="py-2.5 pr-4">
        <span
          className={mod.factorioVersion === "2.0" ? "text-green-400" : "text-zinc-500"}
        >
          {mod.factorioVersion}
        </span>
      </td>
      <td className="py-2.5 pr-4">
        <Toggle
          checked={mod.enabled}
          onChange={(v) => onToggle(mod, v)}
          label={`Enable ${mod.name}`}
        />
      </td>
      <td className="py-2.5 text-right">
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

  // Re-scan whenever the backend touches the folder or settings are saved.
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

  async function handleToggle(mod: InstalledMod, next: boolean) {
    // Optimistic update; roll back if the backend refuses.
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
    // Two-step inline confirm (native confirm() is unreliable in Tauri webviews).
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
                onToggle={handleToggle}
                onUninstall={handleUninstall}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
