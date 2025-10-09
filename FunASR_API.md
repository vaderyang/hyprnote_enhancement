# FunASR Streaming API Developer Guide

Quick API reference for streaming speech recognition with speaker identification.

## API Endpoints

### WebSocket Streaming API
```
ws://172.16.103.100:10095
```

### HTTP File API
```
http://172.16.103.100:10001/recognition
```

## Quick Start

### 1. Connect to Server
```python
import asyncio
import websockets
import json

SERVER_IP = "192.168.1.100"  # Replace with your server IP
SERVER_PORT = 10095

async def connect():
    uri = f"ws://{SERVER_IP}:{SERVER_PORT}"
    websocket = await websockets.connect(uri)
    return websocket
```

### 2. Send Configuration
```python
config = {
    "mode": "2pass",                    # "offline", "online", "2pass"
    "chunk_size": [5, 10, 5],           # 600ms chunks
    "chunk_interval": 10,
    "audio_fs": 16000,                  # Sample rate
    "wav_name": "stream_001",
    "wav_format": "pcm",
    "is_speaking": True,
    "hotwords": "",                     # Optional hotwords
    "itn": True,                        # Enable punctuation
    "enable_speaker": True              # Enable speaker identification
}

await websocket.send(json.dumps(config))
```

### 3. Stream Audio
```python
# Send audio in 600ms chunks
chunk_size = int(16000 * 0.6)  # 9600 samples at 16kHz

# Stream audio data
await websocket.send(audio_chunk_bytes)

# Send end signal
await websocket.send(json.dumps({"is_speaking": False}))
```

### 4. Receive Results
```python
result = await websocket.recv()
data = json.loads(result)

# Basic transcription
if "text" in data:
    print(f"Text: {data['text']}")
    print(f"Final: {data.get('is_final', False)}")

# Speaker information
if "speaker" in data:
    print(f"Speaker: {data['speaker']}")

# Speaker embedding (for identification)
if "spk_embedding" in data:
    embedding = data['spk_embedding']
```

## Complete Examples

### Real-time Microphone Streaming
```python
import asyncio
import websockets
import json
import pyaudio
import numpy as np

SERVER_IP = "192.168.1.100"  # Change this

class MicrophoneStreamer:
    def __init__(self):
        self.chunk_size = int(16000 * 0.6)  # 600ms
        self.sample_rate = 16000
        self.format = pyaudio.paInt16
        self.channels = 1

    async def stream(self):
        uri = f"ws://{SERVER_IP}:10095"

        async with websockets.connect(uri) as websocket:
            # Send config
            config = {
                "mode": "online",
                "chunk_size": [5, 10, 5],
                "audio_fs": self.sample_rate,
                "enable_speaker": True
            }
            await websocket.send(json.dumps(config))

            # Start microphone
            p = pyaudio.PyAudio()
            stream = p.open(format=self.format,
                          channels=self.channels,
                          rate=self.sample_rate,
                          input=True,
                          frames_per_buffer=self.chunk_size)

            print("🎤 Recording... Press Ctrl+C to stop")

            # Start receiving results
            receive_task = asyncio.create_task(self.receive_results(websocket))

            # Stream audio
            try:
                while True:
                    data = stream.read(self.chunk_size)
                    await websocket.send(data)
                    await asyncio.sleep(0.6)
            except KeyboardInterrupt:
                pass
            finally:
                # Send end signal
                await websocket.send(json.dumps({"is_speaking": False}))
                await asyncio.sleep(1)

                stream.stop_stream()
                stream.close()
                p.terminate()

    async def receive_results(self, websocket):
        while True:
            try:
                result = await websocket.recv()
                data = json.loads(result)

                if "text" in data:
                    speaker = data.get("speaker", "Unknown")
                    text = data["text"]
                    final = "(final)" if data.get("is_final") else ""
                    print(f"[{speaker}] {text} {final}")

            except websockets.exceptions.ConnectionClosed:
                break

# Usage
asyncio.run(MicrophoneStreamer().stream())
```

### File Streaming with Speaker ID
```python
import asyncio
import websockets
import json
import soundfile as sf

SERVER_IP = "192.168.1.100"  # Change this

async def stream_file(audio_file):
    uri = f"ws://{SERVER_IP}:10095"

    # Read audio file
    audio_data, sample_rate = sf.read(audio_file, dtype="int16")
    if sample_rate != 16000:
        print("⚠️ Audio will be resampled to 16kHz")

    chunk_size = int(16000 * 0.6)  # 600ms chunks

    async with websockets.connect(uri) as websocket:
        # Send configuration
        config = {
            "mode": "2pass",
            "chunk_size": [5, 10, 5],
            "audio_fs": 16000,
            "wav_name": audio_file,
            "wav_format": "pcm",
            "enable_speaker": True
        }
        await websocket.send(json.dumps(config))

        # Start receiving results
        results = []
        receive_task = asyncio.create_task(collect_results(websocket, results))

        # Stream audio
        total_chunks = len(audio_data) // chunk_size
        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i + chunk_size]
            if len(chunk) < chunk_size:
                chunk = np.pad(chunk, (0, chunk_size - len(chunk)))

            await websocket.send(chunk.tobytes())
            await asyncio.sleep(0.6)  # Real-time simulation

            if i // chunk_size % 10 == 0:
                print(f"Progress: {i//chunk_size}/{total_chunks} chunks")

        # Send end signal
        await websocket.send(json.dumps({"is_speaking": False}))
        await asyncio.sleep(2)  # Wait for final results

        return results

async def collect_results(websocket, results):
    while True:
        try:
            result = await websocket.recv()
            data = json.loads(result)

            if "text" in data:
                results.append({
                    "text": data["text"],
                    "speaker": data.get("speaker", "Unknown"),
                    "is_final": data.get("is_final", False),
                    "timestamp": data.get("timestamp", "")
                })
        except:
            break

# Usage
results = asyncio.run(stream_file("meeting.wav"))
for result in results:
    print(f"[{result['speaker']}] {result['text']}")
```

### HTTP File Upload (No Streaming)
```python
import requests

SERVER_IP = "192.168.1.100"  # Change this

def transcribe_file(audio_file):
    url = f"http://{SERVER_IP}:10001/recognition"

    with open(audio_file, 'rb') as f:
        files = [("audio", (audio_file, f, "application/octet-stream"))]
        response = requests.post(url, files=files)

    if response.status_code == 200:
        result = response.json()
        print(f"Text: {result.get('text', '')}")
        print(f"Speaker segments: {result.get('speaker_segments', [])}")
    else:
        print(f"Error: {response.status_code}")

transcribe_file("audio.wav")
```

## Response Format

### Basic Response
```json
{
  "text": "你好世界",
  "is_final": true,
  "timestamp": "12:34:56.789"
}
```

### With Speaker Info
```json
{
  "text": "今天天气很好",
  "is_final": true,
  "timestamp": "12:34:56.789",
  "speaker": "S01",
  "spk_embedding": [0.1, -0.2, 0.3, ...]  // 192-dim vector
}
```

### Error Response
```json
{
  "error": "Audio format not supported",
  "code": 400
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | string | "2pass" | "offline", "online", "2pass" |
| `chunk_size` | array | [5,10,5] | [lookback, current, lookahead] in 60ms units |
| `audio_fs` | int | 16000 | Audio sample rate |
| `enable_speaker` | bool | false | Enable speaker identification |
| `hotwords` | string | "" | Space-separated hotwords |
| `itn` | bool | true | Enable punctuation |

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request - invalid audio format |
| 408 | Request timeout |
| 429 | Too many requests |
| 500 | Internal server error |
| 503 | Service unavailable |

## Quick Test

```bash
# Test WebSocket server
python3 -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://172.16.103.100:10095') as ws:
        await ws.send(json.dumps({'mode':'offline','audio_fs':16000}))
        await ws.send(b'\x00\x00' * 9600)  # 600ms silence
        await ws.send(json.dumps({'is_speaking':False}))
        print(await ws.recv())
asyncio.run(test())
"
```


**WebSocket**: `ws://172.16.103.100:10095`
**HTTP**: `http://172.16.103.100:10001/recognition`

**Config**: Send JSON with mode, chunk_size, enable_speaker
**Stream**: Send 600ms audio chunks as bytes
**Results**: Receive JSON with text, speaker, is_final
