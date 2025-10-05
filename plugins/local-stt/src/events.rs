use crate::{server::ServerHealth, LocalSttPluginExt, Provider};
use tauri_plugin_windows::HyprWindow;

/// Event handler for Tauri window events.
///
/// This handler attempts to start the local STT server when the main window is focused,
/// but only if:
/// 1. The provider is set to Local (not Custom/Deepgram)
/// 2. The server is not already running
///
/// Note: File picker dialogs can trigger multiple focus events, so we guard against
/// duplicate server start attempts and gracefully handle the ServerAlreadyRunning error.
pub fn on_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: &tauri::RunEvent) {
    match event {
        tauri::RunEvent::WindowEvent { label, event, .. } => {
            let hypr_window = match label.parse::<HyprWindow>() {
                Ok(window) => window,
                Err(e) => {
                    tracing::warn!("parse_error: {:?}", e);
                    return;
                }
            };

            if hypr_window != HyprWindow::Main {
                return;
            }

            match event {
                tauri::WindowEvent::Focused(true) => {
                    tokio::task::block_in_place(|| {
                        tokio::runtime::Handle::current().block_on(async {
                            // Only start server for Local provider (not Custom/Deepgram)
                            match app.get_provider() {
                                Ok(Provider::Local) => {
                                    // Continue to server start logic
                                }
                                Ok(other) => {
                                    tracing::debug!(
                                        "provider={:?}, skip starting local STT server on focus",
                                        other
                                    );
                                    return;
                                }
                                Err(e) => {
                                    tracing::warn!("get_provider_failed: {:?}", e);
                                    // Fall through and attempt best-effort server start below
                                }
                            }

                            // Check if server is already running (Loading or Ready state)
                            let already_running = match app.get_servers().await {
                                Ok(servers) => servers
                                    .values()
                                    .any(|health| !matches!(health, ServerHealth::Unreachable)),
                                Err(e) => {
                                    tracing::warn!("get_servers_failed: {:?}", e);
                                    false
                                }
                            };

                            if already_running {
                                tracing::debug!("local_stt_server_already_running; skip start");
                                return;
                            }

                            // Try to start the server
                            match app.start_server(None).await {
                                Ok(_) => tracing::info!("local_stt_server_started"),
                                Err(e) => {
                                    // Handle race condition: another focus event may have started
                                    // the server between our check and this call
                                    let error_str = format!("{:?}", e);
                                    if error_str.contains("ServerAlreadyRunning") {
                                        tracing::debug!(
                                            "local_stt_server_already_running (race); ignoring"
                                        );
                                    } else {
                                        tracing::error!("local_stt_server_start_failed: {:?}", e);
                                    }
                                }
                            }
                        });
                    });
                }
                _ => {}
            }
        }
        _ => {}
    }
}
