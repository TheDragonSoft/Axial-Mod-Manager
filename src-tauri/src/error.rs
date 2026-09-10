use serde::Serialize;

/// The single error type for the entire backend.
/// Crosses the IPC boundary to the frontend serialized as `{ kind, message }`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Reserved for Phase 4+ (index/download HTTP errors). No reqwest dep yet.
    #[allow(dead_code)]
    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[allow(dead_code)]
    #[error("Not found: {0}")]
    NotFound(String),

    #[allow(dead_code)]
    #[error("Config error: {0}")]
    Config(String),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Io(_) => "io",
            AppError::Http(_) => "http",
            AppError::Parse(_) => "parse",
            AppError::NotFound(_) => "not_found",
            AppError::Config(_) => "config",
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
