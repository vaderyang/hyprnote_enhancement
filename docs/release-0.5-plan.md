# Pinote Release 0.5 Execution Plan

**Created:** 2025-10-05T14:27:50Z
**Branch:** release-0.5 (based on fix/local-stt-start-on-focus)
**Author:** AI Agent Mode

## Overview

This release includes:
1. New Pinote logo design (knowledge-themed, simple, memorable)
2. Fixed compilation warnings (Vite and Rust)
3. Added Netis Global LLM API provider option
4. CI/CD integration for Netis Global API key

## Tasks

### 1. Save this plan to repo and create release branch ✓
- Create docs directory if missing
- Save plan as docs/release-0.5-plan.md
- Create release-0.5 branch from fix/local-stt-start-on-focus
- Push upstream

### 2. Design a new simple Pinote logo (knowledge and note-taking theme)
**Concept:** A note card with a pin forming a stylized letter P, and three small connected dots inside the card to suggest knowledge graph or intelligence. Minimal, geometric, and scalable.

**Design specs:**
- Vector master at `apps/desktop/public/assets/logo.svg`
- Color palette: Primary indigo-600 (#4C6FFF), Accent amber-400 (#F59E0B)
- No text/letters inside icon for scalability
- Maximum 2 colors
- Integer px stroke widths and whole-pixel coordinates

### 3. Generate Tauri icon assets and replace stable icons
- Generate 1024px PNG from SVG using @resvg/resvg-js
- Use `pnpm tauri icon` to generate platform icon sets
- Copy outputs to `src-tauri/icons/stable/` directory
- Required files: 32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico

### 4. Fix Vite mixed dynamic and static import warnings
**Modules to fix:**
- `plugins/db/js/index.ts`
- `@tauri-apps/plugin-shell`
- `plugins/mcp/js/index.ts`

**Approach:** Use type-only imports for types, keep only dynamic OR static imports (not both) for runtime code.

### 5. Eliminate Rust compiler warnings
- Run `cargo clippy --all-targets --all-features -- -D warnings`
- Fix unused imports, variables, deprecated APIs, unused Results
- Ensure zero warnings on `cargo build`

### 6. Add Netis Global provider UI to llm-custom-view
**Requirements:**
- Separate accordion alongside existing "Netis" accordion
- API Base URL: `https://llm.netis.io/v1` (hidden)
- API Key: from `VITE_NETIS_GLOBAL_API_KEY` env var (hidden)
- Default model: `qwen-3-coder-480b`
- Auto-fetch models on accordion open
- Show only Model selector to user

**Implementation:**
- Follow existing Netis accordion pattern
- Use provider key `netis-global`
- Fetch models from `/v1/models` endpoint with Bearer auth
- Auto-configure when opened

### 7. Add Netis Global env variable to example files and CI
**Local environment:**
- Add `VITE_NETIS_GLOBAL_API_KEY=` to .env.example files
- Update import.meta.env types (vite-env.d.ts)

**CI workflow:**
- Update `.github/workflows/desktop_cd.yaml`
- Add env mapping: `VITE_NETIS_GLOBAL_API_KEY: ${{ secrets.VITE_NETIS_GLOBAL_API_KEY }}`
- Secret value: `sk-AV8D-ymetzBfix7OCKsV8A`

### 8. Build and verify
**Desktop build:**
- `pnpm --filter desktop build` - no warnings
- `cargo build` - zero warnings

**Logo verification:**
- Check app icon on macOS (icon.icns)
- Check Windows executable icon (icon.ico)
- Verify in-app favicon/window icon

**Netis Global verification:**
- Launch app, go to Settings → LLM
- Open Netis Global accordion
- Verify model list auto-populates
- Verify default model qwen3-coder-480b is selected

### 9. Optional: Push branch and open PR
- Ensure release-0.5 is up to date on origin
- Open PR with summary of changes
- Link to this plan for traceability

## Notes

This plan follows project rules:
- Major feature commits before next move (rule c7g9oHJ3LAej83tnNf7y8a)
- Complex plan saved to file first (rule n9Qz7QN2xg2DUzFTDG3tqB)
- Complete job execution without user guidance (rule 7N67Q7yc1R0hjtc5wmCi7r)

## API Key Security

The Netis Global API key (`sk-AV8D-ymetzBfix7OCKsV8A`) will be:
- Stored as environment variable `VITE_NETIS_GLOBAL_API_KEY`
- Added to CI/CD secrets
- Never committed to repository
- Hidden from UI (pre-filled internally)
