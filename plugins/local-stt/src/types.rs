#[derive(Debug)]
pub struct Connection {
    pub model: Option<String>,
    pub base_url: String,
    pub streaming_url: Option<String>,
    pub api_key: Option<String>,
}
