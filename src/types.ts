// ---- Shared (Phase 1) ----

/** Mirror of Rust's serialized AppError: { kind, message } */
export interface AppError {
  kind: string;
  message: string;
}

/** Mirror of Rust's Config (serde camelCase). */
export interface Settings {
  modsDir: string | null;
  gameDir: string | null;
  targetFactorioVersion: string;
  logLevel: string;
}

// ---- Mods directory detection/validation (Phase 3) ----

export interface DetectedDir {
  path: string;
  exists: boolean;
}

export interface ModsDirStatus {
  path: string;
  exists: boolean;
  isDir: boolean;
  writable: boolean;
  creatable: boolean;
  zipCount: number;
  hasModList: boolean;
}

// ---- Factorio game detection ----

/** Mirror of Rust's DetectedGame (serde camelCase). */
export interface DetectedGame {
  installDir: string;
  exePath: string | null;
  version: string | null;
  targetVersion: string | null;
  portableModsDir: string | null;
  source: string;
}

/** Facts about a candidate game directory; game is set when it is an install. */
export interface GameDirStatus {
  path: string;
  exists: boolean;
  isDir: boolean;
  game: DetectedGame | null;
}

// ---- Index types (mocked in Phase 2, live from backend in Phase 4) ----

export interface ModSummary {
  name: string;
  title: string;
  downloads: number;
  latestVersion: string;
  factorioVersion: string;
  summary: string;
}

// ---- Index (Phase 4) ----

export type SortKey = "downloads" | "name";

export interface SearchResult {
  results: ModSummary[];
  page: number;
  pageCount: number;
  totalCount: number;
}

export interface ModRelease {
  version: string;
  factorioVersion: string;
  releasedAt: string | null;
  downloadsCount: number | null;
  fileSize: number | null;
  /** Dependency strings from this release's info.json (mirror enrichment; empty = unknown). */
  dependencies: string[];
}

export interface ModDetails {
  name: string;
  title: string;
  owner: string | null;
  summary: string;
  downloads: number | null;
  dependencies: string[];
  releases: ModRelease[];
  /** Absolute portal thumbnail URL; null when the mod has none. */
  thumbnail: string | null;
}

export interface IndexHealth {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  byteLength: number;
  excerpt: string;
}

// ---- Installed mods (mocked in Phase 2, live in Phase 6) ----

export interface InstalledMod {
  fileName: string;
  name: string;
  version: string;
  factorioVersion: string;
  enabled: boolean;
  dependencies: string[];
  problem: string | null;
}

export interface InstalledSnapshot {
  modsDir: string;
  modListExists: boolean;
  mods: InstalledMod[];
}

// ---- Download queue (mocked in Phase 2, fed by Rust events in Phase 5) ----

export type QueueStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface QueueItem {
  id: number;
  modName: string;
  version: string;
  status: QueueStatus;
  received: number;
  total: number;
  error?: string | null;
}

// ---- Dependency resolution (Phase 7) ----

export interface PlanEntry {
  name: string;
  title: string;
  version: string;
  factorioVersion: string;
  requiredBy: string;
  depsKnown: boolean;
}

export interface PlanSatisfied {
  name: string;
  version: string;
}

export interface ResolutionPlan {
  rootName: string;
  target: string;
  toInstall: PlanEntry[];
  satisfied: PlanSatisfied[];
  optional: string[];
  conflicts: string[];
  warnings: string[];
}

// ---- Mod packs (Phase 8) ----

export interface PackMod {
  name: string;
  version: string;
  enabled: boolean;
}

export interface Pack {
  id: string;
  name: string;
  createdAt: number;
  mods: PackMod[];
}

export interface PackMeta {
  id: string;
  name: string;
  createdAt: number;
  modCount: number;
}

export interface DownloadPlanItem {
  name: string;
  version: string;
}

export interface ActivationDiff {
  packId: string;
  packName: string;
  toEnable: string[];
  toDisable: string[];
  toDownload: DownloadPlanItem[];
  errors: string[];
}

export interface PackActivatedPayload {
  packId: string;
  packName: string;
  missing: string[];
}

// ---- Update detection (Phase 9) ----

export interface UpdateInfo {
  name: string;
  installedVersion: string;
  availableVersion: string;
  factorioVersion: string;
}

export interface UpdatesReport {
  target: string;
  updates: UpdateInfo[];
  upToDate: string[];
  errors: [string, string][];
}


