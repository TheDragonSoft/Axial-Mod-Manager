import { create } from "zustand";
import type { DetectedGame, DetectionStatus } from "../types";

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
  /** Configured target game version — loaded once at startup, kept fresh by
   * settings-changed. Drives the compat badges; null = not loaded yet. */
  targetFactorioVersion: string | null;
  setTargetFactorioVersion: (v: string) => void;
  /** ID of the currently active pack (from Config); null = none yet.
   * Updated via settings-changed events. */
  activePackId: string | null;
  setActivePackId: (id: string | null) => void;
  /** Transient: set when a pack activation is in progress, cleared when
   * pack-activated arrives. Drives the in-progress toggle state. */
  activatingPackId: string | null;
  setActivatingPackId: (id: string | null) => void;
  /** Factorio detection facts — cached across pages. */
  isFactorioDetected: boolean | null;
  detectedGame: DetectedGame | null;
  effectiveModsDir: string | null;
  detectionChecked: boolean;
  setDetectionStatus: (status: DetectionStatus) => void;
  /** Whether the Space Age expansion zip is in the mods dir — controls the
   * second built-in "Vanilla: Space Age" entry. Null = not fetched yet. */
  expansionAvailable: boolean | null;
  setExpansionAvailable: (v: boolean) => void;
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
  targetFactorioVersion: null,
  setTargetFactorioVersion: (v) => set({ targetFactorioVersion: v }),
  activePackId: null,
  setActivePackId: (id) => set({ activePackId: id }),
  activatingPackId: null,
  setActivatingPackId: (id) => set({ activatingPackId: id }),
  isFactorioDetected: null,
  detectedGame: null,
  effectiveModsDir: null,
  detectionChecked: false,
  setDetectionStatus: (status: DetectionStatus) =>
    set({
      isFactorioDetected: status.isDetected,
      detectedGame: status.game,
      effectiveModsDir: status.effectiveModsDir,
      detectionChecked: true,
    }),
  expansionAvailable: null,
  setExpansionAvailable: (v) => set({ expansionAvailable: v }),
}));
