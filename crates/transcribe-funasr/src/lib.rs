mod error;
mod service;
pub use error::*;
pub use service::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires FunASR infrastructure"]
    async fn test_service_initialization() {
        let config = owhisper_config::FunasrModelConfig {
            id: "funasr-test".to_string(),
            ..Default::default()
        };

        assert!(TranscribeService::new(config).await.is_ok());
    }
}
