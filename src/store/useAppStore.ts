import { create } from "zustand";

export type Tab = "dashboard" | "browse" | "installed" | "packs" | "settings";

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  /** Available updates (set by "Check for updates"); null = not checked yet. */
  updateCount: number | null;
  setUpdateCount: (n: number | null) => void;
  /** True once checkUpdates has run this session (dashboard auto-check-once). */
  updatesChecked: boolean;
  setUpdatesChecked: (v: boolean) => void;
  /** Bumped whenever packs change so sidebar Quick Access knows to refetch. */
  packsVersion: number;
  bumpPacks: () => void;
  /** Pack the Quick Access sidebar wants expanded when PacksPage mounts. */
  openPackId: string | null;
  setOpenPackId: (id: string | null) => void;
  /** Configured target game version — loaded once at startup, kept fresh by
   * settings-changed. Drives the compat badges; null = not loaded yet. */
  targetFactorioVersion: string | null;
  setTargetFactorioVersion: (v: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateCount: null,
  setUpdateCount: (n) => set({ updateCount: n }),
  updatesChecked: false,
  setUpdatesChecked: (v) => set({ updatesChecked: v }),
  packsVersion: 0,
  bumpPacks: () => set((s) => ({ packsVersion: s.packsVersion + 1 })),
  openPackId: null,
  setOpenPackId: (id) => set({ openPackId: id }),
  targetFactorioVersion: null,
  setTargetFactorioVersion: (v) => set({ targetFactorioVersion: v }),
}));
