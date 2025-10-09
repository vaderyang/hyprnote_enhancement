use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};

use axum::{
    body::Body,
    extract::{
        ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade},
        FromRequest, Request,
    },
    http::{Response, StatusCode},
    response::IntoResponse,
};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use owhisper_interface::{
    Alternatives, Channel, ListenInputChunk, ListenParams, Metadata, SpeakerIdentity,
    StreamResponse, Word, Word2,
};
use serde_json::{self, Value};
use text_utils::segment_text;
use tokio_tungstenite::{
    connect_async,
    tungstenite::protocol::Message as WsMessage,
};
use tower::Service;
use uuid::Uuid;

#[derive(Clone)]
pub struct TranscribeService {
    client: reqwest::Client,
    ws_url: url::Url,
    http_url: url::Url,
    mode: String,
    chunk_size: [u32; 3],
    chunk_interval: u32,
    sample_rate: u32,
    input_sample_rate: u32,
    enable_speaker: bool,
}

impl TranscribeService {
    pub async fn new(config: owhisper_config::FunasrModelConfig) -> Result<Self, crate::Error> {
        let default_ws = "ws://172.16.103.100:10095";
        let default_http = "http://172.16.103.100:10001/recognition";

        let ws_url = config
            .ws_url
            .clone()
            .unwrap_or_else(|| default_ws.to_string())
            .parse()?;
        let http_url = config
            .http_url
            .clone()
            .unwrap_or_else(|| default_http.to_string())
            .parse()?;

        let chunk_size = config
            .chunk_size
            .clone()
            .unwrap_or_else(|| vec![5, 10, 5]);

        let chunk_size = [
            *chunk_size.get(0).unwrap_or(&5),
            *chunk_size.get(1).unwrap_or(&10),
            *chunk_size.get(2).unwrap_or(&5),
        ];

        Ok(Self {
            client: reqwest::Client::new(),
            ws_url,
            http_url,
            mode: config.mode.clone().unwrap_or_else(|| "2pass".to_string()),
            chunk_size,
            chunk_interval: config.chunk_interval.unwrap_or(10),
            sample_rate: config.sample_rate.unwrap_or(16_000),
            input_sample_rate: config.input_sample_rate.unwrap_or(44_100),
            enable_speaker: config.enable_speaker.unwrap_or(true),
        })
    }

    pub async fn transcribe_file(
        &self,
        audio_file_path: impl AsRef<std::path::Path>,
    ) -> Result<Vec<Word2>, crate::Error> {
        let file_name = audio_file_path
            .as_ref()
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("audio.wav")
            .to_string();

        let bytes = std::fs::read(audio_file_path.as_ref()).map_err(|err| {
            crate::Error::Custom(format!(
                "Failed to read audio file {}: {err}",
                audio_file_path.as_ref().to_string_lossy()
            ))
        })?;

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name.clone())
            .mime_str("application/octet-stream")
            .map_err(|err| crate::Error::Custom(format!("Failed to build multipart part: {err}")))?;

        let form = reqwest::multipart::Form::new()
            .part("audio", part)
            .text("mode", "offline".to_string())
            .text("enable_speaker", self.enable_speaker.to_string())
            .text("itn", "true".to_string());

        let response = self
            .client
            .post(self.http_url.clone())
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(crate::Error::Custom(format!(
                "FunASR transcription failed with {status}: {body}"
            )));
        }

        let value: Value = response.json().await?;

        Ok(parse_offline_response(value))
    }

    pub async fn transcribe_file_with_config(
        config: owhisper_config::FunasrModelConfig,
        audio_file_path: impl AsRef<std::path::Path>,
    ) -> Result<Vec<Word2>, crate::Error> {
        let service = Self::new(config).await?;
        service.transcribe_file(audio_file_path).await
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
        let _params = params.unwrap_or_default();

        let (mut app_sender, mut app_receiver) = socket.split();

        let ws_url = self.ws_url.clone();
        let mut config_message = serde_json::Map::new();
        config_message.insert("mode".into(), Value::String(self.mode.clone()));
        config_message.insert(
            "chunk_size".into(),
            Value::Array(
                self.chunk_size
                    .iter()
                    .map(|v| Value::Number((*v).into()))
                    .collect(),
            ),
        );
        config_message.insert(
            "chunk_interval".into(),
            Value::Number(self.chunk_interval.into()),
        );
        config_message.insert(
            "audio_fs".into(),
            Value::Number(self.sample_rate.into()),
        );
        config_message.insert(
            "wav_name".into(),
            Value::String(format!("stream_{}", Uuid::new_v4())),
        );
        config_message.insert("wav_format".into(), Value::String("pcm".into()));
        config_message.insert("is_speaking".into(), Value::Bool(true));
        config_message.insert("hotwords".into(), Value::String(String::new()));
        config_message.insert("itn".into(), Value::Bool(true));
        config_message.insert(
            "enable_speaker".into(),
            Value::Bool(self.enable_speaker),
        );

        let (funasr_stream, _) = match connect_async(ws_url.as_str()).await {
            Ok(result) => result,
            Err(err) => {
                tracing::error!("Failed to connect to FunASR WebSocket: {err}");
                let _ = app_sender.close().await;
                return;
            }
        };

        let (mut funasr_writer, mut funasr_reader) = funasr_stream.split();

        if let Err(err) = funasr_writer
            .send(WsMessage::Text(
                Value::Object(config_message.clone()).to_string().into(),
            ))
            .await
        {
            tracing::error!("Failed to send FunASR config: {err}");
            let _ = app_sender.close().await;
            return;
        }

        let writer_task = tokio::spawn(async move {
            while let Some(message) = app_receiver.next().await {
                let Ok(message) = message else {
                    continue;
                };

                match message {
                    AxumMessage::Text(payload) => {
                        if let Ok(chunk) = serde_json::from_str::<ListenInputChunk>(&payload) {
                            match chunk {
                                ListenInputChunk::Audio { data } => {
                                    if !data.is_empty() {
                                        let processed = process_audio_chunk(
                                            &data,
                                            self.input_sample_rate,
                                            self.sample_rate,
                                        );
                                        if !processed.is_empty()
                                            && funasr_writer
                                                .send(WsMessage::Binary(Bytes::from(processed)))
                                                .await
                                                .is_err()
                                        {
                                            break;
                                        }
                                    }
                                }
                                ListenInputChunk::DualAudio { mic, speaker } => {
                                    let mixed = mix_audio(mic, speaker);
                                    let processed = process_audio_chunk(
                                        &mixed,
                                        self.input_sample_rate,
                                        self.sample_rate,
                                    );
                                    if !processed.is_empty()
                                        && funasr_writer
                                            .send(WsMessage::Binary(Bytes::from(processed)))
                                            .await
                                            .is_err()
                                    {
                                        break;
                                    }
                                }
                                ListenInputChunk::End => {
                                    let _ = funasr_writer
                                        .send(WsMessage::Text(
                                            serde_json::json!({"is_speaking": false})
                                                .to_string()
                                                .into(),
                                        ))
                                        .await;
                                    break;
                                }
                            }
                        }
                    }
                    AxumMessage::Binary(binary) => {
                        let processed = process_audio_chunk(
                            &binary,
                            self.input_sample_rate,
                            self.sample_rate,
                        );
                        if !processed.is_empty()
                            && funasr_writer
                                .send(WsMessage::Binary(Bytes::from(processed)))
                                .await
                                .is_err()
                        {
                            break;
                        }
                    }
                    AxumMessage::Close(_) => {
                        let _ = funasr_writer
                            .send(WsMessage::Text(
                                serde_json::json!({"is_speaking": false})
                                    .to_string()
                                    .into(),
                            ))
                            .await;
                        break;
                    }
                    AxumMessage::Ping(data) => {
                        let _ = funasr_writer.send(WsMessage::Ping(data)).await;
                    }
                    AxumMessage::Pong(data) => {
                        let _ = funasr_writer.send(WsMessage::Pong(data)).await;
                    }
                }
            }

            let _ = funasr_writer
                .send(WsMessage::Text(
                    serde_json::json!({"is_speaking": false}).to_string().into(),
                ))
                .await;
            let _ = funasr_writer.close().await;
        });

        let mut word_offset = 0.0_f64;

        while let Some(message) = funasr_reader.next().await {
            match message {
                Ok(WsMessage::Text(payload)) => {
                    if let Some(response) = parse_streaming_response(&payload, &mut word_offset) {
                        if let Ok(json) = serde_json::to_string(&response) {
                            if app_sender
                                .send(AxumMessage::Text(json.into()))
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                    }
                }
                Ok(WsMessage::Binary(_)) => {
                    // ignore binary metadata from server
                }
                Ok(WsMessage::Frame(_)) => {
                    // ignore low-level frames
                }
                Ok(WsMessage::Ping(data)) => {
                    let _ = app_sender.send(AxumMessage::Ping(data)).await;
                }
                Ok(WsMessage::Pong(data)) => {
                    let _ = app_sender.send(AxumMessage::Pong(data)).await;
                }
                Ok(WsMessage::Close(_)) => break,
                Err(err) => {
                    tracing::error!("FunASR stream error: {err}");
                    break;
                }
            }
        }

        let _ = writer_task.await;
        let _ = app_sender.close().await;
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
            if req.headers()
                .get("upgrade")
                .and_then(|v| v.to_str().ok())
                == Some("websocket")
            {
                let (parts, body) = req.into_parts();
                let axum_req = Request::from_parts(parts, body);

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

fn parse_streaming_response(payload: &str, offset_tracker: &mut f64) -> Option<StreamResponse> {
    let value: Value = serde_json::from_str(payload).ok()?;
    if value.get("error").is_some() {
        tracing::warn!("FunASR error message: {}", payload);
        return None;
    }

    let text = value.get("text").and_then(Value::as_str)?.trim().to_string();
    if text.is_empty() {
        return None;
    }

    let is_final = value
        .get("is_final")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let speaker_label = value.get("speaker").and_then(Value::as_str).unwrap_or("S0");
    let speaker_idx = parse_speaker_index(speaker_label);

    let start_offset = *offset_tracker;
    let (words, next_offset) = build_stream_words(&text, start_offset, speaker_idx);

    if is_final {
        *offset_tracker = next_offset;
    }

    let alternatives = Alternatives {
        transcript: text,
        words,
        confidence: 0.0,
        languages: vec![],
    };

    Some(StreamResponse::TranscriptResponse {
        type_field: "Results".to_string(),
        start: start_offset,
        duration: 0.0,
        is_final,
        speech_final: is_final,
        from_finalize: is_final,
        channel: Channel {
            alternatives: vec![alternatives],
        },
        metadata: Metadata::default(),
        channel_index: vec![speaker_idx],
    })
}

fn build_stream_words(text: &str, start_offset: f64, speaker_idx: i32) -> (Vec<Word>, f64) {
    let mut cursor = start_offset;
    let step = 0.45_f64;
    let mut words = Vec::new();

    for token in text.split_whitespace() {
        let cleaned = token.trim_matches(|c: char| c == '\n');
        if cleaned.is_empty() {
            continue;
        }
        let end = cursor + step;
        words.push(Word {
            word: cleaned.to_string(),
            start: cursor,
            end,
            confidence: 0.9,
            speaker: Some(speaker_idx),
            punctuated_word: Some(cleaned.to_string()),
            language: None,
        });
        cursor = end;
    }

    (words, cursor)
}

fn parse_offline_response(value: Value) -> Vec<Word2> {
    if let Some(segments) = value
        .get("speaker_segments")
        .and_then(Value::as_array)
    {
        let mut words = Vec::new();
        for segment in segments {
            if let Some(text) = segment.get("text").and_then(Value::as_str) {
                let speaker = segment
                    .get("speaker")
                    .and_then(Value::as_str)
                    .map(to_speaker_identity);

                let start_ms = segment
                    .get("start_time")
                    .and_then(Value::as_f64)
                    .map(|v| (v * 1000.0) as u64);
                let end_ms = segment
                    .get("end_time")
                    .and_then(Value::as_f64)
                    .map(|v| (v * 1000.0) as u64);

                for chunk in segment_text(text) {
                    if chunk.trim().is_empty() {
                        continue;
                    }
                    words.push(Word2 {
                        text: chunk.trim().to_string(),
                        speaker: speaker.clone(),
                        confidence: None,
                        start_ms,
                        end_ms,
                    });
                }
            }
        }

        if !words.is_empty() {
            return words;
        }
    }

    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return segment_text(text)
            .into_iter()
            .filter(|segment| !segment.trim().is_empty())
            .map(|segment| Word2 {
                text: segment.trim().to_string(),
                speaker: None,
                confidence: None,
                start_ms: None,
                end_ms: None,
            })
            .collect();
    }

    Vec::new()
}

fn parse_speaker_index(label: &str) -> i32 {
    let trimmed = label.trim();
    trimmed
        .trim_start_matches(|c: char| c == 'S' || c == 's')
        .parse::<i32>()
        .unwrap_or(0)
}

fn to_speaker_identity(label: &str) -> SpeakerIdentity {
    let trimmed = label.trim();
    if let Some(number) = trimmed
        .trim_start_matches(|c: char| c == 'S' || c == 's')
        .parse::<u8>()
        .ok()
    {
        SpeakerIdentity::Unassigned { index: number }
    } else {
        SpeakerIdentity::Assigned {
            id: trimmed.to_string(),
            label: trimmed.to_string(),
        }
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

fn process_audio_chunk(data: &[u8], input_rate: u32, target_rate: u32) -> Vec<u8> {
    if data.is_empty() {
        return Vec::new();
    }

    if input_rate == target_rate {
        return data.to_vec();
    }

    let samples = bytes_to_i16_samples(data);
    let resampled = resample_linear_i16(&samples, input_rate, target_rate);
    i16_samples_to_bytes(&resampled)
}

fn bytes_to_i16_samples(data: &[u8]) -> Vec<i16> {
    data.chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect()
}

fn i16_samples_to_bytes(samples: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

fn resample_linear_i16(samples: &[i16], input_rate: u32, target_rate: u32) -> Vec<i16> {
    if samples.is_empty() || input_rate == target_rate {
        return samples.to_vec();
    }

    let ratio = target_rate as f64 / input_rate as f64;
    let output_len = (samples.len() as f64 * ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 / ratio;
        let idx = src_pos.floor() as usize;
        let frac = src_pos - idx as f64;

        let s0 = samples.get(idx).copied().unwrap_or(*samples.last().unwrap_or(&0)) as f64;
        let s1 = samples
            .get(idx + 1)
            .copied()
            .unwrap_or(*samples.last().unwrap_or(&0)) as f64;

        let interpolated = s0 + (s1 - s0) * frac;
        output.push(interpolated.clamp(i16::MIN as f64, i16::MAX as f64) as i16);
    }

    output
}
