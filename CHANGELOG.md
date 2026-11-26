# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.21] - 2026-11-26

### Added
- Enabled Sigstore provenance attestation (`npm publish --access public --provenance`) via pure GitHub Actions OIDC trusted publishing.

### Changed
- Refined `.github/workflows/release-mcp.yml` to pack `@shenyuexin/mobile-e2e-mcp` via `pnpm pack`, unpack the tarball into an isolated directory, and publish with `--loglevel verbose` without `NPM_TOKEN` or root `registry-url` overrides.
- Updated `docs/delivery/npm-release-and-git-tagging.zh-CN.md` and `scripts/release/mcp-package-scripts.test.ts` to cover pure OIDC tarball publishing.

### Fixed
- Resolved `ENEEDAUTH` failures caused by legacy `NPM_TOKEN` overrides and workspace root invocation during npm OIDC publishing.

## [0.1.20] - 2026-11-26

### Added
- Added `core` (20 high-frequency tools, default) and `full` (68 tools) MCP toolset presets via `--toolset` / `MOBILE_E2E_TOOLSET`.
- Added unified single-entrypoint CLI subcommands (`stdio`, `doctor`, `init`, `explore`, `run`) with `.e2e/config.yaml` auto-loading and `--no-prompt --config` read-only protection.
- Added `audit_ui_surface` with optional baseline ratchet diffing (`baselinePath` / `baselineMode`), `perform_gesture` (full iOS simulator via AXe v2.2+; partial Android via `adb`), and non-blocking `record_screen` `start`/`stop` (`discardOnStop`, 180s cap).
- Added iOS simulator `launch_app` support for `launchEnv`, `launchArgs`, `terminateRunning`, and dual-display capture hardening.

### Changed
- Added per-UDID persistent `axe serve` transport pooling for iOS simulator read/capture commands (`describe-ui`, `displays`, `screenshot`, `ping`) with `M2E_DISABLE_AXE_SERVE=1` opt-out while keeping HID commands one-shot.
- Hardened iPad Explorer traversal with SplitView/Popover scoping and foreground pre-flight checks against SpringBoard/Dock/Spotlight drift.
- Switched release automation toward OIDC trusted publishing and synchronized package README, invocation guide, platform matrix, and architecture links.

### Fixed
- Added synchronous `SIGINT`/`SIGTERM` cleanup for active screen recordings and persistent `axe serve` workers on process exit.

## [0.1.19] - 2026-06-06

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.

### Changed
- Release scope includes 1 merged commit between mcp-server-v0.1.18 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.18] - 2026-06-03

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 1 merged commit between mcp-server-v0.1.17 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.17] - 2026-06-03

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 1 merged commit between mcp-server-v0.1.16 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.16] - 2026-06-03

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Release scope includes 1 merged commit between mcp-server-v0.1.15 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.15] - 2026-06-03

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 103 merged commits between mcp-server-v0.1.14 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.14] - 2026-05-04

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 36 merged commits between mcp-server-v0.1.13 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.13] - 2026-04-12

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 15 merged commits between mcp-server-v0.1.12 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.12] - 2026-04-12

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.
- Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 147 merged commits between mcp-server-v0.1.11 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.11] - 2026-03-29

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.
- Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 48 merged commits between mcp-server-v0.1.9 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.9] - 2026-03-26

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.
- Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.

### Changed
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 9 merged commits between mcp-server-v0.1.8 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.8] - 2026-03-23

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 19 merged commits between mcp-server-v0.1.7 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.7] - 2026-03-21

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.
- Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 38 merged commits between mcp-server-v0.1.6 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.6] - 2026-03-20

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.
- Extended deterministic UI inspection, targeting, and interaction coverage for mobile flows.
- Improved bounded OCR and vision fallback support for cases where deterministic selectors are unavailable.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 39 merged commits between mcp-server-v0.1.5 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.5] - 2026-03-20

### Added
- Introduced the first public AI-first mobile E2E MCP server with session lifecycle, app control, UI inspection, interaction, diagnostics, interruption handling, and failure-analysis tools.
- Established deterministic-first execution adapters plus bounded OCR/vision fallback for Android, iOS, React Native, and Flutter automation workflows.
- Published runnable sample flows, showcase demos, and real-device/simulator validation assets for login, recovery, and harness onboarding scenarios.

### Changed
- Reorganized the repository into a pnpm monorepo with explicit contracts, core orchestration, adapters, and MCP server package boundaries.
- Added stdio/dev CLI entrypoints, package metadata, governance baselines, and release automation needed for public npm distribution.

### Fixed
- Hardened doctor checks, dry-run behavior, selector resolution, and session or lease stability during the initial release cycle.

