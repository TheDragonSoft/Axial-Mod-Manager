import { invoke } from "@tauri-apps/api/core";
import type {
  ActivationDiff,
  AppError,
  DetectedDir,
  DetectedGame,
  GameDirStatus,
  IndexHealth,
  InstalledSnapshot,
  ModDetails,
  ModsDirStatus,
  Pack,
  PackMeta,
  PackMod,
  QueueItem,
  ResolutionPlan,
  SearchResult,
  Settings,
  SortKey,
  UpdatesReport,
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

// ---- Settings ----

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

export async function detectGameInstall(): Promise<DetectedGame | null> {
  return invoke<DetectedGame | null>("detect_game");
}

export async function validateGameDir(path: string): Promise<GameDirStatus> {
  return invoke<GameDirStatus>("validate_game_dir", { path });
}

// ---- Index ----

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

// ---- Downloads ----

export async function enqueueDownload(
  modName: string,
  version: string,
  /** Portal-published SHA1 of the release zip; the backend verifies against it. */
  expectedSha1?: string | null,
): Promise<QueueItem> {
  return invoke<QueueItem>("enqueue_download", {
    modName,
    version,
    expectedSha1: expectedSha1 ?? null,
  });
}

export async function cancelDownload(id: number): Promise<void> {
  return invoke<void>("cancel_download", { id });
}

// ---- Installed ----

export async function listInstalled(): Promise<InstalledSnapshot> {
  return invoke<InstalledSnapshot>("list_installed");
}

export async function toggleMod(name: string, enabled: boolean): Promise<void> {
  return invoke<void>("toggle_mod", { name, enabled });
}

export async function uninstallMod(fileName: string): Promise<void> {
  return invoke<void>("uninstall_mod", { fileName });
}

// ---- Dependencies (Phase 7) ----

export async function resolveInstallPlan(name: string, version?: string): Promise<ResolutionPlan> {
  return invoke<ResolutionPlan>("resolve_install_plan", { name, version: version ?? null });
}

// ---- Packs ----

export async function listPacks(): Promise<PackMeta[]> {
  return invoke<PackMeta[]>("list_packs");
}

export async function getPack(id: string): Promise<Pack> {
  return invoke<Pack>("get_pack", { id });
}

export async function createPackFromInstalled(name: string): Promise<Pack> {
  return invoke<Pack>("create_pack_from_installed", { name });
}

export async function createPackFromMods(name: string, mods: PackMod[]): Promise<Pack> {
  return invoke<Pack>("create_pack_from_mods", { name, mods });
}

export async function deletePack(id: string): Promise<void> {
  return invoke<void>("delete_pack", { id });
}

export async function importPack(json: string): Promise<Pack> {
  return invoke<Pack>("import_pack", { json });
}

export async function exportPack(id: string): Promise<string> {
  return invoke<string>("export_pack", { id });
}

export async function activatePack(id: string): Promise<ActivationDiff> {
  return invoke<ActivationDiff>("activate_pack", { id });
}

export async function activateVanilla(): Promise<void> {
  return invoke<void>("activate_vanilla");
}

export async function checkUpdates(): Promise<UpdatesReport> {
  return invoke<UpdatesReport>("check_updates");
}

// ---- Launcher (Phase 2c) ----

export async function launchGame(): Promise<void> {
  return invoke<void>("launch_game");
}



