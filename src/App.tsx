import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import QueueDrawer from "./components/QueueDrawer";
import DashboardPage from "./pages/DashboardPage";
import BrowsePage from "./pages/BrowsePage";
import InstalledPage from "./pages/InstalledPage";
import PacksPage from "./pages/PacksPage";
import SettingsPage from "./pages/SettingsPage";
import { useAppStore, type Tab } from "./store/useAppStore";
import { useQueueStore } from "./store/useQueueStore";
import { useActivityStore } from "./store/useActivityStore";
import { onDownloadUpdated, onInstalledChanged, onPackActivated, onSettingsChanged } from "./lib/events";
import { getDetectionStatus, getSettings, getVanillaInfo, ping } from "./lib/api";

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

  useEffect(() => {
    ping("world")
      .then(() => setBridge("online"))
      .catch(() => setBridge("error"));
  }, []);

  // The app auto-updater UI (Update pill + release-notes popover) lives in
  // components/update/UpdatePill.tsx — it owns the startup check, the
  // dismiss flow, and the download/install lifecycle.

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
      const detail = p.versionMismatch.length > 0
        ? `${p.versionMismatch.length} wrong-version mod(s) left disabled`
        : p.missing.length > 0
          ? `${p.missing.length} download(s) failed`
          : "all mods ready";
      useActivityStore.getState().push("pack-activated", p.packName, detail);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Target game version for compat badges, active pack ID, and detection status —
  // loaded once at startup and kept fresh by settings-changed. Expansion
  // presence (built-in "Vanilla: Space Age" entry) rides along and also
  // refreshes on installed-changed, since the expansion zip can appear or
  // disappear outside Axial.
  useEffect(() => {
    const refreshDetection = () => {
      getDetectionStatus()
        .then((st) => useAppStore.getState().setDetectionStatus(st))
        .catch(() => undefined);
    };
    const refreshVanillaInfo = () => {
      getVanillaInfo()
        .then((v) => useAppStore.getState().setExpansionAvailable(v.expansionAvailable))
        .catch(() => undefined);
    };

    getSettings()
      .then((s) => {
        useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion);
        useAppStore.getState().setActivePackId(s.activePackId);
      })
      .catch(() => undefined);

    refreshDetection();
    refreshVanillaInfo();

    const unlistenSettings = onSettingsChanged((s) => {
      useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion);
      useAppStore.getState().setActivePackId(s.activePackId);
      refreshDetection();
      refreshVanillaInfo();
    });
    const unlistenInstalled = onInstalledChanged(() => refreshVanillaInfo());
    return () => {
      void unlistenSettings.then((f) => f());
      void unlistenInstalled.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar bridgeStatus={bridge} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* Keyed remount gives each page a subtle entrance and isolates scroll. */}
        <div key={activeTab} className="animate-page mx-auto max-w-[1600px] p-8">
          {renderPage(activeTab)}
        </div>
      </main>
      <QueueDrawer />
    </div>
  );
}
