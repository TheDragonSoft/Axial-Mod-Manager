import { invoke } from "@tauri-apps/api/core";
import type {
  AppError,
  DetectedDir,
  ModsDirStatus,
  Settings,
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
