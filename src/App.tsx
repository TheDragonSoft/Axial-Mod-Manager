import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import BrowsePage from "./pages/BrowsePage";
import InstalledPage from "./pages/InstalledPage";
import PacksPage from "./pages/PacksPage";
import SettingsPage from "./pages/SettingsPage";
import { useAppStore, type Tab } from "./store/useAppStore";
import { ping, toAppError } from "./lib/api";

type BridgeState =
  | { status: "connecting" }
  | { status: "online"; message: string }
  | { status: "error"; message: string };

function renderPage(tab: Tab) {
  switch (tab) {
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
  const [bridge, setBridge] = useState<BridgeState>({ status: "connecting" });

  useEffect(() => {
    ping("world")
      .then((message) => setBridge({ status: "online", message }))
      .catch((e) => setBridge({ status: "error", message: toAppError(e).message }));
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto p-6">{renderPage(activeTab)}</main>
        <footer className="border-t border-zinc-800 px-4 py-2 text-xs">
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
    </div>
  );
}
