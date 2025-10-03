# Security Notice

## API Key Exposure

**Note:** Previous commits in this repository contained hardcoded API keys in plaintext. These keys have been moved to build-time environment variables as of commit `535c537d`.

### Affected Commits:
- `00d4b8a1` - fix: update Netis LLM configuration with correct credentials
- `9c270d2e` - feat: customize UI for Netis production deployment
- Earlier commits in the `release-0.3` and `production-netis-customization` branches

### Mitigation:
1. **The exposed API key should be rotated immediately** by the Netis administrator
2. All builds now use environment variables instead of hardcoded keys
3. Use the provided `build-pinote.sh` script for builds (not tracked in git)

### Current Security Measures:
- API keys are now loaded from `NETIS_API_KEY` environment variable at build time
- The build script `build-pinote.sh` contains secrets and is gitignored
- Rust command `get_netis_api_key()` retrieves key from build config

### For Developers:
To build with the correct API key:
```bash
./build-pinote.sh
```

Or manually:
```bash
NETIS_API_KEY="your-key-here" pnpm -F desktop tauri:build
```

## Recommendation:
If this repository is public or the API key has significant access, **rotate the Netis API key immediately**.
