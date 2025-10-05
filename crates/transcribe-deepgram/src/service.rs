use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;

use axum::{
    body::Body,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::{FromRequest, Request},
    http::{Response, StatusCode},
    response::IntoResponse,
};
use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};
use tower::Service;

use deepgram::{
    common::options::{Encoding, Language, Model, Options},
    Deepgram,
};

use owhisper_interface::{ListenInputChunk, ListenOutputChunk, ListenParams, Word2};
use text_utils::segment_text;

#[derive(Clone)]
pub struct TranscribeService {
    deepgram: Deepgram,
}

impl TranscribeService {
    pub async fn new(config: owhisper_config::DeepgramModelConfig) -> Result<Self, crate::Error> {
        let api_key = config.api_key.unwrap_or_default();

        let base_url = config
            .base_url
            .unwrap_or("https://api.deepgram.com".to_string())
            .parse::<url::Url>()
            .unwrap();

        let deepgram = Deepgram::with_base_url_and_api_key(base_url, api_key)?;
        Ok(Self { deepgram })
    }

    /// Transcribe an audio file using Deepgram REST API
    pub async fn transcribe_file(
        config: owhisper_config::DeepgramModelConfig,
        audio_file_path: impl AsRef<std::path::Path>,
        model: Option<String>,
        language: Option<String>,
        keywords: Option<String>,
    ) -> Result<Vec<Word2>, crate::Error> {
        let api_key = config.api_key.unwrap_or_default();
        let base_url = config
            .base_url
            .unwrap_or("http://v.netis.com.cn:13000".to_string());

        // Read the audio file
        let audio_data = std::fs::read(audio_file_path.as_ref())
            .map_err(|e| crate::Error::from(format!("Failed to read audio file: {}", e)))?;

        // Build the request URL
        let mut url = format!("{}/v1/listen", base_url);
        let mut query_params = vec![];

        if let Some(m) = model {
            query_params.push(format!("model={}", m));
        }
        if let Some(l) = language {
            query_params.push(format!("language={}", l));
        }

        // Add default parameters
        query_params.push("punctuate=true".to_string());
        query_params.push("smart_format=true".to_string());

        // Add custom keywords/vocabulary if provided
        if let Some(kw) = keywords {
            if !kw.trim().is_empty() {
                // URL-encode the keywords
                let encoded_keywords = urlencoding::encode(&kw);
                query_params.push(format!("keywords={}", encoded_keywords));
            }
        }

        if !query_params.is_empty() {
            url = format!("{}?{}", url, query_params.join("&"));
        }

        // Create HTTP client
        let client = reqwest::Client::new();
        let mut request = client
            .post(&url)
            .header("Content-Type", "audio/wav")
            .body(audio_data);

        // Add API key header if provided (for official Deepgram API)
        if !api_key.is_empty() && base_url.contains("deepgram.com") {
            request = request.header("Authorization", format!("Token {}", api_key));
        }

        // Send the request
        let response = request
            .send()
            .await
            .map_err(|e| crate::Error::from(format!("Failed to send request: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(crate::Error::from(format!(
                "Deepgram API error ({}): {}",
                status, error_text
            )));
        }

        // Parse the response
        let response_text = response
            .text()
            .await
            .map_err(|e| crate::Error::from(format!("Failed to read response: {}", e)))?;

        let response_json: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| crate::Error::from(format!("Failed to parse JSON: {}", e)))?;

        // Extract words from Deepgram response
        let mut words = Vec::new();

        if let Some(results) = response_json.get("results") {
            if let Some(channels) = results.get("channels") {
                if let Some(channel) = channels.get(0) {
                    if let Some(alternatives) = channel.get("alternatives") {
                        if let Some(first_alt) = alternatives.get(0) {
                            // Try to get word-level timestamps
                            if let Some(word_array) = first_alt.get("words") {
                                if let Some(words_data) = word_array.as_array() {
                                    for word_obj in words_data {
                                        if let Some(word_text) = word_obj.get("word").and_then(|v| v.as_str()) {
                                            let start_ms = word_obj
                                                .get("start")
                                                .and_then(|v| v.as_f64())
                                                .map(|s| (s * 1000.0) as u64);
                                            let end_ms = word_obj
                                                .get("end")
                                                .and_then(|v| v.as_f64())
                                                .map(|e| (e * 1000.0) as u64);
                                            let confidence = word_obj
                                                .get("confidence")
                                                .and_then(|v| v.as_f64())
                                                .map(|c| c as f32);

                                            words.push(Word2 {
                                                text: word_text.to_string(),
                                                speaker: None,
                                                confidence,
                                                start_ms,
                                                end_ms,
                                            });
                                        }
                                    }
                                }
                            }

                            // Fallback: if no words, segment the transcript
                            if words.is_empty() {
                                if let Some(transcript) = first_alt.get("transcript").and_then(|v| v.as_str()) {
                                    if !transcript.is_empty() {
                                        let confidence = first_alt
                                            .get("confidence")
                                            .and_then(|v| v.as_f64())
                                            .map(|c| c as f32);

                                        for text in segment_text(transcript) {
                                            words.push(Word2 {
                                                text,
                                                speaker: None,
                                                confidence,
                                                start_ms: None,
                                                end_ms: None,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(words)
    }

    pub async fn handle_websocket(
        self,
        ws: WebSocketUpgrade,
        params: Option<ListenParams>,
    ) -> Response<Body> {
        ws.on_upgrade(move |socket| self.handle_socket(socket, params))
            .into_response()
    }

    async fn handle_socket(self, socket: WebSocket, params: Option<ListenParams>) {
        let (mut sender, mut receiver) = socket.split();

        let _params = params.unwrap_or_default();

        let (audio_tx, audio_rx) = mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(100);

        let audio_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = receiver.next().await {
                match msg {
                    Message::Text(data) => {
                        if let Ok(chunk) = serde_json::from_str::<ListenInputChunk>(&data) {
                            match chunk {
                                ListenInputChunk::Audio { data } => {
                                    if !data.is_empty() {
                                        if audio_tx.send(Ok(data.into())).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                                ListenInputChunk::DualAudio { mic, speaker } => {
                                    let mixed = mix_audio(mic, speaker);
                                    if !mixed.is_empty() {
                                        if audio_tx.send(Ok(mixed.into())).await.is_err() {
                                            break;
                                        }
                                    }
                                }
                                ListenInputChunk::End => break,
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        });

        let audio_stream = tokio_stream::wrappers::ReceiverStream::new(audio_rx);

        let options = Options::builder()
            .model(Model::Nova2)
            .punctuate(true)
            .smart_format(true)
            .language(Language::en)
            .encoding(Encoding::Linear16)
            .build();

        match self
            .deepgram
            .transcription()
            .stream_request_with_options(options)
            .keep_alive()
            .sample_rate(16000)
            .channels(1)
            .stream(audio_stream)
            .await
        {
            Ok(mut deepgram_stream) => {
                while let Some(result) = deepgram_stream.next().await {
                    if let Ok(response) = result {
                        match response {
                            deepgram::common::stream_response::StreamResponse::TranscriptResponse {
                                channel,
                                ..
                            } => {
                                if let Some(first_alt) = channel.alternatives.first() {
                                    let mut words = Vec::new();

                                    if !first_alt.words.is_empty() {
                                        for word in &first_alt.words {
                                            words.push(Word2 {
                                                text: word.word.clone(),
                                                speaker: None,
                                                confidence: Some(word.confidence as f32),
                                                start_ms: Some((word.start * 1000.0) as u64),
                                                end_ms: Some((word.end * 1000.0) as u64),
                                            });
                                        }
                                    } else if !first_alt.transcript.is_empty() {
                                        for text in segment_text(&first_alt.transcript) {
                                            words.push(Word2 {
                                                text,
                                                speaker: None,
                                                confidence: Some(first_alt.confidence as f32),
                                                start_ms: None,
                                                end_ms: None,
                                            });
                                        }
                                    }

                                    if !words.is_empty() {
                                        let output_chunk = ListenOutputChunk { meta: None, words };

                                        if let Ok(json) = serde_json::to_string(&output_chunk) {
                                            if sender.send(Message::Text(json.into())).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to start Deepgram stream: {:?}", e);
            }
        }

        audio_task.abort();
        let _ = sender.close().await;
    }
}

impl Service<Request<Body>> for TranscribeService {
    type Response = Response<Body>;
    type Error = std::convert::Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let service = self.clone();

        Box::pin(async move {
            if req.headers().get("upgrade").and_then(|v| v.to_str().ok()) == Some("websocket") {
                let (parts, body) = req.into_parts();
                let axum_req = axum::extract::Request::from_parts(parts, body);

                match WebSocketUpgrade::from_request(axum_req, &()).await {
                    Ok(ws) => Ok(service.handle_websocket(ws, None).await),
                    Err(_) => Ok(Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .body(Body::from("Invalid WebSocket upgrade request"))
                        .unwrap()),
                }
            } else {
                Ok(Response::builder()
                    .status(StatusCode::METHOD_NOT_ALLOWED)
                    .body(Body::from("Only WebSocket connections are supported"))
                    .unwrap())
            }
        })
    }
}

fn mix_audio(mic: Vec<u8>, speaker: Vec<u8>) -> Vec<u8> {
    let len = mic.len().max(speaker.len());
    let mut mixed = Vec::with_capacity(len);

    for i in (0..len).step_by(2) {
        let mic_sample = if i + 1 < mic.len() {
            i16::from_le_bytes([mic[i], mic[i + 1]])
        } else {
            0
        };

        let speaker_sample = if i + 1 < speaker.len() {
            i16::from_le_bytes([speaker[i], speaker[i + 1]])
        } else {
            0
        };

        let mixed_sample = ((mic_sample as i32 + speaker_sample as i32) / 2) as i16;
        let bytes = mixed_sample.to_le_bytes();
        mixed.push(bytes[0]);
        mixed.push(bytes[1]);
    }

    mixed
}
