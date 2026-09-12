import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ArrowUpCircle, X } from "lucide-react";
import Sidebar from "./components/Sidebar";
import QueueDrawer from "./components/QueueDrawer";
import DashboardPage from "./pages/DashboardPage";
import BrowsePage from "./pages/BrowsePage";
import InstalledPage from "./pages/InstalledPage";
import PacksPage from "./pages/PacksPage";
import SettingsPage from "./pages/SettingsPage";
import Panel from "./components/ui/Panel";
import Button from "./components/ui/Button";
import Spinner from "./components/ui/Spinner";
import { useAppStore, type Tab } from "./store/useAppStore";
import { useQueueStore } from "./store/useQueueStore";
import { useActivityStore } from "./store/useActivityStore";
import { onDownloadUpdated, onPackActivated, onSettingsChanged } from "./lib/events";
import { getSettings, ping, setSettings } from "./lib/api";

export type BridgeStatus = "connecting" | "online" | "error";

function renderPage(tab: Tab) {
  switch (tab) {
    case "dashboard":
      return <DashboardPage />;
    case "browse":
      return <BrowsePage />;
    case "installed":
      return <InstalledPage />;
    case "packs":
      return <PacksPage />;
    case "settings":
      return <SettingsPage />;
  }
}

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const [bridge, setBridge] = useState<BridgeStatus>("connecting");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    ping("world")
      .then(() => setBridge("online"))
      .catch(() => setBridge("error"));
  }, []);

  // Gated startup check for app updates: 2.5s delay after mount so it doesn't
  // compete with initial ping, settings, or game-detection queries.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    timer = setTimeout(async () => {
      try {
        const settings = await getSettings();
        if (settings.checkForUpdates === false) {
          return;
        }
        const update = await check();
        if (!cancelled && update) {
          if (settings.dismissedUpdateVersion === update.version) {
            return;
          }
          setAvailableUpdate(update);
        }
      } catch (err) {
        // Degrade gracefully if offline, running in browser dev, or check fails
        console.warn("Auto-updater check failed:", err);
      }
    }, 2500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function handleDismissUpdate() {
    setUpdateDismissed(true);
    if (!availableUpdate) return;
    try {
      const current = await getSettings();
      await setSettings({
        ...current,
        dismissedUpdateVersion: availableUpdate.version,
      });
    } catch (e) {
      console.warn("Failed to persist dismissed update version:", e);
    }
  }

  async function handleDownloadAndRestart() {
    if (!availableUpdate || isUpdating) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setIsUpdating(false);
      const msg = e instanceof Error ? e.message : String(e);
      setUpdateError(msg || "Failed to download and install update");
    }
  }

  // Single global listener: every backend queue update flows into the store,
  // and terminal states double as activity-log entries for the Dashboard.
  useEffect(() => {
    const unlisten = onDownloadUpdated((item) => {
      useQueueStore.getState().upsert(item);
      if (item.status === "completed") {
        useActivityStore
          .getState()
          .push("download-completed", item.modName, `v${item.version}`);
      } else if (item.status === "failed") {
        useActivityStore
          .getState()
          .push("download-failed", item.modName, item.error ?? undefined);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = onPackActivated((p) => {
      useAppStore.getState().setActivatingPackId(null);
      useActivityStore.getState().push(
        "pack-activated",
        p.packName,
        p.missing.length > 0 ? `${p.missing.length} download(s) failed` : "all mods ready",
      );
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Target game version for the compat badges — loaded once, kept fresh by
  // settings-changed so badge coloring survives a settings save.
  // Also keeps activePackId in sync with the backend Config.
  useEffect(() => {
    getSettings()
      .then((s) => {
        useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion);
        useAppStore.getState().setActivePackId(s.activePackId);
      })
      .catch(() => undefined);
    const unlisten = onSettingsChanged((s) => {
      useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion);
      useAppStore.getState().setActivePackId(s.activePackId);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar bridgeStatus={bridge} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {availableUpdate && !updateDismissed && (
          <div className="mx-auto max-w-[1600px] px-8 pt-6">
            <Panel
              icon={ArrowUpCircle}
              iconTone="green"
              title={`Axial v${availableUpdate.version} is available`}
              subtitle={
                updateError ? (
                  <span className="text-red-400">{updateError}</span>
                ) : (
                  availableUpdate.body || "A new release of Axial is ready to download and install."
                )
              }
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleDownloadAndRestart()}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <Spinner className="h-3.5 w-3.5 text-stone-500" />
                        Updating…
                      </>
                    ) : (
                      "Download & restart"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDismissUpdate()}
                    disabled={isUpdating}
                    aria-label="Dismiss update banner"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              }
            />
          </div>
        )}
        {/* Keyed remount gives each page a subtle entrance and isolates scroll. */}
        <div key={activeTab} className="animate-page mx-auto max-w-[1600px] p-8">
          {renderPage(activeTab)}
        </div>
      </main>
      <QueueDrawer />
    </div>
  );
}
