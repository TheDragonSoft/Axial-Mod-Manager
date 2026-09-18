import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Check, Download, X } from "lucide-react";
import Button from "../ui/Button";
import ProgressBar from "../ui/ProgressBar";
import MarkdownLite from "./MarkdownLite";
import type { UpdateState } from "./UpdatePill";

/**
 * Release-notes popover anchored to the sidebar Update pill (A5).
 *
 * This is a non-centered variant of the shared Modal: the focus-trap,
 * Escape, and click-outside behavior is replicated minimally here instead of
 * refactoring Modal, so the centered dialog used everywhere else stays
 * untouched. Rendered through a portal, positioned next to the pill's rect.
 */
export default function UpdateNotesPopover({
  update,
  anchorRef,
  onClose,
  onSkip,
}: {
  update: UpdateState;
  /** Element the popover anchors to (the pill wrapper span). */
  anchorRef: RefObject<HTMLSpanElement | null>;
  onClose: () => void;
  onSkip: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [phase, setPhase] = useState<"idle" | "downloading" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);

  const dateText = useMemo(() => {
    if (!update.date) return null;
    const d = new Date(update.date);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [update.date]);

  // Anchor once on open; the sidebar geometry doesn't change while the
  // popover is up (opening it doesn't scroll or resize anything).
  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const WIDTH = 384;
    setPos({
      top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 340)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)),
    });
  }, [anchorRef]);

  // Escape + focus trap — same shape as Modal.tsx, minus the open-stack
  // (only one update popover can exist).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  // Click-outside: the pill itself toggles, so it doesn't count as outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchorRef, onClose]);

  // Short countdown after a successful install, then relaunch. On Windows the
  // NSIS installer exits the app on its own; the countdown covers the
  // macOS/Linux path where the plugin requires an explicit relaunch.
  useEffect(() => {
    if (phase !== "done") return;
    if (countdown <= 0) {
      void relaunch().catch(() => undefined);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  async function handleDownload() {
    if (phase !== "idle") return;
    setPhase("downloading");
    setError(null);
    let received = 0;
    let total: number | undefined;
    try {
      await update.downloadAndInstall((e: DownloadEvent) => {
        if (e.event === "Started") {
          total = e.data.contentLength;
        } else if (e.event === "Progress") {
          received += e.data.chunkLength;
          if (total && total > 0) {
            setProgress(Math.round((received / total) * 100));
          }
        }
      });
      setPhase("done");
      setCountdown(3);
    } catch (err) {
      setPhase("idle");
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to download and install update");
    }
  }

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Axial v${update.version} release notes`}
      tabIndex={-1}
      className="animate-popover-in fixed z-50 flex max-h-[70vh] w-96 flex-col rounded-xl border border-line bg-app shadow-2xl outline-none"
      style={{ top: pos.top, left: pos.left, transformOrigin: "top left" }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-stone-200">
            v{update.version} Release Notes
          </h2>
          {dateText && (
            <p className="text-[11px] text-stone-400">Released {dateText}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close release notes"
          className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-surface-2 hover:text-stone-200 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {update.body ? (
          <MarkdownLite source={update.body} stagger />
        ) : (
          <p className="text-sm text-stone-400">
            No release notes were published for this version.
          </p>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            className="min-w-0 flex-1 justify-center"
            onClick={() => void handleDownload()}
            disabled={phase !== "idle"}
          >
            {phase === "idle" && (
              <>
                <Download className="h-4 w-4 shrink-0" />
                <span>Download &amp; restart</span>
              </>
            )}
            {phase === "downloading" && (
              <span className="w-full">
                <ProgressBar value={progress} tone="green" />
                <span className="mt-1 block text-center text-[11px] font-normal">
                  Downloading… {progress}%
                </span>
              </span>
            )}
            {phase === "done" && (
              <>
                <Check className="h-4 w-4 shrink-0 text-accent" />
                <span>Restarting in {countdown}…</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={phase !== "idle"}
          >
            Skip this version
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
