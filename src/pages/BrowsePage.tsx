import { useMemo, useState } from "react";
import ModCard from "../components/ModCard";
import { MOCK_MODS } from "../mock";

type SortKey = "downloads" | "name";

export default function BrowsePage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("downloads");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? MOCK_MODS.filter((m) =>
          [m.name, m.title, m.summary].some((f) => f.toLowerCase().includes(q)),
        )
      : MOCK_MODS;
    const sorted = [...filtered];
    sorted.sort((a, b) =>
      sort === "downloads" ? b.downloads - a.downloads : a.title.localeCompare(b.title),
    );
    return sorted;
  }, [query, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Browse</h2>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mods…"
            className="w-64 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 outline-none focus:border-amber-500"
          >
            <option value="downloads">Most downloads</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-600">
        {visible.length} mods · mock data — the live re146.dev index is wired in Phase 4
      </p>

      {visible.length === 0 ? (
        <div className="mt-16 text-center text-sm text-zinc-500">
          No mods match “{query}”.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((mod) => (
            <ModCard key={mod.name} mod={mod} />
          ))}
        </div>
      )}
    </div>
  );
}
