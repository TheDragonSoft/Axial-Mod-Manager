import { create } from "zustand";
import { MOCK_MODS } from "../mock";
import type { QueueItem, QueueStatus } from "../types";

interface QueueState {
  items: QueueItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  upsert: (item: QueueItem) => void;
  setProgress: (id: string, received: number) => void;
  setStatus: (id: string, status: QueueStatus) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
  /** DEV-ONLY simulation — DELETE in Phase 5 when real backend events land. */
  simulateDownload: () => void;
}

// --- DEV-ONLY simulation plumbing — DELETE in Phase 5 ---
let simCounter = 0;
const simTimers = new Map<string, ReturnType<typeof setInterval>>();
// --------------------------------------------------------

export const useQueueStore = create<QueueState>()((set, get) => ({
  items: [],
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  upsert: (item) =>
    set((s) => ({ items: [item, ...s.items.filter((i) => i.id !== item.id)] })),

  setProgress: (id, received) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, received } : i)) })),

  setStatus: (id, status) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, status } : i)) })),

  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  clearFinished: () =>
    set((s) => ({
      items: s.items.filter((i) => i.status === "queued" || i.status === "downloading"),
    })),

  // --- DEV-ONLY simulation — DELETE in Phase 5 ---
  simulateDownload: () => {
    const mod = MOCK_MODS[Math.floor(Math.random() * MOCK_MODS.length)];
    const id = `sim-${Date.now()}-${simCounter++}`;
    const total = Math.round((6 + Math.random() * 50) * 1024 * 1024);

    get().upsert({
      id,
      modName: mod.title,
      version: mod.latestVersion,
      status: "downloading",
      received: 0,
      total,
    });

    const timer = setInterval(() => {
      const item = get().items.find((i) => i.id === id);
      if (!item || item.status !== "downloading") {
        clearInterval(timer);
        simTimers.delete(id);
        return;
      }
      const received = item.received + total / (25 + Math.random() * 35);
      if (received >= total) {
        clearInterval(timer);
        simTimers.delete(id);
        get().setProgress(id, total);
        get().setStatus(id, "completed");
      } else {
        get().setProgress(id, received);
      }
    }, 120);
    simTimers.set(id, timer);
  },
}));
