import { useCallback, useEffect, useState } from "react";
import {
  activatePack,
  createPackFromInstalled,
  createPackFromMods,
  deletePack,
  exportPack,
  getPack,
  importPack,
  listPacks,
  resolveInstallPlan,
  toAppError,
} from "../lib/api";
import { onPackActivated } from "../lib/events";
import { useQueueStore } from "../store/useQueueStore";
import type {
  ActivationDiff,
  Pack,
  PackMeta,
  PackMod,
  ResolutionPlan,
} from "../types";

type Status = { kind: "ok" | "err"; text: string };

/** Two-step inline destructive confirm. */
function useConfirm() {
  const [arming, setArming] = useState<string | null>(null);
  const arm = (id: string) => {
    setArming(id);
    window.setTimeout(() => setArming((c) => (c === id ? null : c)), 3000);
  };
  return { arming, arm, disarm: () => setArming(null) };
}

function NewPackModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "snapshot" | "root" | "import">("choose");
  const [packName, setPackName] = useState("");
  const [rootName, setRootName] = useState("");
  const [rootVersion, setRootVersion] = useState("");
  const [plan, setPlan] = useState<ResolutionPlan | null>(null);
  const [importJson, setImportJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onCreated();
      onClose();
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveRoot() {
    setBusy(true);
    setError(null);
    try {
      setPlan(
        await resolveInstallPlan(rootName.trim(), rootVersion.trim() || undefined),
      );
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1.5 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500";
  const primary =
    "rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-zinc-100">New mod pack</h3>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>

        {mode === "choose" && (
          <div className="mt-4 space-y-2">
            <button onClick={() => setMode("snapshot")} className="w-full rounded border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-200 hover:border-amber-500">
              <span className="font-medium">Snapshot current mods</span>
              <span className="block text-xs text-zinc-500">Capture everything installed right now, with enable states.</span>
            </button>
            <button onClick={() => setMode("root")} className="w-full rounded border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-200 hover:border-amber-500">
              <span className="font-medium">Build from a root mod</span>
              <span className="block text-xs text-zinc-500">Resolve a dependency tree (e.g. SeaBlock) into a pack without installing anything.</span>
            </button>
            <button onClick={() => setMode("import")} className="w-full rounded border border-zinc-700 px-4 py-3 text-left text-sm text-zinc-200 hover:border-amber-500">
              <span className="font-medium">Paste exported JSON</span>
              <span className="block text-xs text-zinc-500">Import a pack someone shared with you.</span>
            </button>
          </div>
        )}

        {mode === "snapshot" && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => createPackFromInstalled(packName));
            }}
          >
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Pack name</label>
              <input autoFocus value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="My current setup" className={input} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button type="submit" disabled={busy || !packName.trim()} className={primary}>{busy ? "Creating…" : "Create pack"}</button>
            </div>
          </form>
        )}

        {mode === "root" && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Root mod name (portal id)</label>
              <input value={rootName} onChange={(e) => setRootName(e.target.value)} placeholder="SeaBlock" className={input} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Version (optional — latest compatible)</label>
              <input value={rootVersion} onChange={(e) => setRootVersion(e.target.value)} placeholder="1.2.0" className={input} />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {!plan ? (
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setMode("choose")} className="text-sm text-zinc-400 hover:text-zinc-200">Back</button>
                <button onClick={() => void resolveRoot()} disabled={busy || !rootName.trim()} className={primary}>
                  {busy ? "Resolving…" : "Resolve dependencies"}
                </button>
              </div>
            ) : (
              <>
                <div className="rounded border border-zinc-800 p-3 text-xs text-zinc-400">
                  <p><span className="text-zinc-200">{plan.toInstall.length}</span> to install · <span className="text-zinc-200">{plan.satisfied.length}</span> already installed · {plan.optional.length} optional (not included)</p>
                  {plan.conflicts.length > 0 && <p className="mt-1 text-red-400">{plan.conflicts.length} conflict(s) — resolve before saving.</p>}
                  <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-[11px] text-zinc-500">
                    {plan.toInstall.map((e) => (
                      <li key={e.name}>{e.name} @{e.version}</li>
                    ))}
                    {plan.satisfied.map((s) => (
                      <li key={s.name}>{s.name} @{s.version} <span className="text-zinc-600">(installed)</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">Pack name</label>
                  <input value={packName} onChange={(e) => setPackName(e.target.value)} placeholder={plan.rootName} className={input} />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setPlan(null); setError(null); }} className="text-sm text-zinc-400 hover:text-zinc-200">Back</button>
                  <button
                    onClick={() =>
                      void run(() => {
                        const mods: PackMod[] = [
                          ...plan.toInstall.map((e) => ({ name: e.name, version: e.version, enabled: true })),
                          ...plan.satisfied.map((s) => ({ name: s.name, version: s.version, enabled: true })),
                        ];
                        return createPackFromMods(packName.trim() || plan.rootName, mods);
                      })
                    }
                    disabled={busy || plan.conflicts.length > 0}
                    className={primary}
                  >
                    {busy ? "Saving…" : "Save as pack"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === "import" && (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => importPack(importJson));
            }}
          >
            <textarea
              autoFocus
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"name":"SeaBlock","mods":[…]}'
              rows={10}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-500"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setMode("choose")} className="text-sm text-zinc-400 hover:text-zinc-200">Back</button>
              <button type="submit" disabled={busy || !importJson.trim()} className={primary}>{busy ? "Importing…" : "Import"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function PackCard({
  meta,
  onStatus,
  onRefresh,
}: {
  meta: PackMeta;
  onStatus: (s: Status) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const del = useConfirm();
  const act = useConfirm();

  async function toggleExpanded() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!pack) {
      try {
        setPack(await getPack(meta.id));
      } catch (e) {
        onStatus({ kind: "err", text: toAppError(e).message });
        return;
      }
    }
    setExpanded(true);
  }

  async function doActivate() {
    if (act.arming !== meta.id) {
      act.arm(meta.id);
      return;
    }
    act.disarm();
    try {
      const diff: ActivationDiff = await activatePack(meta.id);
      const parts = [
        `enabled ${diff.toEnable.length}`,
        `disabled ${diff.toDisable.length}`,
        diff.toDownload.length > 0 && `downloading ${diff.toDownload.length}`,
        diff.errors.length > 0 && `${diff.errors.length} error(s)`,
      ].filter(Boolean);
      onStatus({ kind: "ok", text: `Activating “${diff.packName}”: ${parts.join(", ")}` });
      if (diff.toDownload.length > 0) useQueueStore.getState().open();
      if (diff.errors.length > 0) {
        onStatus({ kind: "err", text: diff.errors.join(" · ") });
      }
    } catch (e) {
      onStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  async function doDelete() {
    if (del.arming !== meta.id) {
      del.arm(meta.id);
      return;
    }
    del.disarm();
    try {
      await deletePack(meta.id);
      onRefresh();
    } catch (e) {
      onStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  async function doExport() {
    try {
      setExported(await exportPack(meta.id));
    } catch (e) {
      onStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  const btn = "text-xs text-zinc-500 hover:text-amber-400 disabled:opacity-40";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button onClick={() => void toggleExpanded()} className="min-w-0 text-left">
          <p className="text-sm font-semibold text-zinc-100">{meta.name}</p>
          <p className="text-xs text-zinc-500">
            {meta.modCount} mods · created {new Date(meta.createdAt * 1000).toLocaleDateString()}
            {expanded && " · click to collapse"}
          </p>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => void doActivate()} className={act.arming === meta.id ? "text-xs font-medium text-amber-400" : btn}>
            {act.arming === meta.id ? "Extras will be disabled — activate?" : "Activate"}
          </button>
          <button onClick={() => void doExport()} className={btn}>Export</button>
          <button onClick={() => void doDelete()} className={del.arming === meta.id ? "text-xs font-medium text-red-400" : "text-xs text-zinc-500 hover:text-red-400"}>
            {del.arming === meta.id ? "Confirm delete?" : "Delete"}
          </button>
        </div>
      </div>

      {expanded && pack && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {pack.mods.map((m) => (
              <li key={m.name} className="flex items-center justify-between font-mono">
                <span className="text-zinc-300">{m.name}</span>
                <span className={m.enabled ? "text-zinc-500" : "text-zinc-600 line-through"}>v{m.version}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {exported !== null && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <p className="text-xs text-zinc-500">Export JSON — select all and copy to share this pack:</p>
          <textarea
            readOnly
            value={exported}
            onFocus={(e) => e.currentTarget.select()}
            rows={6}
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400 outline-none"
          />
          <button onClick={() => setExported(null)} className="mt-1 text-xs text-zinc-500 hover:text-zinc-300">Close</button>
        </div>
      )}
    </div>
  );
}

export default function PacksPage() {
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [showNew, setShowNew] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPacks(await listPacks());
      setError(null);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = onPackActivated((p) => {
      setStatus(
        p.missing.length > 0
          ? { kind: "err", text: `Pack “${p.packName}” finished with missing mods: ${p.missing.join(", ")}` }
          : { kind: "ok", text: `Pack “${p.packName}” fully activated ✓` },
      );
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">Packs</h2>
        <button
          onClick={() => setShowNew(true)}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
        >
          New Pack
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-600">
        Activating a pack downloads its missing mods and disables mods not in the pack (never deletes them).
      </p>

      {status && (
        <div className={`mt-4 rounded border p-3 text-xs ${status.kind === "ok" ? "border-green-900/60 bg-green-950/30 text-green-300" : "border-red-900/60 bg-red-950/40 text-red-300"}`}>
          {status.text}
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-400">Error: {error}</p>}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Loading packs…</p>
      ) : packs.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-3xl">📦</div>
          <h3 className="mt-4 text-sm font-medium text-zinc-300">No mod packs yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            Snapshot your current setup, build one from a root mod like SeaBlock, or import a shared JSON manifest.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {packs.map((p) => (
            <PackCard key={p.id} meta={p} onStatus={setStatus} onRefresh={() => void refresh()} />
          ))}
        </div>
      )}

      {showNew && (
        <NewPackModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setStatus({ kind: "ok", text: "Pack created." });
            void refresh();
          }}
        />
      )}
    </div>
  );
}
