import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes,
  Compass,
  Download,
  Gamepad2,
  HardDrive,
  LayoutDashboard,
  Leaf,
  Package,
  Play,
  Power,
  RefreshCw,
  Search,
  SearchX,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Input from "./ui/Input";
import { isTopOverlay, popOverlay, pushOverlay } from "./ui/overlayStack";
import {
  activatePack,
  activateVanilla,
  checkUpdates,
  handleActivationDiff,
  launchGame,
  listInstalled,
  listPacks,
  toAppError,
  toggleMod,
  VANILLA_EXPANSION_PACK_ID,
  VANILLA_PACK_ID,
} from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { useQueueStore } from "../store/useQueueStore";
import { useActivityStore } from "../store/useActivityStore";
import type { InstalledMod, PackMeta } from "../types";

const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  browse: Compass,
  installed: Package,
  packs: Boxes,
  settings: SettingsIcon,
};

/** One runnable palette verb. Pure frontend over existing api.ts wrappers. */
interface CommandAction {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  /** Extra fuzzy-match fodder behind the visible label. */
  keywords?: string;
  disabled?: boolean;
  /** Throws on failure — runAction keeps the palette open to show it. */
  run: () => void | Promise<void>;
}

/** Cap on listed verbs so huge mod sets can't explode the listbox. */
const MAX_RESULTS = 50;

/**
 * Session-level recency of run verbs (most recent first). Deliberately not
 * persisted — "recent commands first" only needs to survive this app session.
 */
const recentActionIds: string[] = [];
function noteRecent(id: string) {
  const i = recentActionIds.indexOf(id);
  if (i !== -1) recentActionIds.splice(i, 1);
  recentActionIds.unshift(id);
  if (recentActionIds.length > 8) recentActionIds.length = 8;
}

/**
 * Case-insensitive subsequence match. Lower is better; null = no match.
 * Consecutive and word-start hits are cheaper than scattered gaps, which is
 * enough for verb-sized strings without pulling in a fuzzy library.
 */
function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0;
  const t = target.toLowerCase();
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of query.toLowerCase()) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    if (idx === prev + 1) score -= 3;
    else score += idx - Math.max(prev, -1);
    if (idx === 0 || t[idx - 1] === " " || t[idx - 1] === ":") score -= 4;
    prev = idx;
    ti = idx + 1;
  }
  return score;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Mutable verb sources, refreshed each open; null = fetch failed. */
  const [mods, setMods] = useState<InstalledMod[] | null>(null);
  const [packs, setPacks] = useState<PackMeta[] | null>(null);

  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const expansionAvailable = useAppStore((s) => s.expansionAvailable);
  const detectedGame = useAppStore((s) => s.detectedGame);

  const listRef = useRef<HTMLDivElement>(null);
  const token = useRef(Symbol("command-palette"));

  // Global Ctrl+K / Cmd+K toggle. Always attached so it works no matter
  // which page or overlay has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset per open and refresh the mutable verb sources (installed mods,
  // packs) so toggle/activate verbs reflect the current state.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setActionError(null);
    listInstalled()
      .then((s) => setMods(s.mods))
      .catch(() => setMods(null));
    listPacks()
      .then(setPacks)
      .catch(() => setPacks(null));
  }, [open]);

  // Escape closes only the topmost overlay — the palette can sit above an
  // open Modal, and a Modal can sit above the palette.
  useEffect(() => {
    if (!open) return;
    const me = token.current;
    pushOverlay(me);
    const onKey = (e: KeyboardEvent) => {
      if (!isTopOverlay(me)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      popOverlay(me);
    };
  }, [open]);

  const actions = useMemo<CommandAction[]>(() => {
    const out: CommandAction[] = [];
    const anyActivating = activatingPackId !== null;

    // Navigation
    const nav: { id: string; label: string; tab: "dashboard" | "browse" | "installed" | "packs" | "settings" }[] = [
      { id: "nav:dashboard", label: "Go to Dashboard", tab: "dashboard" },
      { id: "nav:browse", label: "Go to Browse", tab: "browse" },
      { id: "nav:installed", label: "Go to Installed", tab: "installed" },
      { id: "nav:packs", label: "Go to Packs", tab: "packs" },
      { id: "nav:settings", label: "Go to Settings", tab: "settings" },
    ];
    for (const n of nav) {
      out.push({
        id: n.id,
        label: n.label,
        category: "Navigation",
        icon: NAV_ICONS[n.tab],
        keywords: `open ${n.tab} tab page`,
        run: () => useAppStore.getState().setActiveTab(n.tab),
      });
    }
    out.push({
      id: "nav:downloads",
      label: "Open Downloads",
      category: "Navigation",
      icon: Download,
      keywords: "queue drawer downloads transfer",
      run: () => useQueueStore.getState().open(),
    });

    // Settings sections
    const sections: { id: string; label: string; section: "storage" | "game" | "general"; icon: LucideIcon }[] = [
      { id: "settings:storage", label: "Settings: Storage", section: "storage", icon: HardDrive },
      { id: "settings:game", label: "Settings: Game Install", section: "game", icon: Gamepad2 },
      { id: "settings:general", label: "Settings: General", section: "general", icon: SlidersHorizontal },
    ];
    for (const s of sections) {
      out.push({
        id: s.id,
        label: s.label,
        category: "Settings",
        icon: s.icon,
        keywords: "open settings section preferences",
        run: () => {
          const st = useAppStore.getState();
          st.setSettingsSection(s.section);
          st.setActiveTab("settings");
        },
      });
    }

    // Actions
    out.push({
      id: "action:launch",
      label: "Launch Factorio",
      category: "Actions",
      icon: Play,
      keywords: "start game play run",
      disabled: detectedGame === null,
      run: async () => {
        await launchGame();
        useActivityStore.getState().push("game-launched", "Factorio", "Game launched");
      },
    });
    out.push({
      id: "action:check-updates",
      label: "Check for mod updates",
      category: "Actions",
      icon: RefreshCw,
      keywords: "check updates versions refresh",
      run: async () => {
        const r = await checkUpdates();
        const st = useAppStore.getState();
        st.setUpdateCount(r.updates.length > 0 ? r.updates.length : null);
        st.setUpdatesChecked(true);
      },
    });

    // Packs — built-ins first (expansion flavor only when the zip is on
    // disk), then user packs. Already-active packs have nothing to do.
    if (activePackId !== VANILLA_PACK_ID) {
      out.push({
        id: "pack:vanilla",
        label: "Activate Vanilla",
        category: "Packs",
        icon: Leaf,
        keywords: "activate pack vanilla base game no mods",
        disabled: anyActivating,
        run: async () => {
          const st = useAppStore.getState();
          st.setActivatingPackId(VANILLA_PACK_ID);
          try {
            await activateVanilla(false);
          } catch (e) {
            useAppStore.getState().setActivatingPackId(null);
            throw e;
          }
        },
      });
    }
    if (expansionAvailable && activePackId !== VANILLA_EXPANSION_PACK_ID) {
      out.push({
        id: "pack:vanilla-space-age",
        label: "Activate Vanilla: Space Age",
        category: "Packs",
        icon: Leaf,
        keywords: "activate pack vanilla space age expansion",
        disabled: anyActivating,
        run: async () => {
          const st = useAppStore.getState();
          st.setActivatingPackId(VANILLA_EXPANSION_PACK_ID);
          try {
            await activateVanilla(true);
          } catch (e) {
            useAppStore.getState().setActivatingPackId(null);
            throw e;
          }
        },
      });
    }
    for (const p of packs ?? []) {
      if (p.id === activePackId) continue;
      out.push({
        id: `pack:${p.id}`,
        label: `Activate ${p.name}`,
        category: "Packs",
        icon: Boxes,
        keywords: `activate pack ${p.name}`,
        disabled: anyActivating,
        run: async () => {
          const st = useAppStore.getState();
          st.setActivatingPackId(p.id);
          try {
            const diff = await activatePack(p.id);
            handleActivationDiff(diff, (id) =>
              useAppStore.getState().setActivatingPackId(id),
            );
          } catch (e) {
            useAppStore.getState().setActivatingPackId(null);
            throw e;
          }
        },
      });
    }

    // Installed mods — one toggle verb per mod NAME. Duplicate zips on disk
    // (old versions, manual copies) resolve to the same `toggleMod(name)`
    // call, and duplicate verb ids would also collide as React keys.
    const seenModNames = new Set<string>();
    for (const m of mods ?? []) {
      if (seenModNames.has(m.name)) continue;
      seenModNames.add(m.name);
      out.push({
        id: `toggle:${m.name}`,
        label: m.enabled ? `Disable ${m.name}` : `Enable ${m.name}`,
        category: "Installed",
        icon: Power,
        keywords: `toggle enable disable mod ${m.name} v${m.version}`,
        run: () => toggleMod(m.name, !m.enabled),
      });
    }

    return out;
  }, [activePackId, activatingPackId, expansionAvailable, detectedGame, packs, mods]);

  const filtered = useMemo<CommandAction[]>(() => {
    const q = query.trim();
    if (q.length === 0) {
      // Default view: recency first, then navigation, then the rest.
      const seen = new Set<string>();
      const pick = (ids: Iterable<string>) =>
        [...ids]
          .map((id) => actions.find((a) => a.id === id))
          .filter((a): a is CommandAction => {
            if (!a || seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
      const nav = actions.filter((a) => {
        if (a.category !== "Navigation" || seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      const rest = actions.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      return [...pick(recentActionIds), ...nav, ...rest].slice(0, MAX_RESULTS);
    }
    const scored: { a: CommandAction; score: number }[] = [];
    for (const a of actions) {
      const score = Math.min(
        fuzzyScore(q, a.label) ?? Infinity,
        a.keywords ? (fuzzyScore(q, a.keywords) ?? Infinity) : Infinity,
      );
      if (score !== Infinity) scored.push({ a, score });
    }
    scored.sort((x, y) => x.score - y.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.a);
  }, [actions, query]);

  // Install-by-name verb: pinned last while searching, hands the query off to
  // BrowsePage (which consumes it) and jumps there.
  const searchVerb = useMemo<CommandAction | null>(() => {
    const q = query.trim();
    if (q.length === 0) return null;
    return {
      id: `search:${q}`,
      label: `Search the portal for “${q}”`,
      category: "Portal",
      icon: Search,
      keywords: "install mod by name browse search",
      run: () => {
        const st = useAppStore.getState();
        st.setPendingBrowseQuery(q);
        st.setActiveTab("browse");
      },
    };
  }, [query]);

  const items = useMemo(
    () => (searchVerb ? [...filtered, searchVerb] : filtered),
    [filtered, searchVerb],
  );

  // Clamp for the render between a query change and the selection reset.
  const sel = Math.min(selected, items.length - 1);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [sel, items]);

  async function runAction(a: CommandAction) {
    setActionError(null);
    try {
      await a.run();
      if (!a.id.startsWith("search:")) noteRecent(a.id);
      setOpen(false);
    } catch (e) {
      // Stay open and surface the failure inline — the palette is the only
      // witness to this verb having run.
      setActionError(toAppError(e).message);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-start justify-center bg-black/70 p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl animate-fade-in overflow-hidden rounded-xl border border-line bg-app shadow-2xl"
      >
        <div className="border-b border-line p-3">
          <Input
            autoFocus
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                // Single-focus surface (aria-activedescendant): keep focus on
                // the input instead of trapping with the Modal machinery.
                e.preventDefault();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (items.length > 0) setSelected((i) => (i + 1) % items.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (items.length > 0)
                  setSelected((i) => (i - 1 + items.length) % items.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const a = items[sel];
                if (a && !a.disabled) void runAction(a);
              }
            }}
            placeholder="Type a command…"
            aria-label="Search commands"
            aria-controls="axial-command-list"
            aria-activedescendant={items[sel] ? `axial-command-${sel}` : undefined}
          />
        </div>

        <div
          ref={listRef}
          id="axial-command-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {filtered.length === 0 && query.trim().length > 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-stone-600">
              <SearchX className="h-5 w-5" />
              <p className="text-sm">No matching commands</p>
            </div>
          )}
          {items.map((a, i) => {
            const Icon = a.icon;
            const isSelected = i === sel;
            return (
              <div
                key={a.id}
                id={`axial-command-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={a.disabled || undefined}
                data-selected={isSelected || undefined}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${
                  isSelected ? "bg-surface-2" : ""
                } ${a.disabled ? "opacity-50" : ""}`}
                // preventDefault keeps focus on the search input so the
                // activedescendant pattern stays intact.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!a.disabled) void runAction(a);
                }}
              >
                <Icon className="h-4 w-4 shrink-0 text-stone-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-stone-200">
                  {a.label}
                </span>
                <span className="shrink-0 text-[10px] tracking-wide text-stone-600 uppercase">
                  {a.category}
                </span>
              </div>
            );
          })}
        </div>

        {actionError && (
          <p className="border-t border-red-900/60 bg-red-950/40 px-4 py-2 text-xs text-red-400">
            {actionError}
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-stone-600">
          <span>
            <kbd className="mr-1 rounded border border-line bg-surface-2 px-1 font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span>
            <kbd className="mr-1 rounded border border-line bg-surface-2 px-1 font-mono text-[10px]">↵</kbd>
            run
          </span>
          <span>
            <kbd className="mr-1 rounded border border-line bg-surface-2 px-1 font-mono text-[10px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
