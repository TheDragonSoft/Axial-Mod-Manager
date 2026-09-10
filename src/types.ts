// ---- Shared (Phase 1) ----

/** Mirror of Rust's serialized AppError: { kind, message } */
export interface AppError {
  kind: string;
  message: string;
}

/** Mirror of Rust's Config (serde camelCase). */
export interface Settings {
  modsDir: string | null;
  targetFactorioVersion: string;
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
}

export interface ModDetails {
  name: string;
  title: string;
  owner: string | null;
  summary: string;
  downloads: number | null;
  releases: ModRelease[];
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
  name: string;
  version: string;
  enabled: boolean;
  factorioVersion: string;
}

// ---- Download queue (mocked in Phase 2, fed by Rust events in Phase 5) ----

export type QueueStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface QueueItem {
  id: string;
  modName: string;
  version: string;
  status: QueueStatus;
  received: number;
  total: number;
}
