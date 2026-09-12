import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { clsx } from "clsx";
import logoSvg from "../assets/logo.svg";
import {
  Boxes,
  Compass,
  Download,
  Leaf,
  LayoutDashboard,
  Package,
  Play,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAppStore, type Tab } from "../store/useAppStore";
import {
  useQueueStore,
  selectActiveCount,
  selectFailedCount,
} from "../store/useQueueStore";
import { useActivityStore } from "../store/useActivityStore";
import {
  launchGame,
  listPacks,
  toAppError,
} from "../lib/api";
import type { PackMeta } from "../types";
import type { BridgeStatus } from "../App";
import Button from "./ui/Button";
import Spinner from "./ui/Spinner";
import StatusDot from "./ui/StatusDot";
import PackModal from "./packs/PackModal";

const NAV: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "browse", label: "Browse", icon: Compass },
  { id: "installed", label: "Installed", icon: Package },
  { id: "packs", label: "Packs", icon: Boxes },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function Badge({ count, tone }: { count: number; tone: "green" | "red" }) {
  return (
    <span
      className={clsx(
        "flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold",
        tone === "green" ? "bg-accent text-stone-950" : "bg-red-500 text-stone-950",
      )}
    >
      {count}
    </span>
  );
}

export default function Sidebar({
  bridgeStatus,
}: {
  bridgeStatus: BridgeStatus;
}) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const updateCount = useAppStore((s) => s.updateCount);
  const packsVersion = useAppStore((s) => s.packsVersion);
  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const queueToggle = useQueueStore((s) => s.toggle);
  const activeDownloads = useQueueStore(selectActiveCount);
  const failedDownloads = useQueueStore(selectFailedCount);

  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const detectedGame = useAppStore((s) => s.detectedGame);
  const hasGame = detectedGame !== null;
  const [launching, setLaunching] = useState<boolean>(false);

  async function handleLaunchGame() {
    if (!hasGame || launching) return;
    setLaunching(true);
    try {
      await launchGame();
      useActivityStore
        .getState()
        .push("game-launched", "Factorio", "Game launched");
    } catch (e) {
      console.error("Failed to launch Factorio:", toAppError(e).message);
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => {
    listPacks()
      .then(setPacks)
      .catch(() => setPacks([]));
  }, [packsVersion]);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  function handleVanillaClick() {
    setSelectedPackId("vanilla");
  }

  function handlePackClick(p: PackMeta) {
    setSelectedPackId(p.id);
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <img
          src={logoSvg}
          alt="Axial"
          className="h-8 w-8 shrink-0 select-none rounded-lg"
        />
        <div className="leading-tight">
          <p className="text-sm font-bold text-stone-200">Axial</p>
          <p className="text-[10px] text-stone-600">Factorio Mod Manager</p>
        </div>
      </div>

      {/* Launch Factorio */}
      <div
        className="px-3 pb-4"
        title={!hasGame ? "Factorio not found — set the game folder in Settings" : undefined}
      >
        <Button
          variant="primary"
          className="w-full justify-center"
          disabled={!hasGame || launching}
          title={!hasGame ? "Factorio not found — set the game folder in Settings" : undefined}
          onClick={handleLaunchGame}
        >
          {launching ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          <span>Launch Factorio</span>
        </Button>
      </div>

      {/* Navigation */}
      <p className="px-5 pb-1 text-[10px] font-semibold tracking-widest text-stone-600 uppercase">
        Navigation
      </p>
      <nav className="space-y-1 px-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                isActive
                  ? "bg-surface-2 text-stone-200"
                  : "text-stone-400 hover:bg-surface-2/60 hover:text-stone-100",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {id === "installed" &&
                updateCount !== null &&
                updateCount > 0 && <Badge count={updateCount} tone="green" />}
            </button>
          );
        })}
        {/* Downloads: opens the queue drawer, not a page. */}
        <button
          onClick={queueToggle}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-400 transition-colors hover:bg-surface-2/60 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Downloads</span>
          {failedDownloads > 0 ? (
            <Badge count={failedDownloads} tone="red" />
          ) : (
            activeDownloads > 0 && <Badge count={activeDownloads} tone="green" />
          )}
        </button>
      </nav>

      {/* Quick Access: Vanilla always first, then user packs */}
      <p className="px-5 pt-5 pb-1 text-[10px] font-semibold tracking-widest text-stone-600 uppercase">
        Quick Access
      </p>
      <div className="space-y-0.5 overflow-y-auto px-3 pb-2">
        {/* Vanilla — pinned first */}
        <button
          onClick={handleVanillaClick}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-400 transition-colors hover:bg-surface-2/60 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <StatusDot
            tone={activePackId === "vanilla" ? "green" : activatingPackId === "vanilla" ? "amber" : "zinc"}
            pulse={activatingPackId === "vanilla"}
          />
          <Leaf className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Vanilla</span>
        </button>
        {/* User packs */}
        {packs.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePackClick(p)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-400 transition-colors hover:bg-surface-2/60 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <StatusDot
              tone={activePackId === p.id ? "green" : activatingPackId === p.id ? "amber" : "zinc"}
              pulse={activatingPackId === p.id}
            />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>

      {/* Footer: backend bridge + version */}
      <div className="mt-auto border-t border-line px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <StatusDot
            tone={
              bridgeStatus === "online"
                ? "green"
                : bridgeStatus === "error"
                  ? "red"
                  : "amber"
            }
            pulse={bridgeStatus === "connecting"}
          />
          {bridgeStatus === "online" && <span>Backend online</span>}
          {bridgeStatus === "connecting" && <span>Connecting…</span>}
          {bridgeStatus === "error" && <span>Backend error</span>}
        </div>
        <p className="mt-1 text-[10px] text-stone-700">
          Axial{version ? ` v${version}` : ""}
        </p>
      </div>

      {selectedPackId && (
        <PackModal
          packId={selectedPackId}
          onClose={() => setSelectedPackId(null)}
        />
      )}
    </aside>
  );
}
