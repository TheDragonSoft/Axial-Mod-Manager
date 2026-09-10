use serde::Serialize;

/// The single error type for the entire backend.
/// Crosses the IPC boundary to the frontend serialized as `{ kind, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Config error: {0}")]
    Config(String),

    /// Used while a subsystem is scaffolded but not wired (e.g. index adapter in 4A).
    #[allow(dead_code)]
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::Http(_) => "http",
            AppError::Parse(_) => "parse",
            AppError::NotFound(_) => "not_found",
            AppError::Config(_) => "config",
            AppError::NotImplemented(_) => "not_implemented",
        }
    }
}

#[derive(Serialize)]
struct ErrorPayload<'a> {
    kind: &'a str,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ErrorPayload {
            kind: self.kind(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}
