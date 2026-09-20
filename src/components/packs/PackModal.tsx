import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Leaf, Trash2 } from "lucide-react";
import {
  activatePack,
  activateVanilla,
  deletePack,
  exportPackBase64,
  getPack,
  handleActivationDiff,
  toAppError,
  VANILLA_EXPANSION_PACK_ID,
} from "../../lib/api";
import { onPackActivated } from "../../lib/events";
import { useAppStore } from "../../store/useAppStore";
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
  const isVanillaExpansion = packId === VANILLA_EXPANSION_PACK_ID;
  const isVanilla = packId === "vanilla" || isVanillaExpansion;

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

  const isActive = activePackId === packId;
  const isActivating = activatingPackId === packId;
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
        if (isVanilla) {
          setStatus({
            kind: "ok",
            text: isVanillaExpansion
              ? "Switched to Vanilla: Space Age — all mods disabled except base and the expansion."
              : "Switched to Vanilla — all mods disabled except base.",
          });
          return;
        }
        if (p.versionMismatch.length > 0) {
          const wrong = p.versionMismatch
            .map((m) => `${m.name} (pack wants v${m.version})`)
            .join(", ");
          setStatus({
            kind: "err",
            text: `Activated, but ${p.versionMismatch.length} mod${
              p.versionMismatch.length === 1 ? " is" : "s are"
            } the wrong version — retry: ${wrong}`,
          });
        } else if (p.missing.length > 0) {
          setStatus({
            kind: "err",
            text: `Pack "${p.packName}" finished with missing mods: ${p.missing.join(", ")}`,
          });
        } else {
          setStatus({ kind: "ok", text: `Pack "${p.packName}" fully activated ✓` });
        }
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [packId, isVanilla, isVanillaExpansion]);

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
        handleActivationDiff(diff, setActivatingPackId);
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
      setActivatingPackId(packId);
      try {
        await activateVanilla(isVanillaExpansion);
        setStatus({
          kind: "ok",
          text: isVanillaExpansion
            ? "Switched to Vanilla: Space Age — all mods disabled except base and the expansion."
            : "Switched to Vanilla — all mods disabled except base.",
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

  const title = isVanilla
    ? isVanillaExpansion
      ? "Vanilla: Space Age"
      : "Vanilla"
    : (pack?.name ?? "Pack details");
  const subtitle = isVanilla
    ? isVanillaExpansion
      ? "Built-in — base game + Space Age expansion"
      : "Built-in — base game only"
    : pack
      ? `Created ${new Date(pack.createdAt * 1000).toLocaleDateString()}`
      : undefined;

  const icon = isVanilla ? (
    <ModTile name={title} size="md" />
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
        <div className="flex flex-col items-center justify-center py-12 text-stone-400">
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
                          ? `${title} is active`
                          : `Activate ${title}`
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
                <span>{isVanillaExpansion ? "Space Age Configuration" : "Base Game Configuration"}</span>
              </div>
              <p>
                {isVanillaExpansion
                  ? "Activating Vanilla: Space Age disables all installed mods except the base game and its bundled Space Age expansion (space-age, quality). No mods will be deleted."
                  : "Activating Vanilla disables all installed mods except the built-in Factorio base game. No mods will be deleted."}
              </p>
            </div>
          ) : pack && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                  Mods in pack
                </span>
                <span className="text-xs text-stone-400">
                  {pack.mods.length} total
                </span>
              </div>
              {pack.mods.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface-2 p-4 text-center text-xs text-stone-400">
                  No mods in this pack.
                </div>
              ) : (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 text-xs">
                  {pack.mods.map((m) => (
                    <li
                      key={m.name}
                      className="flex items-center justify-between font-mono"
                    >
                      <span className="truncate text-stone-300" title={m.name}>{m.name}</span>
                      <span
                        className={
                          m.enabled
                            ? "text-stone-400"
                            : "text-stone-400/70 line-through"
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
