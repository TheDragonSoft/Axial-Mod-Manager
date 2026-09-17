import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, Leaf, Plus } from "lucide-react";
import { activateVanilla, listPacks, toAppError } from "../lib/api";
import { onPackActivated } from "../lib/events";
import { useAppStore } from "../store/useAppStore";
import type { PackMeta } from "../types";
import PackCard, { type Status } from "../components/packs/PackCard";
import NewPackModal from "../components/packs/NewPackModal";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import ModTile from "../components/ui/ModTile";
import PageHeader from "../components/ui/PageHeader";
import Spinner from "../components/ui/Spinner";
import Toggle from "../components/ui/Toggle";
import { useConfirm } from "../components/ui/useConfirm";

export default function PacksPage() {
  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [showNew, setShowNew] = useState(false);
  const bumpPacks = useAppStore((s) => s.bumpPacks);
  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const setActivatingPackId = useAppStore((s) => s.setActivatingPackId);

  const vanillaConfirm = useConfirm();

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
      if (p.versionMismatch.length > 0) {
        setStatus({
          kind: "err",
          text: `Pack "${p.packName}" activated, but ${p.versionMismatch.length} mod${
            p.versionMismatch.length === 1 ? " is" : "s are"
          } the wrong version — retry: ${p.versionMismatch.map((m) => m.name).join(", ")}`,
        });
      } else {
        setStatus(
          p.missing.length > 0
            ? { kind: "err", text: `Pack "${p.packName}" finished with missing mods: ${p.missing.join(", ")}` }
            : { kind: "ok", text: `Pack "${p.packName}" fully activated ✓` },
        );
      }
      bumpPacks();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [bumpPacks]);

  const isVanillaActive = activePackId === "vanilla";
  const isVanillaActivating = activatingPackId === "vanilla";
  const anyActivating = activatingPackId !== null;

  async function handleVanillaToggle(checked: boolean) {
    if (checked) {
      // Turning Vanilla ON — confirm.
      if (vanillaConfirm.confirming !== "vanilla") {
        vanillaConfirm.arm("vanilla");
        return;
      }
      vanillaConfirm.disarm();
      setActivatingPackId("vanilla");
      try {
        await activateVanilla();
        setStatus({ kind: "ok", text: "Switched to Vanilla — all mods disabled except base." });
      } catch (e) {
        setActivatingPackId(null);
        setStatus({ kind: "err", text: toAppError(e).message });
      }
    }
    // Turning Vanilla OFF does nothing — user must turn ON another pack instead.
  }

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

      {isFactorioDetected === false && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-200">Factorio not found</p>
              <p className="text-xs text-amber-400/80">
                Set your mods folder in Settings before activating packs.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActiveTab("settings")}
          >
            Open Settings
          </Button>
        </div>
      )}

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

      {/* Vanilla pseudo-pack — always shown, pinned first */}
      <div className="mb-4">
        <Card className="flex items-center gap-3 p-5">
          <ModTile name="Vanilla" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-stone-200">Vanilla</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge>0 mods</Badge>
              <span className="text-xs text-stone-600">
                <Leaf className="mr-0.5 inline h-3 w-3" />
                built-in — base game only
              </span>
            </div>
          </div>
          {isVanillaActivating ? (
            <Spinner className="h-5 w-5 shrink-0 text-accent" />
          ) : (
            <Toggle
              checked={isVanillaActive}
              onChange={(v) => void handleVanillaToggle(v)}
              disabled={isFactorioDetected === false || anyActivating || isVanillaActive}
              title={
                isFactorioDetected === false
                  ? "Factorio not found — set your mods folder in Settings"
                  : undefined
              }
              label={isVanillaActive ? "Vanilla is active" : "Activate Vanilla"}
            />
          )}
        </Card>
        {vanillaConfirm.confirming === "vanilla" && (
          <p className="mt-1.5 text-xs text-amber-400">
            This will disable all mods — switch to Vanilla?
          </p>
        )}
      </div>

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
        isFactorioDetected === false ? (
          <EmptyState
            icon={AlertTriangle}
            title="Factorio not found"
            hint="Set your mods folder in Settings to manage mod packs."
            action={
              <Button variant="secondary" onClick={() => setActiveTab("settings")}>
                Open Settings
              </Button>
            }
          />
        ) : (
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
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {packs.map((p) => (
            <PackCard
              key={p.id}
              meta={p}
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
