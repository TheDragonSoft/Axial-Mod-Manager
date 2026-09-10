import { listen } from "@tauri-apps/api/event";
import type { Settings } from "../types";

/**
 * Emitted by Rust `set_settings` after a successful save.
 * Phase 6+ pages will subscribe to re-fetch state that depends on settings.
 */
export function onSettingsChanged(
  handler: (settings: Settings) => void,
): Promise<() => void> {
  return listen<Settings>("settings-changed", (e) => handler(e.payload));
}
