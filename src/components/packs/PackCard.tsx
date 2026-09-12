import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { activatePack, activateVanilla, deletePack, exportPack, getPack, toAppError } from "../../lib/api";
import { useAppStore } from "../../store/useAppStore";
import { useQueueStore } from "../../store/useQueueStore";
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
  initiallyOpen = false,
  onStatus,
  onRefresh,
}: {
  meta: PackMeta;
  initiallyOpen?: boolean;
  onStatus: (s: Status) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const del = useConfirm();
  const confirm = useConfirm();

  const activePackId = useAppStore((s) => s.activePackId);
  const activatingPackId = useAppStore((s) => s.activatingPackId);
  const setActivatingPackId = useAppStore((s) => s.setActivatingPackId);

  const isActive = activePackId === meta.id;
  const isActivating = activatingPackId === meta.id;
  const anyActivating = activatingPackId !== null;

  // Sidebar Quick Access requests a specific pack to be expanded on entry.
  useEffect(() => {
    if (!initiallyOpen) return;
    (async () => {
      try {
        setPack(await getPack(meta.id));
        setExpanded(true);
      } catch {
        /* card stays collapsed; the list itself shows load errors */
      }
    })();
  }, [initiallyOpen, meta.id]);

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
      // Turning ON this pack — confirm first.
      if (confirm.confirming !== meta.id) {
        confirm.arm(meta.id);
        return;
      }
      confirm.disarm();
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
        if (diff.toDownload.length > 0) useQueueStore.getState().open();
        // activatingPackId is cleared by the pack-activated event in App.tsx;
        // for immediate activations (no downloads), pack-activated fires
        // synchronously before this returns.
        if (diff.toDownload.length === 0) setActivatingPackId(null);
        if (diff.errors.length > 0) {
          onStatus({ kind: "err", text: diff.errors.join(" · ") });
        }
      } catch (e) {
        setActivatingPackId(null);
        onStatus({ kind: "err", text: toAppError(e).message });
      }
    } else {
      // Turning OFF the active pack → activate Vanilla.
      if (confirm.confirming !== `vanilla-${meta.id}`) {
        confirm.arm(`vanilla-${meta.id}`);
        return;
      }
      confirm.disarm();
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

  async function doExport() {
    try {
      setExported(await exportPack(meta.id));
    } catch (e) {
      onStatus({ kind: "err", text: toAppError(e).message });
    }
  }

  // Derive the confirm-prompt text when a confirm is armed.
  const confirmText =
    confirm.confirming === meta.id
      ? "Extras will be disabled — activate?"
      : confirm.confirming === `vanilla-${meta.id}`
        ? "This will disable all mods — switch to Vanilla?"
        : null;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <ModTile name={meta.name} size="lg" />
        <button
          onClick={() => void toggleExpanded()}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate font-semibold text-stone-200">{meta.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{meta.modCount} mods</Badge>
            <span className="text-xs text-stone-600">
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
              disabled={anyActivating}
              label={isActive ? `Deactivate ${meta.name}` : `Activate ${meta.name}`}
            />
          )}
          <button
            onClick={() => void toggleExpanded()}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="shrink-0 rounded-lg p-1.5 text-stone-600 transition-colors hover:bg-surface-2 hover:text-stone-300"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {confirmText && (
        <p className="mt-2 text-xs text-amber-400">{confirmText}</p>
      )}

      {expanded && pack && (
        <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-2 p-3 text-xs">
          {pack.mods.map((m) => (
            <li key={m.name} className="flex items-center justify-between font-mono">
              <span className="truncate text-stone-300">{m.name}</span>
              <span className={m.enabled ? "text-stone-500" : "text-stone-600 line-through"}>
                v{m.version}
              </span>
            </li>
          ))}
        </ul>
      )}

      {exported !== null && (
        <div className="mt-4">
          <p className="text-xs text-stone-500">
            Export JSON — select all and copy to share this pack:
          </p>
          <textarea
            readOnly
            value={exported}
            onFocus={(e) => e.currentTarget.select()}
            rows={6}
            className="mt-2 w-full rounded-lg border border-line bg-app p-2 font-mono text-[11px] text-stone-400 focus:outline-none"
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <Button variant="ghost" size="sm" onClick={() => void doExport()}>
          Export
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
