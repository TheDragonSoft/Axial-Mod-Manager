import { create } from "zustand";
import type { QueueItem } from "../types";

interface QueueState {
  items: QueueItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  upsert: (item: QueueItem) => void;
  dismiss: (id: number) => void;
  clearFinished: () => void;
}

export const useQueueStore = create<QueueState>()((set) => ({
  items: [],
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  upsert: (item) =>
    set((s) => ({ items: [item, ...s.items.filter((i) => i.id !== item.id)] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clearFinished: () =>
    set((s) => ({
      items: s.items.filter(
        (i) => i.status === "queued" || i.status === "downloading",
      ),
    })),
}));
