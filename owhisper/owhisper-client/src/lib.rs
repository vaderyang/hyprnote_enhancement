use futures_util::Stream;

use hypr_ws::client::{ClientRequestBuilder, Message, WebSocketClient, WebSocketIO};
use owhisper_interface::{ControlMessage, MixedMessage, StreamResponse};

fn interleave_audio(mic: &[u8], speaker: &[u8]) -> Vec<u8> {
    let mic_samples: Vec<i16> = mic
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();
    let speaker_samples: Vec<i16> = speaker
        .chunks_exact(2)
        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();

    let max_len = mic_samples.len().max(speaker_samples.len());
    let mut interleaved = Vec::with_capacity(max_len * 2 * 2);

    for i in 0..max_len {
        let mic_sample = mic_samples.get(i).copied().unwrap_or(0);
        let speaker_sample = speaker_samples.get(i).copied().unwrap_or(0);
        interleaved.extend_from_slice(&mic_sample.to_le_bytes());
        interleaved.extend_from_slice(&speaker_sample.to_le_bytes());
    }

    interleaved
}

#[derive(Default)]
pub struct ListenClientBuilder {
    api_base: Option<String>,
    api_key: Option<String>,
    params: Option<owhisper_interface::ListenParams>,
}

impl ListenClientBuilder {
    pub fn api_base(mut self, api_base: impl Into<String>) -> Self {
        self.api_base = Some(api_base.into());
        self
    }

    pub fn api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    pub fn params(mut self, params: owhisper_interface::ListenParams) -> Self {
        self.params = Some(params);
        self
    }

    fn build_uri(&self, channels: u8) -> String {
        let mut url: url::Url = self.api_base.as_ref().unwrap().parse().unwrap();

        if matches!(url.scheme(), "ws" | "wss") {
            return url.to_string();
        }

        let params = owhisper_interface::ListenParams {
            channels,
            ..self.params.clone().unwrap_or_default()
        };

        // Log transcription parameters
        println!("[STT API Request] Connecting to transcription service: {}", self.api_base.as_ref().unwrap());
        println!("[STT API Request] Parameters: channels={}, model={:?}, languages={:?}, timestamp={}",
            channels,
            params.model.as_ref().unwrap_or(&"hypr-whisper".to_string()),
            params.languages.iter().map(|l| l.iso639().code()).collect::<Vec<_>>(),
            chrono::Utc::now().to_rfc3339()
        );

        {
            let mut path = url.path().to_string();
            if !path.ends_with('/') {
                path.push('/');
            }
            path.push_str("v1/listen");
            url.set_path(&path);
        }

        {
            let mut query_pairs = url.query_pairs_mut();

            // https://developers.deepgram.com/docs/language-detection#restricting-the-detectable-languages
            // https://www.rfc-editor.org/info/bcp47
            match params.languages.len() {
                0 => {
                    query_pairs.append_pair("language", "zh");
                }
                1 => {
                    let code = params.languages[0].iso639().code();
                    query_pairs.append_pair("language", code);
                }
                _ => {
                    // https://developers.deepgram.com/docs/multilingual-code-switching
                    query_pairs.append_pair("language", "multi");
                //  multi language specification only and detect language not supported in streaming
                //     for lang in &params.languages {
                //         let code = lang.iso639().code();
                //         query_pairs.append_pair("detect_language", code);
                //     }
                }
            }

            let start_time_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
                .to_string();

            query_pairs
                // https://developers.deepgram.com/reference/speech-to-text-api/listen-streaming#request.query
                .append_pair("model", &params.model.unwrap_or("hypr-whisper".to_string()))
                .append_pair("channels", &channels.to_string())
                .append_pair("filler_words", "false")
                // .append_pair("interim_results", "true")
                .append_pair("mip_opt_out", "true")
                .append_pair("sample_rate", "16000")
                .append_pair("encoding", "linear16")
                // .append_pair("diarize", "true")
                .append_pair("multichannel", "true")
                .append_pair("punctuate", "true")
                .append_pair("smart_format", "true")
                .append_pair("vad_events", "false")
                // .append_pair("numerals", "true")
                .append_pair("extra", &format!("start_time:{}", start_time_ms));

            query_pairs.append_pair(
                "redemption_time_ms",
                &params.redemption_time_ms.unwrap_or(400).to_string(),
            );
        }

        let host = url.host_str().unwrap();

        if host.contains("127.0.0.1") || host.contains("localhost") {
            url.set_scheme("ws").unwrap();
        } else {
            url.set_scheme("ws").unwrap();
        }

        url.to_string()
    }

    fn build_request(self, channels: u8) -> ClientRequestBuilder {
        let uri = self.build_uri(channels).parse().unwrap();

        let request = match self.api_key {
            // https://github.com/deepgram/deepgram-rust-sdk/blob/d2f2723/src/lib.rs#L114-L115
            // https://github.com/deepgram/deepgram-rust-sdk/blob/d2f2723/src/lib.rs#L323-L324
            Some(key) => ClientRequestBuilder::new(uri)
                .with_header("Authorization", format!("Token {}", key)),
            None => ClientRequestBuilder::new(uri),
        };

        request
    }

    pub fn build_single(self) -> ListenClient {
        let request = self.build_request(1);
        ListenClient { request }
    }

    pub fn build_dual(self) -> ListenClientDual {
        let request = self.build_request(2);
        ListenClientDual { request }
    }
}

#[derive(Clone)]
pub struct ListenClient {
    request: ClientRequestBuilder,
}

type ListenClientInput = MixedMessage<bytes::Bytes, ControlMessage>;
type ListenClientDualInput = MixedMessage<(bytes::Bytes, bytes::Bytes), ControlMessage>;

impl WebSocketIO for ListenClient {
    type Data = ListenClientInput;
    type Input = ListenClientInput;
    type Output = StreamResponse;

    fn to_input(data: Self::Data) -> Self::Input {
        data
    }

    fn to_message(input: Self::Input) -> Message {
        match input {
            MixedMessage::Audio(data) => Message::Binary(data),
            MixedMessage::Control(control) => {
                Message::Text(serde_json::to_string(&control).unwrap().into())
            }
        }
    }

    fn from_message(msg: Message) -> Option<Self::Output> {
        match msg {
            Message::Text(text) => {
                let result = serde_json::from_str::<Self::Output>(&text);
                match &result {
                    Ok(response) => {
                        // Log successful transcription responses
                        match response {
                            owhisper_interface::StreamResponse::TranscriptResponse { is_final, channel, channel_index, .. } => {
                                if *is_final {
                                    println!("[STT API Response] Final transcript received: channel_index={:?}, words_count={}, timestamp={}",
                                        channel_index,
                                        channel.alternatives.get(0).map(|alt| alt.words.len()).unwrap_or(0),
                                        chrono::Utc::now().to_rfc3339()
                                    );
                                } else {
                                    println!("[STT API Response] Partial transcript received: channel_index={:?}, words_count={}, timestamp={}",
                                        channel_index,
                                        channel.alternatives.get(0).map(|alt| alt.words.len()).unwrap_or(0),
                                        chrono::Utc::now().to_rfc3339()
                                    );
                                }
                            }
                            _ => {
                                println!("[STT API Response] Non-transcript response received: timestamp={}", chrono::Utc::now().to_rfc3339());
                            }
                        }
                    }
                    Err(error) => {
                        println!("[STT API Error] Failed to parse response: {:?}, timestamp={}", error, chrono::Utc::now().to_rfc3339());
                    }
                }
                result.ok()
            },
            Message::Binary(data) => {
                println!("[STT API Response] Binary message received: {} bytes, timestamp={}", data.len(), chrono::Utc::now().to_rfc3339());
                None
            },
            _ => {
                println!("[STT API Response] Unknown message type received, timestamp={}", chrono::Utc::now().to_rfc3339());
                None
            },
        }
    }
}

#[derive(Clone)]
pub struct ListenClientDual {
    request: ClientRequestBuilder,
}

impl WebSocketIO for ListenClientDual {
    type Data = ListenClientDualInput;
    type Input = ListenClientInput;
    type Output = StreamResponse;

    fn to_input(data: Self::Data) -> Self::Input {
        match data {
            ListenClientDualInput::Audio((mic, speaker)) => {
                let interleaved = interleave_audio(&mic, &speaker);
                ListenClientInput::Audio(interleaved.into())
            }
            ListenClientDualInput::Control(control) => ListenClientInput::Control(control),
        }
    }

    fn to_message(input: Self::Input) -> Message {
        match input {
            ListenClientInput::Audio(data) => Message::Binary(data),
            ListenClientInput::Control(control) => {
                Message::Text(serde_json::to_string(&control).unwrap().into())
            }
        }
    }

    fn from_message(msg: Message) -> Option<Self::Output> {
        match msg {
            Message::Text(text) => {
                let result = serde_json::from_str::<Self::Output>(&text);
                match &result {
                    Ok(response) => {
                        // Log successful transcription responses
                        match response {
                            owhisper_interface::StreamResponse::TranscriptResponse { is_final, channel, channel_index, .. } => {
                                if *is_final {
                                    println!("[STT API Response] Final transcript received: channel_index={:?}, words_count={}, timestamp={}",
                                        channel_index,
                                        channel.alternatives.get(0).map(|alt| alt.words.len()).unwrap_or(0),
                                        chrono::Utc::now().to_rfc3339()
                                    );
                                } else {
                                    println!("[STT API Response] Partial transcript received: channel_index={:?}, words_count={}, timestamp={}",
                                        channel_index,
                                        channel.alternatives.get(0).map(|alt| alt.words.len()).unwrap_or(0),
                                        chrono::Utc::now().to_rfc3339()
                                    );
                                }
                            }
                            _ => {
                                println!("[STT API Response] Non-transcript response received: timestamp={}", chrono::Utc::now().to_rfc3339());
                            }
                        }
                    }
                    Err(error) => {
                        println!("[STT API Error] Failed to parse response: {:?}, timestamp={}", error, chrono::Utc::now().to_rfc3339());
                    }
                }
                result.ok()
            },
            Message::Binary(data) => {
                println!("[STT API Response] Binary message received: {} bytes, timestamp={}", data.len(), chrono::Utc::now().to_rfc3339());
                None
            },
            _ => {
                println!("[STT API Response] Unknown message type received, timestamp={}", chrono::Utc::now().to_rfc3339());
                None
            },
        }
    }
}

impl ListenClient {
    pub fn builder() -> ListenClientBuilder {
        ListenClientBuilder::default()
    }

    pub async fn from_realtime_audio(
        &self,
        audio_stream: impl Stream<Item = ListenClientInput> + Send + Unpin + 'static,
    ) -> Result<
        (
            impl Stream<Item = Result<StreamResponse, hypr_ws::Error>>,
            hypr_ws::client::WebSocketHandle,
        ),
        hypr_ws::Error,
    > {
        println!("[STT API Connection] Establishing WebSocket connection for single channel audio");
        let ws = WebSocketClient::new(self.request.clone());
        match ws.from_audio::<Self>(audio_stream).await {
            Ok(result) => {
                println!("[STT API Connection] WebSocket connection established successfully");
                Ok(result)
            },
            Err(error) => {
                println!("[STT API Error] Failed to establish WebSocket connection: {:?}", error);
                Err(error)
            }
        }
    }
}

impl ListenClientDual {
    pub async fn from_realtime_audio(
        &self,
        stream: impl Stream<Item = ListenClientDualInput> + Send + Unpin + 'static,
    ) -> Result<
        (
            impl Stream<Item = Result<StreamResponse, hypr_ws::Error>>,
            hypr_ws::client::WebSocketHandle,
        ),
        hypr_ws::Error,
    > {
        println!("[STT API Connection] Establishing WebSocket connection for dual channel audio");
        let ws = WebSocketClient::new(self.request.clone());
        match ws.from_audio::<Self>(stream).await {
            Ok(result) => {
                println!("[STT API Connection] WebSocket connection established successfully");
                Ok(result)
            },
            Err(error) => {
                println!("[STT API Error] Failed to establish WebSocket connection: {:?}", error);
                Err(error)
            }
        }
    }
}
