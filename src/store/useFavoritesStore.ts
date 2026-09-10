import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Frontend-only favorites (localStorage via zustand persist). Names only —
 * metadata comes from search results whenever the mod is on screen.
 */
interface FavoritesState {
  favorites: string[];
  toggle: (name: string) => void;
  has: (name: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (name) =>
        set((s) => ({
          favorites: s.favorites.includes(name)
            ? s.favorites.filter((n) => n !== name)
            : [...s.favorites, name],
        })),
      has: (name) => get().favorites.includes(name),
    }),
    { name: "axial-favorites" },
  ),
);
