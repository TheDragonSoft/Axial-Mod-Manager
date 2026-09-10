import { create } from "zustand";

export type Tab = "browse" | "installed" | "packs" | "settings";

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  /** Available updates (set by "Check for updates"); null = not checked yet. */
  updateCount: number | null;
  setUpdateCount: (n: number | null) => void;
  /** Configured target game version — loaded once at startup, kept fresh by
   * settings-changed. Drives the compat badges; null = not loaded yet. */
  targetFactorioVersion: string | null;
  setTargetFactorioVersion: (v: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "browse",
  setActiveTab: (tab) => set({ activeTab: tab }),
  updateCount: null,
  setUpdateCount: (n) => set({ updateCount: n }),
  targetFactorioVersion: null,
  setTargetFactorioVersion: (v) => set({ targetFactorioVersion: v }),
}));
