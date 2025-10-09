use std::collections::HashMap;
use tauri::ipc::Channel;

use crate::{
    server::{ServerHealth, ServerType},
    LocalSttPluginExt, SttModelInfo, SupportedSttModel, SUPPORTED_MODELS,
};
use tauri_plugin_db::DatabasePluginExt;

#[tauri::command]
#[specta::specta]
pub async fn models_dir<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    Ok(app.models_dir().to_string_lossy().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_ggml_backends<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Vec<hypr_whisper_local::GgmlBackend> {
    app.list_ggml_backends()
}

#[tauri::command]
#[specta::specta]
pub async fn list_supported_models() -> Result<Vec<SttModelInfo>, String> {
    Ok(SUPPORTED_MODELS.iter().map(|m| m.info()).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloaded<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<bool, String> {
    app.is_model_downloaded(&model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn is_model_downloading<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<bool, String> {
    Ok(app.is_model_downloading(&model).await)
}

#[tauri::command]
#[specta::specta]
pub async fn download_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
    channel: Channel<i8>,
) -> Result<(), String> {
    app.download_model(model, channel)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_local_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<SupportedSttModel, String> {
    app.get_local_model().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_local_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<(), String> {
    app.set_local_model(model).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn start_server<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: Option<SupportedSttModel>,
) -> Result<String, String> {
    app.start_server(model).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_server<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    server_type: Option<ServerType>,
) -> Result<bool, String> {
    app.stop_server(server_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_servers<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<HashMap<ServerType, ServerHealth>, String> {
    app.get_servers().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_supported_languages(model: SupportedSttModel) -> Vec<hypr_language::Language> {
    model.supported_languages()
}

#[tauri::command]
#[specta::specta]
pub fn get_custom_base_url<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    app.get_custom_base_url().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_custom_streaming_url<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<String, String> {
    app.get_custom_streaming_url().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_custom_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_custom_api_key().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_custom_base_url<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    base_url: String,
) -> Result<(), String> {
    app.set_custom_base_url(base_url).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_custom_streaming_url<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    streaming_url: String,
) -> Result<(), String> {
    app.set_custom_streaming_url(streaming_url)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_custom_api_key<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    api_key: String,
) -> Result<(), String> {
    app.set_custom_api_key(api_key).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_provider<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<crate::Provider, String> {
    app.get_provider().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_provider<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: crate::Provider,
) -> Result<(), String> {
    app.set_provider(provider).await.map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_custom_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<SupportedSttModel>, String> {
    app.get_custom_model().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_custom_model<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    model: SupportedSttModel,
) -> Result<(), String> {
    app.set_custom_model(model).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn transcribe_audio_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    file_path: String,
    channel: Channel<i8>,
) -> Result<Vec<owhisper_interface::Word2>, String> {
    tracing::info!("transcribe_audio_file called with file: {}", file_path);

    let provider = app.get_provider().map_err(|e| e.to_string())?;
    tracing::info!("Provider: {:?}", provider);

    match provider {
        crate::Provider::Custom => {
            tracing::info!("Using Custom provider (FunASR)");
            let _ = channel.send(10);

            let http_url = app.get_custom_base_url().map_err(|e| e.to_string())?;
            let streaming_url = app.get_custom_streaming_url().map_err(|e| e.to_string())?;
            let custom_model = app.get_custom_model().map_err(|e| e.to_string())?;

            tracing::info!(
                "Custom config - http_url: {}, streaming_url: {}, model: {:?}",
                http_url,
                streaming_url,
                custom_model
            );

            let _ = channel.send(20);

            let model_name = custom_model.map(|m| m.to_string());

            let config = owhisper_config::FunasrModelConfig {
                id: model_name.unwrap_or_else(|| "funasr".to_string()),
                http_url: Some(http_url.clone()),
                ws_url: if streaming_url.trim().is_empty() {
                    None
                } else {
                    Some(streaming_url.clone())
                },
                enable_speaker: Some(true),
                ..Default::default()
            };

            let _ = channel.send(50);

            let result =
                hypr_transcribe_funasr::TranscribeService::transcribe_file_with_config(
                    config,
                    file_path.clone(),
                )
                .await
                .map_err(|e| {
                    tracing::error!("FunASR transcription failed: {}", e);
                    e.to_string()
                })?;

            tracing::info!("FunASR transcription succeeded, words count: {}", result.len());
            let _ = channel.send(100);

            Ok(result)
        }
        crate::Provider::Local => {
            tracing::info!("Using Local Whisper provider");
            // Use local Whisper model
            let _ = channel.send(10);

            let model = app.get_local_model().map_err(|e| e.to_string())?;
            tracing::info!("Local model: {:?}", model);

            let _ = channel.send(15);

            let model_path = match model {
                SupportedSttModel::Whisper(whisper_model) => {
                    let path = app.models_dir().join(whisper_model.file_name());
                    tracing::info!("Whisper model path: {:?}", path);
                    if !path.exists() {
                        tracing::error!("Whisper model not found at: {:?}", path);
                        return Err(
                            "Whisper model not downloaded. Please download the model first."
                                .to_string(),
                        );
                    }
                    path
                }
                _ => {
                    tracing::error!("Unsupported model type for local transcription: {:?}", model);
                    return Err(
                        "Only Whisper models are currently supported for local audio file transcription."
                            .to_string(),
                    );
                }
            };

            let _ = channel.send(25);

            // Get spoken languages from general config
            let languages = {
                let user_id = app.db_user_id().await.map_err(|e| e.to_string())?;
                if let Some(uid) = user_id {
                    let config = app.db_get_config(&uid).await.map_err(|e| e.to_string())?;
                    if let Some(cfg) = config {
                        cfg.general.spoken_languages
                    } else {
                        vec![hypr_language::ISO639::En.into()]
                    }
                } else {
                    vec![hypr_language::ISO639::En.into()]
                }
            };

            tracing::info!("Transcribing with languages: {:?}", languages);
            let _ = channel.send(40);

            tracing::info!("Starting local Whisper transcription for file: {}", file_path);
            let result = hypr_transcribe_whisper_local::process_recorded(model_path, file_path.clone(), languages)
                .map_err(|e| {
                    tracing::error!("Local Whisper transcription failed: {}", e);
                    e.to_string()
                })?;

            tracing::info!("Local Whisper transcription succeeded, words count: {}", result.len());
            let _ = channel.send(100);

            Ok(result)
        }
    }
}
