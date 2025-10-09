#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),

    #[error(transparent)]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    #[error(transparent)]
    Url(#[from] url::ParseError),

    #[error("{0}")]
    Custom(String),
}

impl From<String> for Error {
    fn from(value: String) -> Self {
        Self::Custom(value)
    }
}
