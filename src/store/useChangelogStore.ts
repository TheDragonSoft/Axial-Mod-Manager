import { create } from "zustand";
import type { ChangelogEntry } from "../types";

interface ChangelogState {
  /** name -> changelog entries; null = resolved but unavailable (failed).
   * Same shape as useSummaryStore: undefined = not yet fetched. */
  changelogs: Record<string, ChangelogEntry[] | null>;
  setResolved: (name: string, entries: ChangelogEntry[] | null) => void;
}

export const useChangelogStore = create<ChangelogState>((set) => ({
  changelogs: {},
  setResolved: (name, entries) =>
    set((s) => ({ changelogs: { ...s.changelogs, [name]: entries } })),
}));
