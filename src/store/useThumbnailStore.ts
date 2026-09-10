import { create } from "zustand";

interface ThumbnailState {
  /** name -> absolute thumbnail URL; null = resolved but has none (or failed). */
  urls: Record<string, string | null>;
  setResolved: (name: string, url: string | null) => void;
}

export const useThumbnailStore = create<ThumbnailState>((set) => ({
  urls: {},
  setResolved: (name, url) =>
    set((s) => ({ urls: { ...s.urls, [name]: url } })),
}));
