import { listen } from "@tauri-apps/api/event";
import type { QueueItem, Settings } from "../types";

/**
 * Emitted by Rust `set_settings` after a successful save.
 * Phase 6+ pages will subscribe to re-fetch state that depends on settings.
 */
export function onSettingsChanged(
  handler: (settings: Settings) => void,
): Promise<() => void> {
  return listen<Settings>("settings-changed", (e) => handler(e.payload));
}

/** Emitted for every queue state change (queued/downloading/progress/finished/failed). */
export function onDownloadUpdated(
  handler: (item: QueueItem) => void,
): Promise<() => void> {
  return listen<QueueItem>("download-updated", (e) => handler(e.payload));
}
