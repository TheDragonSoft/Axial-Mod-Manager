import { useEffect, useState } from "react";
import { getSettings, toAppError } from "../lib/api";

export default function SettingsPage() {
  const [modsDir, setModsDir] = useState("");
  const [gameVersion, setGameVersion] = useState("2.0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(false);

  // Real backend call — pre-fills the form from settings.json state.
  useEffect(() => {
    getSettings()
      .then((s) => {
        setModsDir(s.modsDir ?? "");
        setGameVersion(s.targetFactorioVersion);
      })
      .catch((e) => setError(toAppError(e).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-400">Error: {error}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
      <p className="mt-2 text-xs text-zinc-600">
        Persistence is wired in Phase 3 — this form is visual-only for now.
      </p>

      <form
        className="mt-6 max-w-lg space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setHint(true);
        }}
      >
        <div>
          <label
            htmlFor="mods-dir"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Mods directory
          </label>
          <input
            id="mods-dir"
            type="text"
            value={modsDir}
            onChange={(e) => setModsDir(e.target.value)}
            placeholder="Auto-detected in Phase 3"
            className="mt-1.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label
            htmlFor="game-version"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Target Factorio version
          </label>
          <select
            id="game-version"
            value={gameVersion}
            onChange={(e) => setGameVersion(e.target.value)}
            className="mt-1.5 w-40 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
          >
            <option value="2.0">2.0</option>
            <option value="1.1">1.1</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
          >
            Save
          </button>
          {hint && (
            <span className="text-xs text-amber-500/80">
              Save is stubbed — wiring in Phase 3.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
