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
) -> Result<Vec<owhisper_interface::Word2>, String> {
    let provider = app.get_provider().map_err(|e| e.to_string())?;

    match provider {
        crate::Provider::Custom => {
            // Use custom endpoint (Deepgram REST API)
            let base_url = app.get_custom_base_url().map_err(|e| e.to_string())?;
            let api_key = app.get_custom_api_key().map_err(|e| e.to_string())?;
            let custom_model = app.get_custom_model().map_err(|e| e.to_string())?;

            // Get jargons from general config for custom vocabulary
            let keywords = {
                let user_id = app.db_user_id().await.map_err(|e| e.to_string())?;
                if let Some(uid) = user_id {
                    let config = app.db_get_config(&uid).await.map_err(|e| e.to_string())?;
                    if let Some(cfg) = config {
                        let jargons = cfg.general.jargons;
                        if !jargons.is_empty() {
                            Some(jargons.join(", "))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            let config = owhisper_config::DeepgramModelConfig {
                base_url: Some(base_url),
                api_key,
                ..Default::default()
            };

            let model_name = custom_model.map(|m| m.to_string());

            hypr_transcribe_deepgram::TranscribeService::transcribe_file(
                config,
                file_path,
                model_name,
                Some("multi".to_string()),
                keywords,
            )
            .await
            .map_err(|e| e.to_string())
        }
        crate::Provider::Local => {
            // Use local Whisper model
            let model = app.get_local_model().map_err(|e| e.to_string())?;

            let model_path = match model {
                SupportedSttModel::Whisper(whisper_model) => {
                    let path = app.models_dir().join(whisper_model.file_name());
                    if !path.exists() {
                        return Err(
                            "Whisper model not downloaded. Please download the model first."
                                .to_string(),
                        );
                    }
                    path
                }
                _ => {
                    return Err(
                        "Only Whisper models are currently supported for local audio file transcription."
                            .to_string(),
                    );
                }
            };

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

            hypr_transcribe_whisper_local::process_recorded(model_path, file_path, languages)
                .map_err(|e| e.to_string())
        }
    }
}
