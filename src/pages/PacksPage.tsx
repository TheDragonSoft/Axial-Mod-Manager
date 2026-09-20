import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Boxes, Leaf, Plus } from "lucide-react";
import { activateVanilla, VANILLA_EXPANSION_PACK_ID, listPacks, toAppError } from "../lib/api";
import { onPackActivated } from "../lib/events";
import { type Status } from "../lib/packs";
import { useAppStore } from "../store/useAppStore";
import type { PackMeta } from "../types";
import PackCard from "../components/packs/PackCard";
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
  const expansionAvailable = useAppStore((s) => s.expansionAvailable);

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

  const anyActivating = activatingPackId !== null;

  // Built-in pseudo-packs, pinned first. The Space Age flavor only appears
  // when the expansion zip is in the mods dir.
  const builtIns: { id: string; name: string; blurb: string; expansion: boolean; offText: string }[] = [
    {
      id: "vanilla",
      name: "Vanilla",
      blurb: "built-in — base game only",
      expansion: false,
      offText: "all mods disabled except base.",
    },
    ...(expansionAvailable
      ? [
          {
            id: VANILLA_EXPANSION_PACK_ID,
            name: "Vanilla: Space Age",
            blurb: "built-in — base game + Space Age expansion",
            expansion: true,
            offText: "all mods disabled except base and the expansion.",
          },
        ]
      : []),
  ];

  async function handleVanillaToggle(id: string, expansion: boolean, checked: boolean) {
    if (checked) {
      // Turning a vanilla flavor ON — confirm.
      if (vanillaConfirm.confirming !== id) {
        vanillaConfirm.arm(id);
        return;
      }
      vanillaConfirm.disarm();
      setActivatingPackId(id);
      try {
        const builtIn = builtIns.find((b) => b.id === id);
        await activateVanilla(expansion);
        setStatus({
          kind: "ok",
          text: `Switched to ${builtIn?.name ?? "Vanilla"} — ${builtIn?.offText ?? "all mods disabled except base."}`,
        });
      } catch (e) {
        setActivatingPackId(null);
        setStatus({ kind: "err", text: toAppError(e).message });
      }
    }
    // Turning a vanilla flavor OFF does nothing — user must turn ON another pack instead.
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
      <p className="-mt-3 mb-4 text-xs text-stone-400">
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

      {/* Built-in vanilla pseudo-packs — always pinned first */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {builtIns.map((b) => {
          const isActive = activePackId === b.id;
          const isActivating = activatingPackId === b.id;
          return (
            <div key={b.id}>
              <Card className="flex items-center gap-3 p-5">
                <ModTile name={b.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-stone-200" title={b.name}>{b.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge>0 mods</Badge>
                    <span className="text-xs text-stone-400">
                      <Leaf className="mr-0.5 inline h-3 w-3" />
                      {b.blurb}
                    </span>
                  </div>
                </div>
                {isActivating ? (
                  <Spinner className="h-5 w-5 shrink-0 text-accent" />
                ) : (
                  <Toggle
                    checked={isActive}
                    onChange={(v) => void handleVanillaToggle(b.id, b.expansion, v)}
                    disabled={isFactorioDetected === false || anyActivating || isActive}
                    title={
                      isFactorioDetected === false
                        ? "Factorio not found — set your mods folder in Settings"
                        : undefined
                    }
                    label={isActive ? `${b.name} is active` : `Activate ${b.name}`}
                  />
                )}
              </Card>
              {vanillaConfirm.confirming === b.id && (
                <p className="mt-1.5 text-xs text-amber-400">
                  {b.expansion
                    ? "This will disable all mods except base and the expansion — switch to Vanilla: Space Age?"
                    : "This will disable all mods — switch to Vanilla?"}
                </p>
              )}
            </div>
          );
        })}
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
