import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  DetectedDir,
  IndexHealth,
  ModDetails,
  ModsDirStatus,
  QueueItem,
  SearchResult,
  Settings,
  SortKey,
} from "../types";

/** Normalize any rejection into a known AppError shape. */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) {
    return e as AppError;
  }
  return { kind: "unknown", message: String(e) };
}

export async function ping(name: string): Promise<string> {
  return invoke<string>("ping", { name });
}

// ---- Settings (Phase 3) ----

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function setSettings(settings: Settings): Promise<Settings> {
  // Rust arg `new_config` becomes `newConfig` on the JS side (Tauri convention).
  return invoke<Settings>("set_settings", { newConfig: settings });
}

export async function detectModsDir(): Promise<DetectedDir | null> {
  return invoke<DetectedDir | null>("detect_mods_dir");
}

export async function validateModsDir(path: string): Promise<ModsDirStatus> {
  return invoke<ModsDirStatus>("validate_mods_dir", { path });
}

// ---- Index (Phase 4) ----

export async function searchMods(
  query: string,
  page: number,
  sort: SortKey,
): Promise<SearchResult> {
  return invoke<SearchResult>("search_mods", { query, page, sort });
}

export async function getModDetails(name: string): Promise<ModDetails> {
  return invoke<ModDetails>("get_mod_details", { name });
}

export async function indexHealthCheck(): Promise<IndexHealth> {
  return invoke<IndexHealth>("index_health_check");
}

export async function enqueueDownload(modName: string, version: string): Promise<QueueItem> {
  return invoke<QueueItem>("enqueue_download", { modName, version });
}

export async function cancelDownload(id: number): Promise<void> {
  return invoke<void>("cancel_download", { id });
}
