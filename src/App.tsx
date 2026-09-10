import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import QueueDrawer from "./components/QueueDrawer";
import BrowsePage from "./pages/BrowsePage";
import InstalledPage from "./pages/InstalledPage";
import PacksPage from "./pages/PacksPage";
import SettingsPage from "./pages/SettingsPage";
import { useAppStore, type Tab } from "./store/useAppStore";
import { useQueueStore } from "./store/useQueueStore";
import { onDownloadUpdated, onSettingsChanged } from "./lib/events";
import { getSettings, ping, toAppError } from "./lib/api";

type BridgeState =
  | { status: "connecting" }
  | { status: "online"; message: string }
  | { status: "error"; message: string };

/**
 * All pages stay mounted; inactive ones are hidden. Each page loads its data
 * once, in the background, right at app open — tab switches are instant, no
 * refetch, and per-page state (Browse search, scroll) survives.
 */
function Pages({ activeTab }: { activeTab: Tab }) {
  return (
    <>
      <div className={activeTab !== "browse" ? "hidden" : undefined}>
        <BrowsePage />
      </div>
      <div className={activeTab !== "installed" ? "hidden" : undefined}>
        <InstalledPage />
      </div>
      <div className={activeTab !== "packs" ? "hidden" : undefined}>
        <PacksPage />
      </div>
      <div className={activeTab !== "settings" ? "hidden" : undefined}>
        <SettingsPage />
      </div>
    </>
  );
}

/** Floating button that opens the queue drawer. */
function QueueFab() {
  const toggle = useQueueStore((s) => s.toggle);
  const items = useQueueStore((s) => s.items);
  const activeCount = items.filter(
    (i) => i.status === "queued" || i.status === "downloading",
  ).length;
  const failedCount = items.filter((i) => i.status === "failed").length;

  return (
    <button
      onClick={toggle}
      className="fixed bottom-12 right-6 z-30 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200 shadow-lg hover:border-amber-500"
    >
      ⬇ Downloads
      {activeCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-zinc-950">
          {activeCount}
        </span>
      )}
      {failedCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-zinc-950">
          {failedCount}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const [bridge, setBridge] = useState<BridgeState>({ status: "connecting" });

  useEffect(() => {
    ping("world")
      .then((message) => setBridge({ status: "online", message }))
      .catch((e) => setBridge({ status: "error", message: toAppError(e).message }));
  }, []);

  // Single global listener: every backend queue update flows into the store.
  useEffect(() => {
    const unlisten = onDownloadUpdated((item) => useQueueStore.getState().upsert(item));
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // Target game version for the compat badges — loaded once, kept fresh by
  // settings-changed so badge coloring survives a settings save.
  useEffect(() => {
    getSettings()
      .then((s) => useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion))
      .catch(() => undefined);
    const unlisten = onSettingsChanged((s) =>
      useAppStore.getState().setTargetFactorioVersion(s.targetFactorioVersion),
    );
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto p-6">
          <Pages activeTab={activeTab} />
        </main>
        <footer className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 text-xs">
          {bridge.status === "connecting" && (
            <span className="text-zinc-500">● Connecting to backend…</span>
          )}
          {bridge.status === "online" && (
            <span className="text-green-500">● Backend online — {bridge.message}</span>
          )}
          {bridge.status === "error" && (
            <span className="text-red-500">● Backend error — {bridge.message}</span>
          )}
        </footer>
      </div>
      <QueueFab />
      <QueueDrawer />
    </div>
  );
}
