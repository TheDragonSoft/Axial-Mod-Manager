import { invoke } from "@tauri-apps/api/core";
import type {
  ActivationDiff,
  AppError,
  DetectedDir,
  DetectedGame,
  DetectionStatus,
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
  UninstallResult,
  UpdatesReport,
  VanillaInfo,
} from "../types";

/** Normalize any rejection into a known AppError shape. */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) {
    return e as AppError;
  }
  return { kind: "unknown", message: String(e) };
}

/** Check if an error was caused by offline / network or HTTP failure. */
export function isNetworkOrHttpError(e: unknown): boolean {
  const err = toAppError(e);
  return err.kind === "network" || err.kind === "http";
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

export async function getDetectionStatus(): Promise<DetectionStatus> {
  return invoke<DetectionStatus>("get_detection_status");
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

/** Dependents that would be left broken by removing this mod — fetched for
 * the uninstall confirm step before the user commits. */
export async function uninstallImpact(fileName: string): Promise<string[]> {
  return invoke<string[]>("uninstall_impact", { fileName });
}

export async function uninstallMod(fileName: string): Promise<UninstallResult> {
  return invoke<UninstallResult>("uninstall_mod", { fileName });
}

// ---- Dependencies (Phase 7) ----

export async function resolveInstallPlan(name: string, version?: string): Promise<ResolutionPlan> {
  return invoke<ResolutionPlan>("resolve_install_plan", { name, version: version ?? null });
}

// ---- Packs ----

/** Built-in pseudo-pack ids, mirroring the Rust constants in packs.rs. */
export const VANILLA_PACK_ID = "vanilla";
export const VANILLA_EXPANSION_PACK_ID = "vanilla-space-age";

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

export async function importPackBase64(base64: string): Promise<Pack> {
  return invoke<Pack>("import_pack_base64", { base64 });
}

export async function exportPackBase64(id: string): Promise<string> {
  return invoke<string>("export_pack_base64", { id });
}

export async function activatePack(id: string): Promise<ActivationDiff> {
  return invoke<ActivationDiff>("activate_pack", { id });
}

export async function activateVanilla(expansion: boolean = false): Promise<void> {
  return invoke<void>("activate_vanilla", { expansion });
}

/** Which built-in vanilla flavors the mods dir supports (expansion zip present?). */
export async function getVanillaInfo(): Promise<VanillaInfo> {
  return invoke<VanillaInfo>("get_vanilla_info");
}

export async function checkUpdates(): Promise<UpdatesReport> {
  return invoke<UpdatesReport>("check_updates");
}

// ---- Launcher (Phase 2c) ----

export async function launchGame(): Promise<void> {
  return invoke<void>("launch_game");
}



