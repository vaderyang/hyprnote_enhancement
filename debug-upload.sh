#!/bin/bash
# Debug script to help troubleshoot audio upload issues
# This will show all relevant logs when you test the upload feature

echo "=================================================="
echo "Audio Upload Debug Monitor"
echo "=================================================="
echo ""
echo "This script will monitor backend logs for upload activity."
echo ""
echo "INSTRUCTIONS:"
echo "1. Run the app in dev mode in ANOTHER terminal:"
echo "   cd apps/desktop && pnpm run tauri dev"
echo ""
echo "2. Try uploading an audio file in the app"
echo ""
echo "3. Watch this terminal for backend logs"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo "=================================================="
echo ""

# Check if app is running
if ! pgrep -f "tauri dev" > /dev/null; then
    echo "⚠️  WARNING: tauri dev doesn't appear to be running!"
    echo "   Please start it in another terminal first:"
    echo "   cd apps/desktop && pnpm run tauri dev"
    echo ""
fi

# Monitor the system log for our app's output
echo "Monitoring logs... (waiting for upload activity)"
echo ""

# Use 'log stream' to capture our app's logs
log stream --predicate 'processImagePath CONTAINS "Pinote"' --style compact --color always 2>/dev/null | while read -r line; do
    # Filter for relevant log lines
    if echo "$line" | grep -qiE "transcribe|upload|audio|stt|whisper|provider|file.*path|progress|word|error"; then
        echo "$line"
    fi
done

# Fallback if log stream doesn't work
if [ $? -ne 0 ]; then
    echo "System log streaming not available, showing manual instructions:"
    echo ""
    echo "To see backend logs manually:"
    echo "1. Look at the terminal where you ran 'pnpm run tauri dev'"
    echo "2. Backend logs will show lines like:"
    echo "   INFO transcribe_audio_file called with file: /path/to/file"
    echo "   INFO Provider: Local"
    echo "   INFO Using Local Whisper provider"
    echo ""
    echo "To see frontend logs:"
    echo "1. Right-click in the app and select 'Inspect Element'"
    echo "2. Go to the Console tab"
    echo "3. Look for lines starting with [Upload]"
    echo ""
fi
