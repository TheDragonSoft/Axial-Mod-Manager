import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Leaf, Trash2 } from "lucide-react";
import {
  activatePack,
  activateVanilla,
  deletePack,
  exportPackBase64,
  getPack,
  toAppError,
} from "../../lib/api";
import { onPackActivated } from "../../lib/events";
import { useAppStore } from "../../store/useAppStore";
import { useQueueStore } from "../../store/useQueueStore";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card from "../ui/Card";
import ModTile from "../ui/ModTile";
import Modal from "../ui/Modal";
import Spinner from "../ui/Spinner";
import Toggle from "../ui/Toggle";
import { useConfirm } from "../ui/useConfirm";
import type { ActivationDiff, Pack } from "../../types";

export interface PackModalProps {
  packId: string;
  onClose: () => void;
}

export type Status = { kind: "ok" | "err"; text: string };

export default function PackModal({ packId, onClose }: PackModalProps) {
  const isVanilla = packId === "vanilla";

  const [pack, setPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(!isVanilla);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [copied, setCopied] = useState(false);

  const del = useConfirm();

  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const setActivatingPackId = useAppStore((s) => s.setActivatingPackId);
  const bumpPacks = useAppStore((s) => s.bumpPacks);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const isActive = isVanilla
    ? activePackId === "vanilla"
    : activePackId === packId;
  const isActivating = isVanilla
    ? activatingPackId === "vanilla"
    : activatingPackId === packId;
  const anyActivating = activatingPackId !== null;

  const load = useCallback(async () => {
    if (isVanilla) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPack(packId);
      setPack(data);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  }, [packId, isVanilla]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unlisten = onPackActivated((p) => {
      if (p.packId === packId) {
        setStatus(
          p.missing.length > 0
            ? {
                kind: "err",
                text: `Pack "${p.packName}" finished with missing mods: ${p.missing.join(", ")}`,
              }
            : { kind: "ok", text: `Pack "${p.packName}" fully activated ✓` },
        );
      } else if (isVanilla && p.packName === "Vanilla") {
        setStatus({
          kind: "ok",
          text: "Switched to Vanilla — all mods disabled except base.",
        });
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [packId, isVanilla]);

  async function handleToggle(checked: boolean) {
    if (checked) {
      // Turning ON this pack — activate immediately, no confirmation.
      setActivatingPackId(packId);
      try {
        const diff: ActivationDiff = await activatePack(packId);
        const parts = [
          `enabled ${diff.toEnable.length}`,
          `disabled ${diff.toDisable.length}`,
          diff.toDownload.length > 0 && `downloading ${diff.toDownload.length}`,
          diff.errors.length > 0 && `${diff.errors.length} error(s)`,
        ].filter(Boolean);
        setStatus({
          kind: "ok",
          text: `Activating "${diff.packName}": ${parts.join(", ")}`,
        });
        if (diff.toDownload.length > 0) useQueueStore.getState().open();
        if (diff.toDownload.length === 0) setActivatingPackId(null);
        if (diff.errors.length > 0) {
          setStatus({ kind: "err", text: diff.errors.join(" · ") });
        }
      } catch (e) {
        setActivatingPackId(null);
        setStatus({ kind: "err", text: toAppError(e).message });
      }
    } else {
      // Turning OFF the active pack -> activate Vanilla immediately.
      setActivatingPackId("vanilla");
      try {
        await activateVanilla();
        setStatus({
          kind: "ok",
          text: "Switched to Vanilla — all mods disabled except base.",
        });
      } catch (e) {
        setActivatingPackId(null);
        setStatus({ kind: "err", text: toAppError(e).message });
      }
    }
  }

  async function handleVanillaToggle(checked: boolean) {
    if (checked) {
      setActivatingPackId("vanilla");
      try {
        await activateVanilla();
        setStatus({
          kind: "ok",
          text: "Switched to Vanilla — all mods disabled except base.",
        });
      } catch (e) {
        setActivatingPackId(null);
        setStatus({ kind: "err", text: toAppError(e).message });
      }
    }
  }

  async function doDelete() {
    if (!pack) return;
    if (del.confirming !== pack.id) {
      del.arm(pack.id);
      return;
    }
    del.disarm();
    try {
      await deletePack(pack.id);
      bumpPacks();
      onClose();
    } catch (e) {
      setStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  async function doCopyCode() {
    if (!pack) return;
    try {
      const code = await exportPackBase64(pack.id);
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setStatus({
        kind: "ok",
        text: `Pack "${pack.name}" code copied to clipboard.`,
      });
    } catch (e) {
      setStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  const title = isVanilla ? "Vanilla" : (pack?.name ?? "Pack details");
  const subtitle = isVanilla
    ? "Built-in — base game only"
    : pack
      ? `Created ${new Date(pack.createdAt * 1000).toLocaleDateString()}`
      : undefined;

  const icon = isVanilla ? (
    <ModTile name="Vanilla" size="md" />
  ) : pack ? (
    <ModTile name={pack.name} size="md" />
  ) : (
    <Spinner className="h-5 w-5 text-accent" />
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={title}
      subtitle={subtitle}
      icon={icon}
      footer={
        isVanilla ? (
          <div className="flex w-full justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : pack ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void doCopyCode()}
              title="Copy pack code to clipboard"
              aria-label={`Copy code for ${pack.name} to clipboard`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-accent" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-stone-400" />
                  <span>Copy Code</span>
                </>
              )}
            </Button>
            <Button
              variant={del.confirming === pack.id ? "danger" : "ghost"}
              size="sm"
              onClick={() => void doDelete()}
              title="Delete pack"
              aria-label={`Delete ${pack.name}`}
            >
              {del.confirming === pack.id ? (
                "Confirm delete?"
              ) : (
                <>
                  <Trash2 className="h-4 w-4 text-stone-400" />
                  <span>Delete</span>
                </>
              )}
            </Button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-stone-500">
          <Spinner className="h-6 w-6 text-accent" />
          <p className="mt-3 text-xs">Loading pack details…</p>
        </div>
      ) : error ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-xs text-red-300">
            {error}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Factorio not detected alert */}
          {isFactorioDetected === false && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-3.5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-200">
                    Factorio not found
                  </p>
                  <p className="text-xs text-amber-400/80">
                    Set your mods folder in Settings before activating packs.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  setActiveTab("settings");
                }}
              >
                Open Settings
              </Button>
            </div>
          )}

          {/* Status banner */}
          {status && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                status.kind === "ok"
                  ? "border-green-900/60 bg-green-950/30 text-green-300"
                  : "border-red-900/60 bg-red-950/40 text-red-300"
              }`}
            >
              {status.text}
            </div>
          )}

          {/* Activation switch card */}
          <Card className="flex flex-col p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge>
                  {isVanilla ? "0 mods" : `${pack?.mods.length ?? 0} mods`}
                </Badge>
                {isActive && <Badge tone="green">Active</Badge>}
                {isActivating && <Badge tone="amber">Activating…</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {isActivating ? (
                  <Spinner className="h-5 w-5 text-accent" />
                ) : (
                  <Toggle
                    checked={isActive}
                    onChange={(checked) => {
                      if (isVanilla) {
                        void handleVanillaToggle(checked);
                      } else {
                        void handleToggle(checked);
                      }
                    }}
                    disabled={
                      isFactorioDetected === false ||
                      anyActivating ||
                      (isVanilla && isActive)
                    }
                    title={
                      isFactorioDetected === false
                        ? "Factorio not found — set your mods folder in Settings"
                        : undefined
                    }
                    label={
                      isVanilla
                        ? isActive
                          ? "Vanilla is active"
                          : "Activate Vanilla"
                        : isActive
                          ? `Deactivate ${pack?.name ?? ""}`
                          : `Activate ${pack?.name ?? ""}`
                    }
                  />
                )}
              </div>
            </div>
          </Card>

          {/* Body Content: Vanilla vs Pack Mods */}
          {isVanilla ? (
            <div className="rounded-lg border border-line bg-surface p-4 text-xs text-stone-400">
              <div className="flex items-center gap-2 mb-2 text-stone-200 font-medium">
                <Leaf className="h-4 w-4 text-accent" />
                <span>Base Game Configuration</span>
              </div>
              <p>
                Activating Vanilla disables all installed mods except the
                built-in Factorio base game. No mods will be deleted.
              </p>
            </div>
          ) : pack && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                  Mods in pack
                </span>
                <span className="text-xs text-stone-500">
                  {pack.mods.length} total
                </span>
              </div>
              {pack.mods.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface-2 p-4 text-center text-xs text-stone-500">
                  No mods in this pack.
                </div>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 text-xs">
                  {pack.mods.map((m) => (
                    <li
                      key={m.name}
                      className="flex items-center justify-between font-mono"
                    >
                      <span className="truncate text-stone-300">{m.name}</span>
                      <span
                        className={
                          m.enabled
                            ? "text-stone-500"
                            : "text-stone-600 line-through"
                        }
                      >
                        v{m.version}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
