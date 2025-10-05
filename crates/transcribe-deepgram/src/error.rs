#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    DeepgramError(#[from] deepgram::DeepgramError),

    #[error("{0}")]
    CustomError(String),
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::CustomError(s)
    }
}
