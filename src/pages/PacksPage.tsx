import { useCallback, useEffect, useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { listPacks, toAppError } from "../lib/api";
import { onPackActivated } from "../lib/events";
import { useAppStore } from "../store/useAppStore";
import type { PackMeta } from "../types";
import PackCard, { type Status } from "../components/packs/PackCard";
import NewPackModal from "../components/packs/NewPackModal";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";

export default function PacksPage() {
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [showNew, setShowNew] = useState(false);
  const openPackId = useAppStore((s) => s.openPackId);
  const setOpenPackId = useAppStore((s) => s.setOpenPackId);
  const bumpPacks = useAppStore((s) => s.bumpPacks);

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

  // Consume the Quick Access request after the pack list is available.
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  useEffect(() => {
    if (openPackId) {
      setPendingOpen(openPackId);
      setOpenPackId(null);
    }
  }, [openPackId, setOpenPackId]);

  return (
    <div>
      <PageHeader
        icon={Boxes}
        title="Packs"
        subtitle="Portable mod collections — activate, export, share"
        actions={
          <Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" />
            New Pack
          </Button>
        }
      />
      <p className="-mt-3 mb-4 text-xs text-stone-600">
        Activating a pack downloads its missing mods and disables mods not in the
        pack (never deletes them).
      </p>

      {status && (
        <div
          className={`mb-4 rounded-xl border p-3 text-xs ${
            status.kind === "ok"
              ? "border-green-900/60 bg-green-950/30 text-green-300"
              : "border-red-900/60 bg-red-950/40 text-red-300"
          }`}
        >
          {status.text}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-red-400">Error: {error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-line bg-surface"
            />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No mod packs yet"
          hint="Snapshot your current setup, build one from a root mod like SeaBlock, or import a shared JSON manifest."
          action={
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" />
              New Pack
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {packs.map((p) => (
            <PackCard
              key={p.id}
              meta={p}
              initiallyOpen={pendingOpen === p.id}
              onStatus={setStatus}
              onRefresh={() => {
                void refresh();
                bumpPacks();
              }}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewPackModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setStatus({ kind: "ok", text: "Pack created." });
            void refresh();
            bumpPacks();
          }}
        />
      )}
    </div>
  );
}
