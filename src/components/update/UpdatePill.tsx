import { useEffect, useRef, useState } from "react";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { clsx } from "clsx";
import Button from "../ui/Button";
import StatusDot from "../ui/StatusDot";
import UpdateNotesPopover from "./UpdateNotesPopover";
import { getSettings, setSettings } from "../../lib/api";

/**
 * The slice of the plugin's Update the pill/popover consume. Exists so the
 * dev-only preview can substitute a fake without fabricating a plugin
 * Resource (its rid-backed handles can't be constructed from JS).
 */
export interface UpdateState {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onEvent?: (e: DownloadEvent) => void) => Promise<void>;
}

// Dev-only preview notes — shaped like a real GitHub release body so the
// markdown-lite renderer's headings/bullets/bold can be judged visually.
const PREVIEW_NOTES = `## New Features

- **Update pill** in the sidebar whenever a new Axial release is available
- **Release-notes popover** so you can read what changed before downloading
- Downloads now verify against the portal-published SHA1 checksum

## Fixes

- Pack activation no longer leaves expansion mods enabled in edge cases
- Fixed the mods-dir watcher missing rapid external changes`;

function makePreviewUpdate(): UpdateState {
  // Time-sliced fake download so the ProgressBar and countdown states are
  // reachable in the visual acceptance pass.
  return {
    version: "1.0.0",
    date: new Date().toISOString(),
    body: PREVIEW_NOTES,
    downloadAndInstall: async (onEvent) => {
      const total = 24_000_000;
      const chunk = total / 20;
      onEvent?.({ event: "Started", data: { contentLength: total } });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 80));
        onEvent?.({ event: "Progress", data: { chunkLength: chunk } });
      }
      onEvent?.({ event: "Finished" });
    },
  };
}

/**
 * Sidebar Update pill (A5). Runs the startup update check (moved unchanged
 * from App.tsx) and — while an update is available — stays visible next to
 * the app logo with a pulsing glow that stops once the release notes were
 * seen. Check failure / offline: renders nothing, no junk.
 */
export default function UpdatePill() {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [open, setOpen] = useState(false);
  // Glow runs until the notes have been seen once (spec: attract, then rest).
  const [seen, setSeen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // DEV-ONLY PREVIEW: `?__updatePreview=1` force-populates a fake update so
    // the pill and popover can be rendered without a signed release build.
    // import.meta.env.DEV is statically replaced by Vite (false in production
    // bundles), so the query param can never trigger this outside `pnpm dev`.
    if (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has("__updatePreview")
    ) {
      setUpdate(makePreviewUpdate());
      return;
    }
    // Gated startup check: 2.5s delay after mount so it doesn't compete with
    // initial ping, settings, or game-detection queries. (moved from App.tsx)
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const settings = await getSettings();
        if (settings.checkForUpdates === false) {
          return;
        }
        const update = await check();
        if (!cancelled && update) {
          if (settings.dismissedUpdateVersion === update.version) {
            return;
          }
          // The plugin's Update is structurally an UpdateState.
          setUpdate(update);
        }
      } catch (err) {
        // Degrade gracefully if offline, running in browser dev, or check fails
        console.warn("Auto-updater check failed:", err);
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function handleSkip() {
    const version = update?.version;
    setOpen(false);
    setUpdate(null);
    if (!version) return;
    try {
      const current = await getSettings();
      await setSettings({
        ...current,
        dismissedUpdateVersion: version,
      });
    } catch (e) {
      console.warn("Failed to persist dismissed update version:", e);
    }
  }

  if (!update) return null;

  const glow = !seen && !open;
  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSeen(true);
            setOpen((o) => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`Axial v${update.version} is available — open release notes`}
          className={clsx(
            "gap-1.5 rounded-full!",
            // The pill is the one deliberately accent-filled control: status
            // green is reserved for "an update is available". The `!` flags
            // are required because ghost variant's hover fills sort after
            // custom-theme colors in the generated stylesheet.
            "bg-accent! text-stone-950! hover:bg-accent-strong! hover:text-stone-950!",
            glow && "update-pill-glow",
          )}
        >
          {/* Attention dot until first open; dark so it reads inside the green pill. */}
          <StatusDot tone="green" className="h-1.5! w-1.5! bg-stone-950/70!" />
          <span>Update</span>
        </Button>
      </span>
      {open && (
        <UpdateNotesPopover
          update={update}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
          onSkip={() => void handleSkip()}
        />
      )}
    </>
  );
}
