import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { isTopOverlay, popOverlay, pushOverlay } from "./overlayStack";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = "md",
  /** z-index layer class; stack a modal above another with z-[60]. */
  layer = "z-50",
  headerActions,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  size?: keyof typeof SIZES;
  layer?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const token = useRef(Symbol("modal"));

  useEffect(() => {
    if (!open) return;
    const me = token.current;
    // Shared overlay stack (also used by the command palette) so Escape only
    // closes the topmost layer.
    pushOverlay(me);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (!isTopOverlay(me)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        // Minimal focus trap: cycle Tab within the panel.
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
      popOverlay(me);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={clsx(
        "fixed inset-0 flex items-center justify-center bg-black/70 p-4 animate-fade-in",
        layer,
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx(
          "animate-modal-in flex max-h-[85vh] w-full flex-col rounded-xl border border-line bg-app shadow-2xl outline-none",
          SIZES[size],
        )}
      >
        {(title || headerActions) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {icon}
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-stone-200">
                  {title}
                </h2>
                {subtitle && (
                  <p className="truncate text-xs text-stone-400">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerActions}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-surface-2 hover:text-stone-200 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
