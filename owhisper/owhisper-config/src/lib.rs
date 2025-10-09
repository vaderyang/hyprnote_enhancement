mod error;
pub use error::*;

#[macro_export]
macro_rules! common_derives {
    ($item:item) => {
        #[derive(Debug, Clone, serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
        $item
    };
}

common_derives! {
    #[derive(Default)]
    pub struct Config {
        #[serde(rename = "$schema", skip_serializing_if = "Option::is_none")]
        #[schemars(skip)]
        pub schema: Option<String>,
        pub general: Option<GeneralConfig>,
        pub models: Vec<ModelConfig>,
    }
}

common_derives! {
    #[serde(tag = "type")]
    pub enum ModelConfig {
        #[serde(rename = "aws")]
        Aws(AwsModelConfig),
        #[serde(rename = "funasr")]
        Funasr(FunasrModelConfig),
        #[serde(rename = "whisper-cpp")]
        WhisperCpp(WhisperCppModelConfig),
        #[serde(rename = "moonshine")]
        Moonshine(MoonshineModelConfig),
    }
}

impl ModelConfig {
    pub fn id(&self) -> &str {
        match self {
            ModelConfig::Aws(config) => &config.id,
            ModelConfig::Funasr(config) => &config.id,
            ModelConfig::WhisperCpp(config) => &config.id,
            ModelConfig::Moonshine(config) => &config.id,
        }
    }
}

pub fn models_dir() -> std::path::PathBuf {
    dirs::cache_dir().unwrap().join("com.fastrepl.owhisper")
}

pub fn data_dir() -> std::path::PathBuf {
    dirs::data_dir().unwrap().join("com.fastrepl.owhisper")
}

pub fn config_dir() -> std::path::PathBuf {
    dirs::config_dir().unwrap().join("com.fastrepl.owhisper")
}

pub fn global_config_path() -> std::path::PathBuf {
    config_dir().join("config.json")
}

impl Config {
    pub fn new(path: Option<String>) -> Result<Self, crate::Error> {
        let settings = config::Config::builder()
            .add_source(config::File::with_name(&path.unwrap_or_else(|| {
                config_dir().join("config").to_str().unwrap().to_string()
            })))
            .add_source(config::Environment::with_prefix("OWHISPER"))
            .build()?;

        let config = settings.try_deserialize::<Config>()?;
        Ok(config)
    }
}

common_derives! {
    #[derive(Default)]
    pub struct GeneralConfig {
        pub api_key: Option<String>,
    }
}

common_derives! {
    pub struct AwsModelConfig {
        pub id: String,
        pub region: String,
        pub access_key_id: String,
        pub secret_access_key: String,
    }
}

common_derives! {
    #[derive(Default)]
    pub struct FunasrModelConfig {
        pub id: String,
        pub ws_url: Option<String>,
        pub http_url: Option<String>,
        pub mode: Option<String>,
        pub chunk_size: Option<Vec<u32>>,
        pub chunk_interval: Option<u32>,
        pub sample_rate: Option<u32>,
        pub input_sample_rate: Option<u32>,
        pub enable_speaker: Option<bool>,
    }
}

common_derives! {
    pub struct WhisperCppModelConfig {
        pub id: String,
        pub assets_dir: String,
    }
}

common_derives! {
    pub struct MoonshineModelConfig {
        pub id: String,
        pub size: MoonshineModelSize,
        pub assets_dir: String,
    }
}

common_derives! {
    pub enum MoonshineModelSize {
        #[serde(rename = "tiny")]
        Tiny,
        #[serde(rename = "base")]
        Base,
    }
}
