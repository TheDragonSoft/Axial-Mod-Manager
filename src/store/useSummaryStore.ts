import { create } from "zustand";

interface SummaryState {
  /** name -> portal summary text; null = resolved but unavailable (or failed). */
  summaries: Record<string, string | null>;
  setResolved: (name: string, summary: string | null) => void;
}

export const useSummaryStore = create<SummaryState>((set) => ({
  summaries: {},
  setResolved: (name, summary) =>
    set((s) => ({ summaries: { ...s.summaries, [name]: summary } })),
}));
