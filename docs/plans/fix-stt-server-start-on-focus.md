# Fix Plan: ServerAlreadyRunning Error on Focus

## Problem Description

The app logs two types of `ServerAlreadyRunning` errors:

1. **First error on app start** (timestamp: 2025-10-05T10:43:39.244217Z)
   - The main window `Focused` event tries to start the STT server
   - But the server was already started earlier (log shows "server_started" at 10:43:36.168436Z)
   - Results in: `ERROR tauri_plugin_local_stt::events: server_start_failed: ServerAlreadyRunning`

2. **Second error during audio upload** (timestamp: 2025-10-05T10:44:01.081857Z)
   - User triggers the upload audio transcription feature
   - File picker dialog causes focus events when opening/closing
   - Focus event handler tries to start server again
   - Results in another: `ERROR tauri_plugin_local_stt::events: server_start_failed: ServerAlreadyRunning`
   - Additionally, transcription has no response after file is picked

## Root Causes

1. **Unguarded server start in `on_event` handler**
   - Location: `plugins/local-stt/src/events.rs`, lines 20-29
   - The `WindowEvent::Focused(true)` handler unconditionally calls `app.start_server(None).await`
   - No check if server is already running
   - No graceful handling of `ServerAlreadyRunning` error

2. **Multiple focus events during file picker**
   - Native file picker dialogs trigger window focus events
   - Each focus event triggers server start attempt
   - Causes repeated error logs

3. **Server lifecycle management**
   - Server can be started from multiple places:
     - Initial app setup
     - `ListenerActor::pre_start` (plugins/listener/src/actors/listener.rs:65)
     - Window focus events (the problematic one)
   - No coordination between these start attempts

## Solution Design

### Primary Fix: Guard server start on focus

**File:** `plugins/local-stt/src/events.rs`

**Changes:**
1. Check provider before attempting to start server
   - Skip for `Provider::Custom` (Deepgram/external services)
   - Only proceed for `Provider::Local`

2. Check if server is already running before starting
   - Call `app.get_servers().await`
   - Inspect `ServerHealth` to determine if server is ready
   - Skip start if already running

3. Handle `ServerAlreadyRunning` gracefully
   - Treat as info, not error (race condition protection)
   - Log at info level instead of error level

**Implementation strategy:**
```rust
// Pseudocode
if window_focused {
    // 1. Check provider
    if provider != Local {
        return; // Skip for Custom/Deepgram
    }
    
    // 2. Check if already running
    if server_already_running() {
        log_info("server already running, skip start");
        return;
    }
    
    // 3. Try to start, handle race condition
    match app.start_server(None).await {
        Ok(_) => log_info("server started"),
        Err(ServerAlreadyRunning) => log_info("already running (race)"),
        Err(e) => log_error("start failed: {}", e),
    }
}
```

### Optional Enhancement: Make start_server idempotent

**File:** `plugins/local-stt/src/ext.rs`

**Changes:**
- In `start_server` method (around lines 233-355)
- Where `registry::where_is` checks are performed (lines ~263, ~289)
- Instead of returning `Err(ServerAlreadyRunning)`
- Return `Ok(existing_base_url)` when actor is already registered
- Benefits all callers, not just the focus event handler

**Trade-offs:**
- Pro: Simplifies all calling code
- Pro: More idempotent API design
- Con: Changes behavior for existing callers who may rely on the error
- Decision: Optional - fix in events.rs is sufficient

## Implementation Steps

1. ✅ Save this plan (per project rules)
2. Commit current changes as snapshot
3. Create working branch
4. Inspect `ServerHealth` structure to understand "running" predicate
5. Implement guarded server start in `events.rs`
6. (Optional) Make `start_server` idempotent in `ext.rs`
7. Build and lint
8. Validate scenarios:
   - App startup and focus
   - File picker during transcription
   - Server management commands
9. Commit fix
10. Open PR

## Testing Scenarios

### Scenario 1: App startup
- Start app
- Observe first focus logs "server_started"
- Switch away and back to app
- Observe subsequent focus logs "already_running" (not error)

### Scenario 2: Audio upload with file picker
- Set provider to Local
- Trigger upload audio transcription
- Open file picker (causes focus events)
- Pick a file
- Verify:
  - No `ServerAlreadyRunning` errors in logs
  - Transcription completes successfully
  - Words are returned

### Scenario 3: Provider switching
- Start with Custom provider
- Focus window → should log "skip starting local server"
- Switch to Local provider
- Focus window → should start server once
- Focus again → should log "already_running"

### Scenario 4: Server stop/restart
- Call `stop_server` command
- Focus window
- Should start server successfully
- Focus again
- Should log "already_running"

## Success Criteria

- ✅ No `ERROR ... server_start_failed: ServerAlreadyRunning` in logs
- ✅ Server starts once per app lifecycle (unless explicitly stopped)
- ✅ Focus events after server is running produce info logs, not errors
- ✅ Audio upload transcription works for both providers
- ✅ File picker focus events don't cause error logs

## Related Files

- `plugins/local-stt/src/events.rs` - Primary fix location
- `plugins/local-stt/src/ext.rs` - Server start implementation (optional enhancement)
- `plugins/local-stt/src/error.rs` - Error types
- `plugins/local-stt/src/server/*.rs` - ServerHealth definition
- `plugins/local-stt/src/commands.rs` - transcribe_audio_file command
- `plugins/listener/src/actors/listener.rs` - Another place that starts server

## References

- Original error logs timestamp: 2025-10-05T10:43:39 and 10:44:01
- User rule: Commit major features before next move
- User rule: Merge multiple git commands to save requests
