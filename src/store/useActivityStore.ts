import { create } from "zustand";

/** Session-only activity log powering the Dashboard "Recent Activity" panel. */
export type ActivityKind =
  | "download-completed"
  | "download-failed"
  | "pack-activated"
  | "updates-found"
  | "game-launched";

export interface ActivityEntry {
  id: number;
  kind: ActivityKind;
  /** Primary text, e.g. the mod or pack name. */
  label: string;
  detail?: string;
  at: number;
}

interface ActivityState {
  entries: ActivityEntry[];
  push: (kind: ActivityKind, label: string, detail?: string) => void;
}

const MAX_ENTRIES = 30;
let nextId = 1;

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  push: (kind, label, detail) =>
    set((s) => ({
      entries: [
        { id: nextId++, kind, label, detail, at: Date.now() },
        ...s.entries,
      ].slice(0, MAX_ENTRIES),
    })),
}));
