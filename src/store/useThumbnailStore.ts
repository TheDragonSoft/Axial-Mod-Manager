import { create } from "zustand";

interface ThumbnailState {
  /** name -> absolute thumbnail URL; null = resolved but has none (or failed). */
  urls: Record<string, string | null>;
  setResolved: (name: string, url: string | null) => void;
}

export const useThumbnailStore = create<ThumbnailState>((set) => ({
  urls: {},
  setResolved: (name, url) =>
    set((s) => {
      // Skip state update and subscriber re-renders if the URL for this mod hasn't changed
      if (s.urls[name] === url) return s;
      return { urls: { ...s.urls, [name]: url } };
    }),
}));
