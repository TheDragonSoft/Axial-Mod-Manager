import { useState } from "react";

export default function PacksPage() {
  const [hint, setHint] = useState(false);

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-100">Packs</h2>
      <div className="mt-16 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-3xl">
          📦
        </div>
        <h3 className="mt-4 text-sm font-medium text-zinc-300">No mod packs yet</h3>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
          Packs group your installed mods into shareable profiles — switch between a
          light setup and a full SeaBlock overhaul in one click.
        </p>
        <button
          onClick={() => setHint(true)}
          className="mt-5 rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
        >
          Create Pack
        </button>
        {hint && (
          <p className="mt-3 text-xs text-amber-500/80">
            Pack creation is stubbed until Phase 8.
          </p>
        )}
      </div>
    </div>
  );
}
