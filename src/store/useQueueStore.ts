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
  upsert: (incoming) =>
    set((state) => {
      const idx = state.items.findIndex((i) => i.id === incoming.id);

      if (idx !== -1) {
        const existing = state.items[idx];

        // Bail out if nothing changed (prevents unnecessary re-renders)
        if (
          existing.status === incoming.status &&
          existing.received === incoming.received &&
          existing.total === incoming.total &&
          existing.error === incoming.error
        ) {
          return state;
        }

        const isNowCompleted =
          incoming.status === "completed" && existing.status !== "completed";

        const updated: QueueItem = {
          ...existing,
          ...incoming,
          enqueuedAt: existing.enqueuedAt ?? incoming.enqueuedAt ?? Date.now(),
          completedAt: isNowCompleted
            ? Date.now()
            : existing.completedAt ?? incoming.completedAt,
        };

        // Mutate only this specific item's slot without re-sorting the array
        const nextItems = state.items.slice();
        nextItems[idx] = updated;
        return { items: nextItems };
      }

      // New item: first time this download is registered
      const newItem: QueueItem = {
        ...incoming,
        enqueuedAt: incoming.enqueuedAt ?? Date.now(),
        completedAt:
          incoming.status === "completed"
            ? (incoming.completedAt ?? Date.now())
            : incoming.completedAt,
      };

      // Establish stable order by enqueue timestamp (with id tiebreaker)
      const nextItems = [...state.items, newItem].sort((a, b) => {
        const timeDiff = (a.enqueuedAt ?? 0) - (b.enqueuedAt ?? 0);
        if (timeDiff !== 0) return timeDiff;
        return a.id - b.id;
      });

      return { items: nextItems };
    }),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clearFinished: () =>
    set((s) => ({
      items: s.items.filter(
        (i) => i.status === "queued" || i.status === "downloading",
      ),
    })),
}));

// Efficient selectors returning primitive numbers (Zustand compares with Object.is to prevent wide re-renders)
export const selectActiveCount = (s: QueueState): number =>
  s.items.filter((i) => i.status === "queued" || i.status === "downloading").length;

export const selectFailedCount = (s: QueueState): number =>
  s.items.filter((i) => i.status === "failed").length;

export const selectFinishedCount = (s: QueueState): number =>
  s.items.filter((i) => i.status !== "queued" && i.status !== "downloading").length;

