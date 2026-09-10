import { create } from "zustand";

export type Tab = "browse" | "installed" | "packs" | "settings";

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: "browse",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
