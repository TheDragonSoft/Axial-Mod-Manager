import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { activatePack, activateVanilla, deletePack, exportPackBase64, getPack, handlePackActivationDiff, toAppError } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card from "../ui/Card";
import ModTile from "../ui/ModTile";
import Spinner from "../ui/Spinner";
import Toggle from "../ui/Toggle";
import { useConfirm } from "../ui/useConfirm";
import type { ActivationDiff, Pack, PackMeta } from "../../types";

export type Status = { kind: "ok" | "err"; text: string };

export default function PackCard({
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
  const [copied, setCopied] = useState(false);
  const del = useConfirm();

  const isFactorioDetected = useAppStore((s) => s.isFactorioDetected);
  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const setActivatingPackId = useAppStore((s) => s.setActivatingPackId);

  const isActive = activePackId === meta.id;
  const isActivating = activatingPackId === meta.id;
  const anyActivating = activatingPackId !== null;

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

  async function handleToggle(checked: boolean) {
    if (checked) {
      // Turning ON this pack — activate immediately, no confirmation.
      setActivatingPackId(meta.id);
      try {
        const diff: ActivationDiff = await activatePack(meta.id);
        const parts = [
          `enabled ${diff.toEnable.length}`,
          `disabled ${diff.toDisable.length}`,
          diff.toDownload.length > 0 && `downloading ${diff.toDownload.length}`,
          diff.errors.length > 0 && `${diff.errors.length} error(s)`,
        ].filter(Boolean);
        onStatus({
          kind: "ok",
          text: `Activating "${diff.packName}": ${parts.join(", ")}`,
        });
        // activatingPackId is cleared by the pack-activated event in App.tsx;
        // for immediate activations (no downloads), pack-activated fires
        // synchronously before handlePackActivationDiff returns.
        handlePackActivationDiff(diff);
        if (diff.errors.length > 0) {
          onStatus({ kind: "err", text: diff.errors.join(" · ") });
        }
      } catch (e) {
        setActivatingPackId(null);
        onStatus({ kind: "err", text: toAppError(e).message });
      }
    } else {
      // Turning OFF the active pack → activate Vanilla immediately.
      setActivatingPackId("vanilla");
      try {
        await activateVanilla();
        onStatus({ kind: "ok", text: "Switched to Vanilla — all mods disabled except base." });
      } catch (e) {
        setActivatingPackId(null);
        onStatus({ kind: "err", text: toAppError(e).message });
      }
    }
  }

  async function doDelete() {
    if (del.confirming !== meta.id) {
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

  async function doCopyCode() {
    try {
      const code = await exportPackBase64(meta.id);
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onStatus({ kind: "ok", text: `Pack "${meta.name}" code copied to clipboard.` });
    } catch (e) {
      onStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <ModTile name={meta.name} size="lg" />
        <button
          onClick={() => void toggleExpanded()}
          className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <p className="truncate font-semibold text-stone-200" title={meta.name}>{meta.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{meta.modCount} mods</Badge>
            <span className="text-xs text-stone-400">
              created {new Date(meta.createdAt * 1000).toLocaleDateString()}
            </span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {isActivating ? (
            <Spinner className="h-5 w-5 text-accent" />
          ) : (
            <Toggle
              checked={isActive}
              onChange={(v) => void handleToggle(v)}
              disabled={isFactorioDetected === false || anyActivating}
              title={
                isFactorioDetected === false
                  ? "Factorio not found — set your mods folder in Settings"
                  : undefined
              }
              label={isActive ? `Deactivate ${meta.name}` : `Activate ${meta.name}`}
            />
          )}
          <button
            onClick={() => void toggleExpanded()}
            aria-label={expanded ? `Collapse ${meta.name} mod list` : `Expand ${meta.name} mod list`}
            className="shrink-0 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-surface-2 hover:text-stone-200 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          expanded && pack ? "grid-rows-[1fr] mt-4" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {pack && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 text-xs">
              {pack.mods.map((m) => (
                <li key={m.name} className="flex items-center justify-between font-mono">
                  <span className="truncate text-stone-300" title={m.name}>{m.name}</span>
                  <span className={m.enabled ? "text-stone-400" : "text-stone-400 line-through opacity-70"}>
                    v{m.version}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void doCopyCode()}
          title="Copy pack code to clipboard"
          aria-label={`Copy code for ${meta.name} to clipboard`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-stone-400" />
              <span>Copy Code to Clipboard</span>
            </>
          )}
        </Button>
        <Button
          variant={del.confirming === meta.id ? "danger" : "ghost"}
          size="sm"
          onClick={() => void doDelete()}
          title="Delete pack"
          aria-label={`Delete ${meta.name}`}
        >
          {del.confirming === meta.id ? (
            "Confirm delete?"
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </Card>
  );
}
