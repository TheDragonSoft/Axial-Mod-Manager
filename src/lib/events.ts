import { listen } from "@tauri-apps/api/event";
import type {
  InstalledChangedPayload,
  PackActivatedPayload,
  QueueItem,
  Settings,
} from "../types";

/** Emitted by Rust `set_settings` after a successful save. */
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

/** Emitted after Axial-side writes (downloads, toggles, uninstalls, pack
 * activation — reason "axial") and after the mods-dir watcher spots changes
 * made outside Axial (reason "external"). */
export function onInstalledChanged(
  handler: (payload: InstalledChangedPayload) => void,
): Promise<() => void> {
  return listen<InstalledChangedPayload>("installed-changed", (e) =>
    handler(e.payload),
  );
}

/** Fired when a pack activation's downloads have all landed. */
export function onPackActivated(
  handler: (payload: PackActivatedPayload) => void,
): Promise<() => void> {
  return listen<PackActivatedPayload>("pack-activated", (e) => handler(e.payload));
}

