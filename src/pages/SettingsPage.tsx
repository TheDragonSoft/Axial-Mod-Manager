import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Cpu,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  cleanOrphans,
  detectGameInstall,
  getDetectionStatus,
  getSettings,
  getStorageReport,
  setSettings,
  toAppError,
  validateGameDir,
  validateModsDir,
} from "../lib/api";
import { formatBytes } from "../lib/format";
import type {
  CleanOrphansResult,
  DetectedGame,
  GameDirStatus,
  ModsDirStatus,
  OrphanKind,
  StorageReport,
} from "../types";
import { useAppStore } from "../store/useAppStore";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SegmentedTabs from "../components/ui/SegmentedTabs";
import Select from "../components/ui/Select";
import Spinner from "../components/ui/Spinner";
import StatusDot from "../components/ui/StatusDot";
import SettingRow from "../components/ui/SettingRow";
import Toggle from "../components/ui/Toggle";
import { useConfirm } from "../components/ui/useConfirm";

type SaveState = "idle" | "saving" | "saved" | "error";
type Section = "storage" | "game" | "general";

const SOURCE_LABELS: Record<string, string> = {
  steam: "Steam",
  gog: "GOG",
  standalone: "Standalone install",
  "game-log": "Found via game log",
  custom: "Selected manually",
};

const ADOPT_LINK =
  "text-xs text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent";

/** Detected game install summary with one-click adoption of its facts. */
function GameInstallInfo({
  game,
  modsDirInput,
  onUsePortableModsDir,
}: {
  game: DetectedGame;
  modsDirInput: string;
  onUsePortableModsDir: (p: string) => void;
}) {
  const source = SOURCE_LABELS[game.source] ?? game.source;
  const { portableModsDir } = game;
  return (
    <div className="mt-1.5 space-y-1">
      <p
        className="truncate font-mono text-xs text-stone-300"
        title={game.exePath ?? game.installDir}
      >
        {game.installDir}
      </p>
      <p className="text-xs text-stone-400">
        {source}
        {game.version ? ` · game version ${game.version}` : " · version unknown"}
      </p>
      {portableModsDir && modsDirInput.trim() !== portableModsDir && (
        <button
          type="button"
          onClick={() => onUsePortableModsDir(portableModsDir)}
          className={`block ${ADOPT_LINK}`}
        >
          Use the portable mods folder inside the game installation
        </button>
      )}
    </div>
  );
}

/** Human-readable summary of a GameDirStatus, styled by severity. */
function GameDirStatusLine({
  status,
  modsDirInput,
  onUsePortableModsDir,
}: {
  status: GameDirStatus;
  modsDirInput: string;
  onUsePortableModsDir: (p: string) => void;
}) {
  if (!status.exists) {
    return <p className="mt-1.5 text-xs text-red-400">Path does not exist.</p>;
  }
  if (!status.isDir) {
    return (
      <p className="mt-1.5 text-xs text-red-400">
        Path exists but is not a directory.
      </p>
    );
  }
  if (!status.game) {
    return (
      <p className="mt-1.5 text-xs text-red-400">
        Not a Factorio installation — data/base/info.json not found in this
        folder.
      </p>
    );
  }
  return (
    <GameInstallInfo
      game={status.game}
      modsDirInput={modsDirInput}
      onUsePortableModsDir={onUsePortableModsDir}
    />
  );
}

const ORPHAN_LABELS: Record<OrphanKind, string> = {
  unreferenced_zip: "not in mod-list.json",
  missing_entry: "listed but zip missing",
  part_debris: "interrupted download",
};

/** One orphaned file/entry line in the storage panel. */
function OrphanLine({ name, kind, size }: { name: string; kind: OrphanKind; size: number }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <StatusDot tone="amber" />
      <span className="min-w-0 flex-1 truncate font-mono text-stone-300" title={name}>
        {name}
      </span>
      <span className="shrink-0 text-stone-400">{ORPHAN_LABELS[kind]}</span>
      <span className="w-16 shrink-0 text-right text-stone-400">
        {size > 0 ? formatBytes(size) : "—"}
      </span>
    </li>
  );
}

/** Human-readable summary of a ModsDirStatus, styled by severity. */
function DirStatusLine({ status }: { status: ModsDirStatus }) {
  let tone = "text-stone-400";
  let text: string;

  if (status.exists && !status.isDir) {
    tone = "text-red-400";
    text = "Path exists but is not a directory.";
  } else if (status.exists && !status.writable) {
    tone = "text-red-400";
    text = "Directory is not writable by this app.";
  } else if (status.exists) {
    tone = "text-accent";
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
  const effectiveModsDir = useAppStore((s) => s.effectiveModsDir);
  const settingsSection = useAppStore((s) => s.settingsSection);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  // Deep-linkable: the store keeps the last-open section so other pages
  // (Dashboard storage card) can land straight on Storage.
  const [section, setSection] = useState<Section>(settingsSection);
  // Deep-links that arrive while Settings is already mounted (command palette).
  // Internal switches go through switchSection, which keeps the store in sync,
  // so this only ever reacts to external writes.
  useEffect(() => {
    setSection(settingsSection);
  }, [settingsSection]);
  const [modsDirInput, setModsDirInput] = useState("");
  const [gameDirInput, setGameDirInput] = useState("");
  const [logLevel, setLogLevel] = useState("info");
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<ModsDirStatus | null>(null);
  const [gameStatus, setGameStatus] = useState<GameDirStatus | null>(null);
  const [gameDirWasAutoDetected, setGameDirWasAutoDetected] = useState(false);
  const [scanningGame, setScanningGame] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [storageReport, setStorageReport] = useState<StorageReport | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<CleanOrphansResult | null>(null);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const orphanConfirm = useConfirm();

  function switchSection(next: Section) {
    setSection(next);
    setSettingsSection(next);
  }

  async function refreshStorage(path: string) {
    const probePath = path.trim() || useAppStore.getState().effectiveModsDir;
    if (!probePath) {
      setStorageReport(null);
      return;
    }
    try {
      setStorageReport(await getStorageReport(probePath));
    } catch {
      setStorageReport(null);
    }
  }

  async function refreshStatus(path: string) {
    const trimmed = path.trim();
    const probePath = trimmed || useAppStore.getState().effectiveModsDir;
    if (!probePath) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await validateModsDir(probePath));
    } catch {
      setStatus(null);
    }
    // Same trigger points as the dir probe: the storage report rides along.
    void refreshStorage(probePath);
  }

  async function refreshGameStatus(path: string) {
    const trimmed = path.trim();
    if (!trimmed) {
      setGameStatus(null);
      return;
    }
    try {
      setGameStatus(await validateGameDir(trimmed));
    } catch {
      setGameStatus(null);
    }
  }

  async function scanForGame() {
    setScanningGame(true);
    try {
      const detected = await detectGameInstall();
      if (detected) {
        setGameDirInput(detected.installDir);
        setGameDirWasAutoDetected(true);
        setGameStatus({
          path: detected.installDir,
          exists: true,
          isDir: true,
          game: detected,
        });
      } else {
        setGameStatus(null);
      }
    } catch {
      setGameStatus(null);
    } finally {
      setScanningGame(false);
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

  async function handleGameBrowse() {
    const path = await openDialog({
      directory: true,
      title: "Select your Factorio installation folder",
    });
    if (typeof path === "string" && path) {
      setGameDirInput(path);
      markDirty();
      void refreshGameStatus(path);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await getSettings();
        setLogLevel(s.logLevel ?? "info");
        setCheckForUpdates(s.checkForUpdates ?? true);
        setDismissedUpdateVersion(s.dismissedUpdateVersion ?? null);
        if (s.modsDir) {
          setModsDirInput(s.modsDir);
          await refreshStatus(s.modsDir);
        } else {
          setModsDirInput("");
          const det = await getDetectionStatus();
          useAppStore.getState().setDetectionStatus(det);
          if (det.effectiveModsDir) {
            await refreshStatus(det.effectiveModsDir);
          }
        }
        if (s.gameDir) {
          setGameDirInput(s.gameDir);
          setScanningGame(false);
          await refreshGameStatus(s.gameDir);
        } else {
          await scanForGame();
        }
      } catch (e) {
        setLoadError(toAppError(e).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function markDirty() {
    setGameDirWasAutoDetected(false);
    setSaveState("idle");
    setSaveError(null);
  }

  /** Two-step destructive confirm: first click arms, second click cleans. */
  async function handleCleanOrphans() {
    const id = "orphans";
    if (orphanConfirm.confirming !== id) {
      orphanConfirm.arm(id);
      return;
    }
    orphanConfirm.disarm();
    const path = (modsDirInput.trim() || effectiveModsDir || "").trim();
    if (!path) return;
    setCleaning(true);
    setCleanResult(null);
    setCleanError(null);
    try {
      const r = await cleanOrphans(path);
      setCleanResult(r);
      await refreshStorage(path);
    } catch (e) {
      setCleanError(toAppError(e).message);
    } finally {
      setCleaning(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = modsDirInput.trim();
    const gameDir = gameDirInput.trim();
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

      // Same gate for the game folder: saving a non-install would silently
      // break version detection.
      if (gameDir) {
        const gst = await validateGameDir(gameDir);
        setGameStatus(gst);
        if (!gst.game) {
          setSaveState("error");
          setSaveError(
            !gst.exists
              ? "That path does not exist."
              : gst.isDir
                ? "That folder is not a Factorio installation — data/base/info.json not found."
                : "That path is not a directory.",
          );
          return;
        }
      }

      // Empty inputs ⇒ save as null (= auto-detect on next launch).
      await setSettings({
        modsDir: trimmed || null,
        gameDir: gameDir || null,
        targetFactorioVersion: useAppStore.getState().targetFactorioVersion ?? "2.0",
        logLevel,
        activePackId: useAppStore.getState().activePackId,
        checkForUpdates,
        dismissedUpdateVersion,
      });
      setGameDirWasAutoDetected(false);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(toAppError(err).message);
    }
  }

  if (loading)
    return (
      <div>
        <PageHeader
          icon={SettingsIcon}
          title="Settings"
          subtitle="Configure Axial and your Factorio integration"
        />
        <p className="flex items-center gap-2 text-sm text-stone-400">
          <Spinner /> Loading…
        </p>
      </div>
    );
  if (loadError)
    return (
      <div>
        <PageHeader
          icon={SettingsIcon}
          title="Settings"
          subtitle="Configure Axial and your Factorio integration"
        />
        <p className="text-sm text-red-400">Error: {loadError}</p>
      </div>
    );

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Configure Axial and your Factorio integration"
      />

      <form onSubmit={handleSave}>
        <SegmentedTabs
          tabs={[
            { id: "storage", label: "Storage", icon: HardDrive },
            { id: "game", label: "Game Install", icon: Cpu },
            { id: "general", label: "General", icon: SlidersHorizontal },
          ]}
          active={section}
          onChange={switchSection}
          className="mb-4"
        />

        <div className="max-w-2xl">
          {section === "storage" && (
            <div className="space-y-4">
            <Panel flat icon={HardDrive} title="Mods directory" subtitle="Where mod zips are downloaded and enabled">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium tracking-wide text-stone-400 uppercase">
                  Mods directory
                </span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={modsDirInput}
                    onChange={(e) => {
                      setModsDirInput(e.target.value);
                      markDirty();
                    }}
                    onBlur={() => refreshStatus(modsDirInput)}
                    placeholder="Leave empty to auto-detect on launch"
                    className="font-mono"
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleBrowse()}
                    className="shrink-0"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Browse…
                  </Button>
                </div>
              </label>
              {!modsDirInput.trim() ? (
                effectiveModsDir ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-stone-400">
                      Active: <span className="font-mono text-stone-200">{effectiveModsDir}</span>{" "}
                      <span className="text-accent">(auto-detected)</span>
                    </p>
                    {status && <DirStatusLine status={status} />}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-400">
                    No mods folder detected — set your Factorio mods directory above or leave empty to auto-detect when Factorio is installed.
                  </p>
                )
              ) : (
                status && <DirStatusLine status={status} />
              )}
            </Panel>

            <Panel
              flat
              icon={Trash2}
              iconTone="orange"
              title="Storage usage"
              subtitle="Disk space and orphaned files"
            >
              {storageReport ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-line bg-surface-2 p-3">
                      <p className="text-lg font-bold text-stone-200">
                        {formatBytes(storageReport.totalSizeBytes)}
                      </p>
                      <p className="text-xs text-stone-400">
                        {storageReport.zipCount} mod zip
                        {storageReport.zipCount === 1 ? "" : "s"} on disk
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-surface-2 p-3">
                      <p
                        className={`flex items-center gap-1.5 text-lg font-bold ${
                          storageReport.orphans.length > 0
                            ? "text-amber-400"
                            : "text-stone-200"
                        }`}
                      >
                        {storageReport.orphans.length}
                      </p>
                      <p className="text-xs text-stone-400">
                        {storageReport.orphans.length === 0
                          ? "no orphans"
                          : `orphans · ${formatBytes(storageReport.orphanSizeBytes)} reclaimable`}
                      </p>
                    </div>
                  </div>

                  {storageReport.orphans.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium tracking-wide text-stone-400 uppercase">
                        Orphans
                      </p>
                      <ul className="space-y-1.5">
                        {storageReport.orphans.slice(0, 6).map((o) => (
                          <OrphanLine
                            key={`${o.kind}-${o.fileName ?? o.modName ?? ""}`}
                            name={o.fileName ?? o.modName ?? "?"}
                            kind={o.kind}
                            size={o.sizeBytes}
                          />
                        ))}
                      </ul>
                      {storageReport.orphans.length > 6 && (
                        <p className="mt-1.5 text-xs text-stone-400">
                          +{storageReport.orphans.length - 6} more
                        </p>
                      )}
                    </div>
                  )}

                  {storageReport.perMod.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium tracking-wide text-stone-400 uppercase">
                        Largest mods
                      </p>
                      <ul className="space-y-1.5">
                        {storageReport.perMod.slice(0, 5).map((m) => (
                          <li
                            key={m.name}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-stone-300">
                              {m.name}
                            </span>
                            <span className="shrink-0 text-stone-400">
                              {m.fileCount} zip{m.fileCount === 1 ? "" : "s"}
                            </span>
                            <span className="w-16 shrink-0 text-right text-stone-400">
                              {formatBytes(m.sizeBytes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 text-xs">
                      {cleanError ? (
                        <span className="text-red-400">{cleanError}</span>
                      ) : cleanResult ? (
                        cleanResult.errors.length > 0 ? (
                          <span className="text-amber-400">
                            {cleanResult.deletedCount} deleted ·{" "}
                            {cleanResult.errors.length} failed
                          </span>
                        ) : (
                          <span className="text-accent">
                            Deleted {cleanResult.deletedCount} file
                            {cleanResult.deletedCount === 1 ? "" : "s"} ·{" "}
                            {formatBytes(cleanResult.freedBytes)} freed
                          </span>
                        )
                      ) : (
                        <span className="text-stone-400">
                          Only files not referenced by mod-list.json are ever
                          deleted.
                        </span>
                      )}
                    </p>
                    <Button
                      variant={
                        orphanConfirm.confirming === "orphans" ? "danger" : "secondary"
                      }
                      size="sm"
                      onClick={() => void handleCleanOrphans()}
                      disabled={cleaning}
                      className="shrink-0"
                    >
                      {cleaning ? (
                        <>
                          <Spinner className="text-stone-400" /> Cleaning…
                        </>
                      ) : orphanConfirm.confirming === "orphans" ? (
                        "Confirm clean"
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" /> Clean orphans…
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-stone-400">
                  No mods folder detected — storage usage shows once a mods
                  directory is set or auto-detected.
                </p>
              )}
            </Panel>
            </div>
          )}

          {section === "game" && (
            <Panel flat icon={Cpu} title="Factorio installation" subtitle="Used for install detection and the game version">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium tracking-wide text-stone-400 uppercase">
                  Installation folder
                </span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={gameDirInput}
                    onChange={(e) => {
                      setGameDirInput(e.target.value);
                      markDirty();
                    }}
                    onBlur={() => void refreshGameStatus(gameDirInput)}
                    placeholder="Leave empty to auto-detect on launch"
                    className="font-mono"
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void handleGameBrowse()}
                    className="shrink-0"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Browse…
                  </Button>
                </div>
              </label>
              {scanningGame ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-400">
                  <Spinner /> Scanning…
                </p>
              ) : gameDirInput.trim() ? (
                gameStatus && (
                  <GameDirStatusLine
                    status={gameStatus}
                    modsDirInput={modsDirInput}
                    onUsePortableModsDir={(p) => {
                      setModsDirInput(p);
                      markDirty();
                      void refreshStatus(p);
                    }}
                  />
                )
              ) : (
                <div className="mt-1.5">
                  <p className="text-xs text-stone-400">
                    No Factorio installation detected — browse to the game
                    folder, or leave empty to keep auto-detecting.
                  </p>
                  <button
                    type="button"
                    onClick={() => void scanForGame()}
                    className={`mt-1 inline-flex items-center gap-1 ${ADOPT_LINK}`}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Scan again
                  </button>
                </div>
              )}
              {gameDirWasAutoDetected && (
                <p className="mt-1 text-xs text-accent/80">
                  Auto-detected — click Save to keep it.
                </p>
              )}
            </Panel>
          )}

          {section === "general" && (
            <div className="space-y-4">
              <Panel flat icon={RefreshCw} title="Updates" subtitle="Automatic application updates">
                <SettingRow
                  flat
                  title="Check for updates automatically"
                  description="Check for new Axial releases on startup and notify when an update is available."
                >
                  <Toggle
                    checked={checkForUpdates}
                    onChange={(val) => {
                      setCheckForUpdates(val);
                      markDirty();
                    }}
                    label="Check for updates automatically"
                  />
                </SettingRow>
              </Panel>

              <Panel flat icon={SlidersHorizontal} title="Logging" subtitle="File log verbosity">
                <SettingRow
                  flat
                  title="Log level (file log)"
                  description="Written to app-data/logs/axial.log — level applies after restart."
                >
                  <Select
                    value={logLevel}
                    onChange={(e) => {
                      setLogLevel(e.target.value);
                      markDirty();
                    }}
                    className="w-40"
                  >
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </Select>
                </SettingRow>
              </Panel>
            </div>
          )}

          {/* Save bar */}
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4">
            <Button variant="primary" type="submit" disabled={saveState === "saving"}>
              {saveState === "saving" ? (
                <>
                  <Spinner className="text-stone-400" /> Saving…
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
            {saveState === "saved" && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {saveState === "error" && saveError && (
              <span className="text-xs text-red-400">{saveError}</span>
            )}
            <span className="ml-auto text-xs text-stone-400">
              Paths are validated before anything is saved.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
