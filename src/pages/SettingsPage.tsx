import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  detectModsDir,
  getSettings,
  setSettings,
  toAppError,
  validateModsDir,
} from "../lib/api";
import type { ModsDirStatus } from "../types";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Human-readable summary of a ModsDirStatus, styled by severity. */
function DirStatusLine({ status }: { status: ModsDirStatus }) {
  let tone = "text-zinc-500";
  let text: string;

  if (status.exists && !status.isDir) {
    tone = "text-red-400";
    text = "Path exists but is not a directory.";
  } else if (status.exists && !status.writable) {
    tone = "text-red-400";
    text = "Directory is not writable by this app.";
  } else if (status.exists) {
    tone = "text-green-400";
    text = `Writable directory · ${status.zipCount} zip${status.zipCount === 1 ? "" : "s"} found` +
      (status.hasModList ? " · mod-list.json present ✓" : "");
  } else if (status.creatable) {
    tone = "text-amber-400";
    text = "Does not exist yet — it will be created on the first download.";
  } else {
    tone = "text-red-400";
    text = "Cannot be created — parent directory is not writable.";
  }

  return <p className={`mt-1.5 text-xs ${tone}`}>{text}</p>;
}

export default function SettingsPage() {
  const [modsDirInput, setModsDirInput] = useState("");
  const [gameVersion, setGameVersion] = useState("2.0");
  const [logLevel, setLogLevel] = useState("info");
  const [status, setStatus] = useState<ModsDirStatus | null>(null);
  const [wasAutoDetected, setWasAutoDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  async function refreshStatus(path: string) {
    const trimmed = path.trim();
    if (!trimmed) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await validateModsDir(trimmed));
    } catch {
      setStatus(null);
    }
  }

  async function handleBrowse() {
    const path = await openDialog({
      directory: true,
      title: "Select your Factorio mods directory",
    });
    if (typeof path === "string" && path) {
      setModsDirInput(path);
      markDirty();
      void refreshStatus(path);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setGameVersion(s.targetFactorioVersion);
        setLogLevel(s.logLevel ?? "info");
        if (s.modsDir) {
          setModsDirInput(s.modsDir);
          await refreshStatus(s.modsDir);
        } else {
          // Nothing saved yet: offer the platform default as a prefill.
          const detected = await detectModsDir();
          if (detected) {
            setModsDirInput(detected.path);
            setWasAutoDetected(true);
            await refreshStatus(detected.path);
          }
        }
      } catch (e) {
        setLoadError(toAppError(e).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function markDirty() {
    setWasAutoDetected(false);
    setSaveState("idle");
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = modsDirInput.trim();
    setSaveState("saving");
    setSaveError(null);

    try {
      if (trimmed) {
        // Block obviously-unusable paths before persisting.
        const st = await validateModsDir(trimmed);
        setStatus(st);
        const usable = st.exists ? st.isDir && st.writable : st.creatable;
        if (!usable) {
          setSaveState("error");
          setSaveError(
            st.exists && !st.isDir
              ? "That path is not a directory."
              : st.exists
                ? "That directory is not writable."
                : "That path cannot be created (check parent permissions).",
          );
          return;
        }
      }

      // Empty input ⇒ save as null (= auto-detect on next launch).
      await setSettings({
        modsDir: trimmed || null,
        targetFactorioVersion: gameVersion,
        logLevel,
      });
      setWasAutoDetected(false);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(toAppError(err).message);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (loadError) return <p className="text-sm text-red-400">Error: {loadError}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>

      <form className="mt-6 max-w-lg space-y-5" onSubmit={handleSave}>
        <div>
          <label
            htmlFor="mods-dir"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Mods directory
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="mods-dir"
              type="text"
              value={modsDirInput}
              onChange={(e) => {
                setModsDirInput(e.target.value);
                markDirty();
              }}
              onBlur={() => refreshStatus(modsDirInput)}
              placeholder="Leave empty to auto-detect on launch"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={() => void handleBrowse()}
              className="shrink-0 rounded border border-zinc-700 px-3 text-sm text-zinc-300 hover:border-amber-500 hover:text-amber-400"
            >
              Browse…
            </button>
          </div>
          {status && <DirStatusLine status={status} />}
          {wasAutoDetected && (
            <p className="mt-1 text-xs text-amber-500/80">
              Auto-detected — click Save to keep it.
            </p>
          )}
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
            onChange={(e) => {
              setGameVersion(e.target.value);
              markDirty();
            }}
            className="mt-1.5 w-40 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
          >
            <option value="2.1">2.1</option>
            <option value="2.0">2.0</option>
            <option value="1.1">1.1</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Used to tag mods as compatible/incompatible (Phase 4+).
          </p>
        </div>

        <div>
          <label
            htmlFor="log-level"
            className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
          >
            Log level (file log)
          </label>
          <select
            id="log-level"
            value={logLevel}
            onChange={(e) => {
              setLogLevel(e.target.value);
              markDirty();
            }}
            className="mt-1.5 w-40 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500"
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Written to app-data/logs/axial.log — level applies after restart.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saveState === "saving"}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
          {saveState === "saved" && (
            <span className="text-xs text-green-400">Saved ✓</span>
          )}
          {saveState === "error" && saveError && (
            <span className="text-xs text-red-400">{saveError}</span>
          )}
        </div>
      </form>
    </div>
  );
}
