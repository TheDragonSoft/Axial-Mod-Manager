import { enqueueDownload, cancelDownload, toAppError } from "../lib/api";
import { useQueueStore } from "../store/useQueueStore";
import ProgressBar from "./ProgressBar";
import { formatBytes, percent } from "../lib/format";
import type { QueueItem, QueueStatus } from "../types";

const STATUS_STYLES: Record<QueueStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-zinc-800 text-zinc-400" },
  downloading: { label: "Downloading", className: "bg-amber-900/40 text-amber-400" },
  completed: { label: "Done", className: "bg-green-900/40 text-green-400" },
  failed: { label: "Failed", className: "bg-red-900/40 text-red-400" },
  cancelled: { label: "Cancelled", className: "bg-zinc-800 text-zinc-500" },
};

function QueueRow({ item }: { item: QueueItem }) {
  const upsert = useQueueStore((s) => s.upsert);
  const dismiss = useQueueStore((s) => s.dismiss);
  const isActive = item.status === "queued" || item.status === "downloading";
  const status = STATUS_STYLES[item.status];
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
      await enqueueDownload(item.modName, item.version);
    } catch (e) {
      upsert({ ...item, status: "failed", error: toAppError(e).message });
    }
  }

  return (
    <div className="border-b border-zinc-800 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-200">{item.modName}</p>
          <p className="text-xs text-zinc-500">v{item.version}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${status.className}`}>
          {status.label}
        </span>
      </div>

      {item.status !== "failed" && (
        <div className="mt-2">
          <ProgressBar value={pct} />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
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

      <div className="mt-2 flex justify-end gap-4">
        {isActive && (
          <button onClick={cancel} className="text-xs text-zinc-500 hover:text-red-400">
            Cancel
          </button>
        )}
        {item.status === "failed" && (
          <button onClick={retry} className="text-xs text-zinc-400 hover:text-amber-400">
            Retry
          </button>
        )}
        {!isActive && (
          <button onClick={() => dismiss(item.id)} className="text-xs text-zinc-500 hover:text-zinc-300">
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export default function QueueDrawer() {
  const items = useQueueStore((s) => s.items);
  const isOpen = useQueueStore((s) => s.isOpen);
  const close = useQueueStore((s) => s.close);
  const clearFinished = useQueueStore((s) => s.clearFinished);

  const activeCount = items.filter(
    (i) => i.status === "queued" || i.status === "downloading",
  ).length;
  const finishedCount = items.length - activeCount;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={close} />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-96 transform flex-col border-l border-zinc-800 bg-zinc-900 transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">
            Downloads{" "}
            <span className="font-normal text-zinc-500">({activeCount} active)</span>
          </h3>
          <div className="flex items-center gap-3">
            {finishedCount > 0 && (
              <button
                onClick={clearFinished}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Clear done
              </button>
            )}
            <button
              onClick={close}
              aria-label="Close"
              className="text-zinc-500 hover:text-zinc-200"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-600">
              No downloads yet.
              <br />
              (Dev: use ⚡ Simulate in the footer to test.)
            </div>
          ) : (
            items.map((item) => <QueueRow key={item.id} item={item} />)
          )}
        </div>
      </aside>
    </>
  );
}
