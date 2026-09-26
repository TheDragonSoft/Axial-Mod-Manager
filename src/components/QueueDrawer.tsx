import { useEffect, memo, useMemo, useRef } from "react";
import { enqueueDownload, cancelDownload, toAppError } from "../lib/api";
import { isTopOverlay, popOverlay, pushOverlay } from "./ui/overlayStack";
import {
  useQueueStore,
  selectActiveCount,
  selectFinishedCount,
} from "../store/useQueueStore";
import { useThumbnailUrl } from "../lib/thumbnails";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import ModTile from "./ui/ModTile";
import ProgressBar from "./ui/ProgressBar";
import { Download, X } from "lucide-react";
import { formatBytes, percent } from "../lib/format";
import type { QueueItem, QueueStatus } from "../types";

const STATUS_BADGES: Record<
  QueueStatus,
  { label: string; tone: "neutral" | "green" | "red" | "amber" }
> = {
  queued: { label: "Queued", tone: "neutral" },
  downloading: { label: "Downloading", tone: "amber" },
  completed: { label: "Done", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const QueueRow = memo(function QueueRow({ item }: { item: QueueItem }) {
  const upsert = useQueueStore((s) => s.upsert);
  const dismiss = useQueueStore((s) => s.dismiss);
  const thumbnail = useThumbnailUrl(item.modName);
  const isActive = item.status === "queued" || item.status === "downloading";
  const status = STATUS_BADGES[item.status];
  const pct = percent(item.received, item.total);

  async function cancel() {
    try {
      await cancelDownload(item.id);
    } catch {
      /* already finished — ignore */
    }
  }

  async function retry() {
    try {
      dismiss(item.id);
      await enqueueDownload(item.modName, item.version);
    } catch (e) {
      upsert({ ...item, status: "failed", error: toAppError(e).message });
    }
  }

  return (
    <div className="border-b border-line px-4 py-3 animate-fade-in transition-colors duration-150">
      <div className="flex items-start gap-3">
        <ModTile name={item.modName} url={thumbnail} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-stone-200" title={item.modName}>
                {item.modName}
              </p>
              <p className="text-xs text-stone-400">v{item.version}</p>
            </div>
            <Badge tone={status.tone} className="shrink-0">
              {status.label}
            </Badge>
          </div>

          {item.status !== "failed" && (
            <div className="mt-2">
              <ProgressBar
                value={pct}
                tone={item.status === "cancelled" ? "white" : "green"}
              />
              <div className="mt-1 flex justify-between text-[11px] text-stone-400">
                <span>
                  {formatBytes(item.received)}
                  {item.total > 0 && ` / ${formatBytes(item.total)}`}
                </span>
                <span>{item.total > 0 ? `${pct}%` : "…"}</span>
              </div>
            </div>
          )}

          {item.status === "failed" && item.error && (
            <p className="mt-2 text-xs text-red-400">{item.error}</p>
          )}

          <div className="mt-2 flex justify-end gap-1">
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                aria-label={`Cancel download of ${item.modName}`}
              >
                Cancel
              </Button>
            )}
            {item.status === "failed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={retry}
                aria-label={`Retry download of ${item.modName}`}
              >
                Retry
              </Button>
            )}
            {!isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismiss(item.id)}
                aria-label={`Dismiss download of ${item.modName}`}
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function QueueItemList({ clearFinished }: { clearFinished: () => void }) {
  const items = useQueueStore((s) => s.items);

  // Active items maintain the stable queue sort order established in the store
  const activeItems = useMemo(
    () => items.filter((i) => i.status === "queued" || i.status === "downloading"),
    [items],
  );

  // Finished items drop to the bottom section, sorted by most recently finished first
  const finishedItems = useMemo(
    () =>
      items
        .filter((i) => i.status !== "queued" && i.status !== "downloading")
        .sort((a, b) => (b.completedAt ?? b.id) - (a.completedAt ?? a.id)),
    [items],
  );

  const hasFailed = finishedItems.some((i) => i.status === "failed");
  const finishedLabel = hasFailed ? "Finished" : "Completed";

  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Download}
          title="No downloads yet"
          hint="Queued and finished mod downloads will show up here."
        />
      </div>
    );
  }

  return (
    <>
      {activeItems.length > 0 && (
        <div>
          {finishedItems.length > 0 && (
            <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                In Progress ({activeItems.length})
              </p>
            </div>
          )}
          {activeItems.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {finishedItems.length > 0 && (
        <div>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              {finishedLabel} ({finishedItems.length})
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFinished}
              className="h-5 px-1.5 text-[10px] text-stone-400 hover:text-stone-200"
            >
              Clear all
            </Button>
          </div>
          {finishedItems.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

export default function QueueDrawer() {
  const isOpen = useQueueStore((s) => s.isOpen);
  const close = useQueueStore((s) => s.close);
  const clearFinished = useQueueStore((s) => s.clearFinished);
  const activeCount = useQueueStore(selectActiveCount);
  const finishedCount = useQueueStore(selectFinishedCount);

  const drawerRef = useRef<HTMLElement>(null);
  const token = useRef(Symbol("queue-drawer"));

  useEffect(() => {
    if (!isOpen) return;
    const me = token.current;
    pushOverlay(me);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (!isTopOverlay(me)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };

    document.addEventListener("keydown", onKey, true);
    drawerRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey, true);
      popOverlay(me);
      previouslyFocused?.focus();
    };
  }, [isOpen, close]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
          onClick={close}
        />
      )}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Downloads queue"
        tabIndex={-1}
        className={`fixed inset-y-0 right-0 z-50 flex w-96 transform flex-col border-l border-line bg-surface transition-transform duration-200 ease-out motion-reduce:transition-none focus:outline-none ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-stone-100">
            Downloads{" "}
            <span className="font-normal text-stone-400">
              ({activeCount} active)
            </span>
          </h3>
          <div className="flex items-center gap-2">
            {finishedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFinished}>
                Clear done
              </Button>
            )}
            <button
              onClick={close}
              aria-label="Close downloads queue"
              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-surface-2 hover:text-stone-200 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isOpen && <QueueItemList clearFinished={clearFinished} />}
        </div>
      </aside>
    </>
  );
}

