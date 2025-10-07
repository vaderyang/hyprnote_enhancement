# Building Pinote

## Quick Start

Use the provided build script (not tracked in git):

```bash
./build-pinote.sh
```

This script automatically sets the required environment variables and builds the application.

## Manual Build

If you need to build manually with custom settings:

```bash
export NETIS_API_KEY="your-api-key-here"
export POSTHOG_API_KEY="dummy"
export AM_API_KEY="dummy"
export VITE_NETIS_GLOBAL_API_KEY="your-api-key-here"

pnpm -F desktop tauri:build
```

## Build Output

Successful builds produce:
- **DMG Installer**: `apps/desktop/src-tauri/target/release/bundle/dmg/Pinote Dev_{version number}_aarch64.dmg`
- **macOS App**: `apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app`
- **Updater Bundle**: `apps/desktop/src-tauri/target/release/bundle/macos/Pinote Dev.app.tar.gz`

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NETIS_API_KEY` | Netis LLM API authentication | Required at build time |
| `VITE_NETIS_GLOBAL_API_KEY` | Netis Global LLM API authentication | Required at build time |
| `POSTHOG_API_KEY` | Analytics (currently disabled) | `dummy` |
| `AM_API_KEY` | Additional analytics | `dummy` |

## Security Notes

- **Never commit `build-pinote.sh`** - it contains secrets and is gitignored
- API keys are embedded at compile time from environment variables
- See `SECURITY.md` for information about previous key exposure

## Development Build

For development without embedding production keys:

```bash
# The build.rs will use a fallback key if NETIS_API_KEY is not set
pnpm -F desktop tauri:dev
```

## Troubleshooting

### Build timeout
Rust compilation can take 5-10 minutes on first build. Subsequent builds are faster due to caching.

### Missing API key error
If you see compilation errors about `NETIS_API_KEY`, make sure the environment variable is set before building.

### Signing warnings
The "TAURI_SIGNING_PRIVATE_KEY" warning can be safely ignored for local builds. It's only needed for production releases with auto-updates.
