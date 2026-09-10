import { useEffect, useState } from "react";
import Toggle from "../components/Toggle";
import { getSettings } from "../lib/api";
import { onSettingsChanged } from "../lib/events";
import { MOCK_INSTALLED } from "../mock";
import type { InstalledMod } from "../types";

export default function InstalledPage() {
  const [mods, setMods] = useState<InstalledMod[]>(MOCK_INSTALLED);
  const [modsDir, setModsDir] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch + live updates whenever settings are saved elsewhere.
    getSettings()
      .then((s) => setModsDir(s.modsDir))
      .catch(() => setModsDir(null));

    const unlisten = onSettingsChanged((s) => setModsDir(s.modsDir));
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Local state only — replaced by toggle_mod/uninstall_mod commands in Phase 6.
  const toggle = (name: string, enabled: boolean) =>
    setMods((prev) => prev.map((m) => (m.name === name ? { ...m, enabled } : m)));

  const remove = (name: string) =>
    setMods((prev) => prev.filter((m) => m.name !== name));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-100">Installed</h2>
        <p className="font-mono text-xs text-zinc-500">
          {modsDir ?? "mods path — not set (configure it in Settings)"}
        </p>
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        Mock data — the real mods folder is scanned in Phase 6.
      </p>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Version</th>
            <th className="py-2 pr-4 font-medium">Game</th>
            <th className="py-2 pr-4 font-medium">Enabled</th>
            <th className="py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mods.map((m) => (
            <tr key={m.name} className="border-b border-zinc-800/60 hover:bg-zinc-900/60">
              <td className="py-2.5 pr-4 font-mono text-zinc-200">{m.name}</td>
              <td className="py-2.5 pr-4 text-zinc-400">v{m.version}</td>
              <td className="py-2.5 pr-4">
                <span
                  className={
                    m.factorioVersion === "2.0" ? "text-green-400" : "text-zinc-500"
                  }
                >
                  {m.factorioVersion}
                </span>
              </td>
              <td className="py-2.5 pr-4">
                <Toggle
                  checked={m.enabled}
                  onChange={(v) => toggle(m.name, v)}
                  label={`Enable ${m.name}`}
                />
              </td>
              <td className="py-2.5 text-right">
                <button
                  onClick={() => remove(m.name)}
                  className="text-xs text-zinc-500 hover:text-red-400"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
