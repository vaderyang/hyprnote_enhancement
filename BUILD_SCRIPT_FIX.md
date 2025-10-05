# Build Script Fix - xattr Error Resolution

## Problem
The `build-pinote.sh` script was failing with this error:
```
failed to bundle project: failed to remove extra attributes from app bundle: `failed to run xattr`
```

## Root Cause
The `xattr` command from Anaconda/Python was in the PATH before the system `xattr` command. The Python version doesn't support the same arguments that macOS code signing expects.

## Solution
Update your `build-pinote.sh` script with these changes:

### 1. Add PATH Priority (after the shebang)
```bash
#!/bin/bash
# Build script for Pinote with embedded API keys
# This file is not tracked in git for security

set -e

# Ensure we use system tools, not Anaconda/Python versions
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"

export NETIS_API_KEY="your-key-here"
export POSTHOG_API_KEY="dummy"
export AM_API_KEY="dummy"
```

### 2. Update xattr Cleanup Command
Change:
```bash
find "apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app" -exec xattr -c {} \; 2>/dev/null || true
```

To:
```bash
/usr/bin/xattr -cr "apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app" 2>/dev/null || true
```

### 3. Handle DMG Failure Gracefully
The DMG creation might fail, but the .app bundle is still usable. Update the build command section:

```bash
echo "Building Pinote with environment configuration..."
if pnpm -F desktop tauri:build 2>&1 | tee /tmp/pinote-build.log; then
    BUILD_SUCCESS=true
else
    # Check if app bundle was created despite DMG failure
    if [ -d "apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app" ]; then
        echo ""
        echo "⚠️  Warning: DMG creation failed, but app bundle was built successfully"
        BUILD_SUCCESS=true
    else
        echo ""
        echo "❌ Build failed. Trying to clean xattr and retry..."
        /usr/bin/xattr -cr "apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app" 2>/dev/null || true
        pnpm -F desktop tauri:build
        BUILD_SUCCESS=true
    fi
fi

if [ "$BUILD_SUCCESS" = true ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo "Bundles located at:"
    if [ -f "apps/desktop/src-tauri/target/release/bundle/dmg/Pinote Dev_0.3.0_aarch64.dmg" ]; then
        echo "  - apps/desktop/src-tauri/target/release/bundle/dmg/Pinote Dev_0.3.0_aarch64.dmg"
    fi
    echo "  - apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app"
    echo ""
fi
```

## Complete Updated Script
See the reference implementation in your local `build-pinote.sh` file (updated as of 2025-10-05).

## Why This Works
1. **PATH Priority**: System tools come first, preventing Anaconda's Python xattr from being used
2. **Explicit Path**: Using `/usr/bin/xattr` ensures we always use the system version
3. **Graceful Degradation**: DMG failures don't stop the build since the .app is the main deliverable
4. **Better UX**: Clear success/warning/error messages with emoji indicators

## Testing
Run the script:
```bash
./build-pinote.sh
```

You should see:
- ✅ Success message even if DMG creation fails
- The .app bundle at `apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app`
- No xattr errors during bundling

## Alternative: Manual Build
If you prefer to avoid the script issues, you can build manually:
```bash
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
export NETIS_API_KEY="your-key-here"
export POSTHOG_API_KEY="dummy"
export AM_API_KEY="dummy"

cd apps/desktop
pnpm tauri build
```
