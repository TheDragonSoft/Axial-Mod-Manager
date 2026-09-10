import { useEffect, useState } from "react";
import { getSettings, toAppError } from "../lib/api";
import type { Settings } from "../types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => setError(toAppError(e).message));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
      {error && <p className="mt-4 text-sm text-red-400">Error: {error}</p>}
      {!error && settings === null && <p className="mt-4 text-sm text-zinc-500">Loading…</p>}
      {settings && (
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-zinc-500">Mods directory</dt>
            <dd className="font-mono text-zinc-200">
              {settings.modsDir ?? "not set (auto-detect arrives in Phase 3)"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Target Factorio version</dt>
            <dd className="font-mono text-zinc-200">{settings.targetFactorioVersion}</dd>
          </div>
        </dl>
      )}
      <p className="mt-6 text-xs text-zinc-600">Editing UI arrives in Phase 3.</p>
    </div>
  );
}
