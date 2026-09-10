import { useAppStore, type Tab } from "../store/useAppStore";

const TABS: { id: Tab; label: string }[] = [
  { id: "browse", label: "Browse" },
  { id: "installed", label: "Installed" },
  { id: "packs", label: "Packs" },
  { id: "settings", label: "Settings" },
];

export default function Sidebar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const updateCount = useAppStore((s) => s.updateCount);

  return (
    <aside className="flex h-full w-48 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="px-4 py-4">
        <h1 className="text-sm font-bold tracking-wider text-amber-500 uppercase">
          Mod Manager
        </h1>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
              activeTab === id
                ? "bg-zinc-800 text-amber-400"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            {label}
            {id === "installed" && updateCount !== null && updateCount > 0 && (
              <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950">
                {updateCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}
