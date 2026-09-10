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
