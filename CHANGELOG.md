# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.24] - 2026-11-27

### Added
- Expanded replay, recording, and session-orchestration capabilities across the MCP harness.

### Changed
- Improved diagnostics, evidence capture, and performance analysis workflows for mobile automation runs.
- Refined operator documentation, governance guidance, and architecture references around the release.
- Release scope includes 4 merged commits between mcp-server-v0.1.23 and the target tag.

### Fixed
- Hardened release reliability, runtime guardrails, and end-to-end flow stability on supported platforms.

## [0.1.23] - 2026-11-26

### Added
- Unified `mobile-e2e-mcp verify` acceptance suite (`packages/mcp-server/src/cli/verify-command.ts`, `verify-report.ts`) orchestrating deterministic flows (files/directories), `audit_ui_surface`, and bounded `explore` into unified `summary.json`, `report.md`, and self-contained zero-CDN `report.html` outputs configured via `.e2e/config.yaml` (`verify:` section).
- `mobile-e2e-mcp run <dir>` sorted directory flow execution, `--output <dir>` (`summary.json` + automatic per-flow failure video paths), and `--fail-fast`.
- Explorer `--run-id <id>`, `--json`, `-h`, and `<output>/latest.json` pointer (`htmlReportPath` also added to `index.json` entries).
- iOS `navigate_back` `iosStrategy: "auto"` (`ios_auto_nav_bar` top-bar back/dismiss discovery with single bounded `ios_edge_swipe` fallback, `matchedBackLabel`, and `discoveredSelector`) and iOS `type_into_element` `keyboardState` / `AppleKeyboards` IME / `focusCause` diagnostics via `UiRuntimePlatformHooks` (hardware-keyboard-safe).
- External packed-tarball CLI smoke test (`scripts/release/smoke-test-mcp-tarball.mjs`, `pnpm run test:mcp-tarball-smoke`) wired into both `.github/workflows/ci.yml` (`package-tarball-smoke`) and `.github/workflows/release-mcp.yml`.

### Changed
- Consolidated Explorer report generation into a single canonical write per run from `packages/explorer/src/runner.ts` (passing `{ skipReport: true }` to `engine.ts` while preserving `transitionLifecycle` and `stateGraph` metrics in `summary.json`).
- Extracted Android keyboard probe helpers out of `packages/adapter-maestro/src/ui-action-tools.ts` into `ui-runtime-android.ts` (reducing `ui-action-tools.ts` from 1416 to 1334 lines) while keeping the MCP registry at 68 total / 20 core tools.
- Synced `README.md`, `README.zh-CN.md`, `packages/mcp-server/README.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` for Phase 71–72 and `0.1.23`.

### Fixed
- Hardened CLI argument parsers (`run`, `audit`, `diff`, `doctor`, `init`, `setup-agent`, `explore`) to fail fast with exit code `2` on unknown options, unexpected positional args, and missing flag values instead of silently ignoring them.

## [0.1.22] - 2026-11-26

### Added
- `mobile-e2e-mcp audit` (`packages/mcp-server/src/cli/audit-command.ts`) for zero-script governed UI quality audits with `.e2e/config.yaml` inheritance and `--fail-on-regression` (#21).
- `mobile-e2e-mcp diff <baseDir> <headDir>` (`packages/mcp-server/src/cli/diff-command.ts`, `packages/explorer/src/report/diff-report.ts`) with PR-ready Markdown, JSON, and `--fail-on-regression`, plus self-contained zero-CDN `report.html` emission in Explorer reports (`packages/explorer/src/report/html-report.ts`) (#21).
- `mobile-e2e-mcp run --record-on-failure` / `--record-output` (retain video only on failure, auto-discard on pass) and read-only proposal-only `--suggest-heal` (`packages/mcp-server/src/cli/selector-heal.ts`) (#22).
- `mobile-e2e-mcp explore --export-flows <dir>` (`packages/explorer/src/report/flow-exporter.ts`) exporting deterministic Maestro YAML smoke flows with explicit settle delays (`waitForAnimationToEnd`) (#22).
- Project auto-detection (`packages/mcp-server/src/cli/project-detector.ts`) in `init` with `--with-smoke-flow` / `--no-smoke-flow` scaffolding, `mobile-e2e-mcp setup-agent` (`packages/mcp-server/src/cli/setup-agent-command.ts`) for `claude`/`cursor`/`opencode`/`codex`, and AXe `< 2.2.0` upgrade warnings in `doctor` (#23).
- Reusable composite GitHub Action `.github/actions/mobile-e2e-gate/action.yml` (`audit`/`explore`/`run`/`diff` modes with `env:`-isolated inputs, artifact upload, and PR comment gating) and reproducible real-app showcase guide `docs/showcase/killer-demo-real-app.md` (#24).

### Changed
- Refreshed `README.md`, `README.zh-CN.md`, `packages/mcp-server/README.md`, `docs/guides/golden-path.md`, `docs/guides/external-tools.md`, `docs/architecture/02-platform-adapters.md`, and `CHANGELOG.md` for `0.1.20`–`0.1.22` while preserving the 68-tool / 20-core MCP registry.

### Fixed
- Fixed broken architecture/release links across root docs, `AGENTS.md`, `CONTRIBUTING.md`, `docs/engineering/probe-ci-gate-proposal.md`, and `docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20/report.md` (verified 0 broken links via `validate:github-gate-assets`).

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

