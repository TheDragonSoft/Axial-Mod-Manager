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
