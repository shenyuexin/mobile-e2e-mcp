# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**MCP transport:**
- Model Context Protocol clients - The published server speaks MCP over stdio through `@modelcontextprotocol/sdk`.
  - SDK/Client: `@modelcontextprotocol/sdk` in `packages/mcp-server/package.json`
  - Implementation: `packages/mcp-server/src/mcp-stdio-server.ts`
  - Entry point: `packages/mcp-server/src/bin-stdio.ts`

**Package distribution:**
- npm registry - The public package `@shenyuexin/mobile-e2e-mcp` is published from GitHub Actions.
  - Client: `pnpm publish` in `packages/mcp-server/package.json`
  - Workflow: `.github/workflows/release-mcp.yml`
  - Auth: `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`

**Source hosting / release automation:**
- GitHub - Repository, issues, releases, workflow automation, and PR metadata validation.
  - Integration points: `packages/mcp-server/package.json`, `.github/workflows/*.yml`, `scripts/validate-pr-capability-gate.mjs`
  - Auth: `GITHUB_TOKEN` in `.github/workflows/pr-capability-gate.yml` and `.github/workflows/release-mcp.yml`

**Cloud APIs:**
- Not detected. No OpenAI, Anthropic, Stripe, Supabase, AWS SDK, or other hosted application API client imports were found in tracked source under `packages/**` or `scripts/**`.

## Device & Runtime Dependencies

**Android runtime:**
- Android Debug Bridge (`adb`) - Device discovery, install, launch, reset, screenshots, screen recording, logs, crash capture, and diagnostics.
  - Implementation: `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/device-runtime-android.ts`, `packages/adapter-maestro/src/ui-runtime-android.ts`
  - CI usage: `.github/workflows/platform-smoke.yml`, `.github/workflows/real-device-acceptance.yml`

**iOS simulator runtime:**
- `xcrun simctl` - Simulator discovery, launch, install, reset, screenshots, screen recording, logs, crash lookup, and diagnostics.
  - Implementation: `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/device-runtime-ios.ts`
  - CI usage: `.github/workflows/platform-smoke.yml`, `.github/workflows/real-device-acceptance.yml`

**iOS UI control / hierarchy:**
- `idb` and `idb_companion` - Required for iOS UI tap, text input, hierarchy snapshots, and record-session snapshot support.
  - Implementation: `packages/adapter-maestro/src/ui-runtime-ios.ts`, `packages/adapter-maestro/src/toolchain-runtime.ts`
  - Guidance: `packages/adapter-maestro/src/doctor-guidance.ts`, `docs/guides/flow-generation.md`

**Flow runner:**
- Maestro CLI - Executes YAML flows and remains the baseline runner for smoke and sample validation.
  - Implementation references: `packages/adapter-maestro/src/doctor-guidance.ts`, `packages/adapter-maestro/src/harness-config.ts`, `packages/adapter-maestro/src/runner/README.md`
  - CI usage: `.github/workflows/platform-smoke.yml`
  - Local usage: `scripts/dev/*.sh`, `docs/showcase/README.md`

**OCR / vision fallback:**
- Apple Vision via `xcrun swift` - The OCR provider shells out to Swift, imports `Vision`, and runs on macOS only.
  - Implementation: `packages/adapter-vision/src/ocr/providers/mac-vision-ocr-provider.ts`
  - Verification: `.github/workflows/ocr-smoke.yml`, `scripts/sync-ocr-fixtures.ts`

**Performance tooling:**
- `trace_processor` - Host-side Perfetto trace analysis for Android performance capture.
  - Implementation: `packages/adapter-maestro/src/toolchain-runtime.ts`, `packages/adapter-maestro/src/performance-tools.ts`
- `xcrun xctrace` - iOS performance capture prerequisite.
  - Guidance: `packages/adapter-maestro/src/doctor-guidance.ts`

## Data Storage

**Databases:**
- None. Session state, leases, audits, action records, and failure indexes are stored on the local filesystem under `artifacts/**` through the stores exported by `packages/core/src/index.ts`.
  - Connection: Not applicable
  - Client: Filesystem APIs in `packages/core/src/session-store.ts`, `packages/core/src/device-lease-store.ts`, and related modules re-exported from `packages/core/src/index.ts`

**File Storage:**
- Local filesystem only.
  - Artifacts/evidence paths are constructed in `packages/adapter-maestro/src/harness-config.ts`, `packages/adapter-maestro/src/device-runtime.ts`, and `packages/core/src/index.ts`
  - CI uploads artifact bundles through `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, `.github/workflows/ocr-smoke.yml`, and `.github/workflows/real-device-acceptance.yml`

**Caching:**
- No application cache layer detected.
- GitHub Actions dependency caching is enabled for pnpm in `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, `.github/workflows/ocr-smoke.yml`, `.github/workflows/real-device-acceptance.yml`, and `.github/workflows/release-mcp.yml`.

## Authentication & Identity

**Auth Provider:**
- Custom local policy/session model, not an external identity provider.
  - Implementation: `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, `packages/mcp-server/src/policy-guard.ts`

**Automation identity:**
- GitHub Actions bot identity is used to commit changelog and `repomix-output.xml` syncs during release publishing.
  - Implementation: `.github/workflows/release-mcp.yml`

## Monitoring & Observability

**Error Tracking:**
- None detected as a third-party service.

**Logs:**
- Device logs, crash signals, diagnostics, screenshots, recordings, and timelines are captured locally through MCP tools and adapter runtime helpers.
  - Android/iOS log capture: `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/device-runtime-android.ts`, `packages/adapter-maestro/src/device-runtime-ios.ts`
  - Session/audit persistence: `packages/core/src/index.ts`
  - CI summaries and artifacts: `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, `.github/workflows/real-device-acceptance.yml`, `docs/showcase/ci-evidence.md`

## CI/CD & Deployment

**Hosting:**
- No hosted application deployment target detected.
- Distribution target is npm via the package in `packages/mcp-server/package.json`.

**CI Pipeline:**
- GitHub Actions.
  - `CI` in `.github/workflows/ci.yml` runs install, build, typecheck, unit tests, and smoke validation.
  - `Platform Smoke` in `.github/workflows/platform-smoke.yml` runs iOS simulator and Android emulator Maestro smoke flows.
  - `OCR Smoke` in `.github/workflows/ocr-smoke.yml` validates OCR fixtures and runs macOS OCR smoke tests.
  - `PR Capability Gate` in `.github/workflows/pr-capability-gate.yml` enforces PR metadata for guarded changes.
  - `Real Device Acceptance` in `.github/workflows/real-device-acceptance.yml` runs self-hosted macOS real-device / simulator acceptance validation.
  - `Release MCP Package` in `.github/workflows/release-mcp.yml` validates versioning, syncs changelog + `repomix-output.xml`, bundles, publishes to npm, and creates a GitHub release.

## Environment Configuration

**Required env vars:**
- `IDB_CLI_PATH` - Optional override for `idb` binary resolution (`packages/adapter-maestro/src/toolchain-runtime.ts`).
- `IDB_COMPANION_PATH` - Optional override for `idb_companion` resolution (`packages/adapter-maestro/src/toolchain-runtime.ts`).
- `TRACE_PROCESSOR_PATH` - Optional override for Perfetto trace processor resolution (`packages/adapter-maestro/src/toolchain-runtime.ts`).
- `NATIVE_ANDROID_APK_PATH` - Android sample APK location override (`packages/adapter-maestro/src/device-runtime.ts`, `scripts/dev/run-phase3-native-android.sh`).
- `NATIVE_IOS_APP_PATH` - iOS sample app bundle location override (`packages/adapter-maestro/src/device-runtime.ts`, `scripts/dev/run-phase3-native-ios.sh`).
- `FLUTTER_APK_PATH` - Flutter sample APK location override (`packages/adapter-maestro/src/device-runtime.ts`, `scripts/dev/run-phase3-flutter-android.sh`).
- `MAESTRO_DRIVER_STARTUP_TIMEOUT` - CI runtime tuning for iOS Maestro smoke in `.github/workflows/platform-smoke.yml`.
- `NODE_AUTH_TOKEN` - npm publish token in `.github/workflows/release-mcp.yml`.
- `GITHUB_TOKEN` - GitHub API auth in `.github/workflows/pr-capability-gate.yml` and `.github/workflows/release-mcp.yml`.

**Secrets location:**
- GitHub Actions secrets for `NPM_TOKEN` and `GITHUB_TOKEN` are referenced in workflow files under `.github/workflows/`.
- Local runtime overrides are expected from the developer shell environment; no checked-in secret file is used in tracked source.

## Package Publishing & Runtime Entry Points

**Package publishing:**
- Publishable package metadata lives in `packages/mcp-server/package.json`.
- Release prep scripts live in `scripts/release/prepare-mcp-release.ts`, `scripts/release/validate-mcp-release.ts`, and `scripts/release/sync-mcp-release-changelog.ts`.
- Bundle output is produced by `packages/mcp-server/tsup.config.ts`.

**Runtime entry points:**
- MCP stdio binary: `packages/mcp-server/src/bin-stdio.ts`
- MCP SDK stdio server: `packages/mcp-server/src/mcp-stdio-server.ts`
- Minimal JSON-line stdio server: `packages/mcp-server/src/stdio-server.ts`
- Developer CLI: `packages/mcp-server/src/dev-cli.ts`
- Repo-local wrapper CLI: `packages/cli/src/index.js`

## Webhooks & Callbacks

**Incoming:**
- GitHub Actions workflow triggers for push, pull request, tags, schedules, and manual dispatch in `.github/workflows/*.yml`.
- No application HTTP webhook endpoints detected in tracked source.

**Outgoing:**
- npm publish requests from `.github/workflows/release-mcp.yml`.
- GitHub release creation via `gh release create` in `.github/workflows/release-mcp.yml`.
- GitHub API request from `scripts/validate-pr-capability-gate.mjs`.

---

*Integration audit: 2026-03-26*
