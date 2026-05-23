# Technology Stack

**Analysis Date:** 2026-03-26

## Languages

**Primary:**
- TypeScript 5.9.2 - Main implementation language across `packages/contracts`, `packages/core`, `packages/adapter-maestro`, `packages/adapter-vision`, `packages/mcp-server`, and most repo automation in `scripts/*.ts` (`package.json`, `tsconfig.base.json`).

**Secondary:**
- JavaScript (ES modules) - Thin CLI entry and some repo automation in `packages/cli/src/index.js` and `scripts/validate-pr-capability-gate.mjs`.
- YAML - Runtime policy, framework profile, and flow definitions in `configs/policies/*.yaml`, `configs/profiles/*.yaml`, and `flows/**/*.yaml`.
- Shell - Device runners, showcase automation, and phase validation scripts in `scripts/dev/*.sh`.
- Python - Report-generation utilities in `scripts/report/*.py`.
- JSON / JSON Schema - MCP/session result schemas and agent config in `packages/contracts/*.schema.json` and `opencode.json`.

## Runtime

**Environment:**
- Node.js 24 in CI and release workflows (`.github/workflows/ci.yml`, `.github/workflows/release-mcp.yml`, `.github/workflows/ocr-smoke.yml`, `.github/workflows/real-device-acceptance.yml`).
- Node.js 20 bundle target for the published package (`packages/mcp-server/tsup.config.ts`).
- macOS host runtime is required for iOS simulator features, Apple Vision OCR, and OCR smoke (`packages/adapter-vision/src/ocr/providers/mac-vision-ocr-provider.ts`, `.github/workflows/ocr-smoke.yml`, `packages/adapter-maestro/src/toolchain-runtime.ts`).

**Package Manager:**
- pnpm 10.30.3 (`package.json`, `.github/workflows/*.yml`).
- Lockfile: present at `pnpm-lock.yaml`.

## Frameworks

**Core:**
- pnpm workspaces - Monorepo boundary across `packages/*` and `examples/rn-login-demo` (`package.json`, `pnpm-workspace.yaml`).
- Model Context Protocol SDK `@modelcontextprotocol/sdk` ^1.17.5 - MCP server transport and request handling in `packages/mcp-server/package.json` and `packages/mcp-server/src/mcp-stdio-server.ts`.
- YAML parser `yaml` ^2.8.1 - Config and policy loading in `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, and `packages/adapter-maestro/src/harness-config.ts`.

**Testing:**
- Node built-in test runner executed through `tsx --test` - Package tests use this pattern in `packages/core/package.json`, `packages/adapter-vision/package.json`, `packages/adapter-maestro/package.json`, and `packages/mcp-server/package.json`.
- GitHub Actions - CI, smoke, OCR, release, and real-device verification in `.github/workflows/*.yml`.

**Build/Dev:**
- TypeScript compiler `tsc` - Project references build across `tsconfig.json` and package `tsconfig.json` files.
- `tsx` ^4.20.6 - TypeScript execution for tests, validation scripts, and dev runtime (`package.json`, `packages/mcp-server/package.json`).
- `tsup` ^8.5.0 - Bundles the publishable MCP package into CommonJS output under `packages/mcp-server/bundle` (`packages/mcp-server/package.json`, `packages/mcp-server/tsup.config.ts`).

## Monorepo Structure

**Workspace packages:**
- `packages/contracts` - Shared types, reason codes, and JSON schemas exported from `packages/contracts/src/index.ts`.
- `packages/core` - Session store, lease coordination, governance, and policy engine exported from `packages/core/src/index.ts`.
- `packages/adapter-vision` - OCR policy, OCR resolution, and Apple Vision provider exports in `packages/adapter-vision/src/index.ts`.
- `packages/adapter-maestro` - Device/runtime integration layer that depends on `contracts`, `core`, and `adapter-vision` (`packages/adapter-maestro/package.json`, `packages/adapter-maestro/src/index.ts`).
- `packages/mcp-server` - MCP registry, stdio transport, dev CLI, and publishable npm package (`packages/mcp-server/package.json`, `packages/mcp-server/src/index.ts`).
- `packages/cli` - Thin local CLI wrapper that shells into the MCP server dev CLI (`packages/cli/src/index.js`).

**Dependency direction:**
- `@mobile-e2e-mcp/contracts` is the base package consumed by every other TypeScript package (`packages/*/package.json`).
- `@mobile-e2e-mcp/core` depends on `@mobile-e2e-mcp/contracts` and is consumed by `packages/adapter-maestro` and `packages/mcp-server`.
- `@mobile-e2e-mcp/adapter-vision` depends on `@mobile-e2e-mcp/contracts` and is consumed by `packages/adapter-maestro`.
- `@mobile-e2e-mcp/adapter-maestro` is the execution adapter consumed by `packages/mcp-server`.
- `packages/mcp-server` is the only non-private publish target and bundles the internal workspace packages for npm distribution (`packages/mcp-server/package.json`, `packages/mcp-server/tsup.config.ts`).

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` ^1.17.5 - Provides the MCP stdio server implementation in `packages/mcp-server/src/mcp-stdio-server.ts`.
- `yaml` ^2.8.1 - Parses policy/profile/harness YAML in `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, and `packages/adapter-maestro/src/harness-config.ts`.
- `typescript` ^5.9.2 - Compiles all packages via project references (`package.json`, `tsconfig.json`).
- `tsx` ^4.20.6 - Runs tests, local CLIs, and repo validation scripts without a separate transpile step (`package.json`, `packages/mcp-server/package.json`).
- `tsup` ^8.5.0 - Produces the publishable CommonJS bundle for `@shenyuexin/mobile-e2e-mcp` (`packages/mcp-server/tsup.config.ts`).

**Infrastructure:**
- Workspace dependencies `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/core`, `@mobile-e2e-mcp/adapter-vision`, and `@mobile-e2e-mcp/adapter-maestro` are linked via `workspace:*` in package manifests under `packages/*/package.json`.
- JSON schemas `packages/contracts/tool-result.schema.json` and `packages/contracts/session.schema.json` act as machine-readable contract artifacts shipped with `packages/contracts/package.json`.

## Configuration

**Environment:**
- Repo-wide AI/agent instruction chain is declared in `opencode.json`.
- Harness defaults and runner wiring come from `packages/adapter-maestro/src/harness-config.ts`, with fallback to `configs/harness/sample-harness.yaml` when present and an in-code default otherwise.
- Policy scopes and governance are configured through `configs/policies/access-profiles.yaml`, `configs/policies/artifact-retention.yaml`, `configs/policies/session-audit-schema.yaml`, and interruption rules in `configs/policies/interruption/*.yaml`.
- Framework/sample support baselines are described in `configs/profiles/react-native.yaml`, `configs/profiles/native.yaml`, and `configs/profiles/flutter.yaml`.
- Sample and CI flows live under `flows/samples/**/*` and shared interruption flows under `flows/shared/*`.

**Build:**
- Root project references live in `tsconfig.json`; compiler defaults live in `tsconfig.base.json`.
- Package-specific compile boundaries live in `packages/*/tsconfig.json`.
- Publish bundle configuration lives in `packages/mcp-server/tsup.config.ts`.
- GitHub workflow automation lives in `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, `.github/workflows/ocr-smoke.yml`, `.github/workflows/pr-capability-gate.yml`, `.github/workflows/real-device-acceptance.yml`, and `.github/workflows/release-mcp.yml`.

## Runtime Entry Points

**Published package:**
- `packages/mcp-server/src/bin-stdio.ts` is the npm package binary entry, pointing at `packages/mcp-server/src/mcp-stdio-server.ts`.
- `packages/mcp-server/src/mcp-stdio-server.ts` exposes the MCP stdio transport using `@modelcontextprotocol/sdk`.

**Local/dev entry points:**
- `packages/mcp-server/src/dev-cli.ts` is the typed developer CLI surfaced by `pnpm mcp:dev`.
- `packages/mcp-server/src/stdio-server.ts` is a minimal JSON-line stdio server used by `pnpm mcp:stdio`.
- `packages/cli/src/index.js` is a repository-local convenience wrapper that forwards flags to the MCP server dev CLI.

## Platform Requirements

**Development:**
- Node.js with pnpm (`package.json`, `.github/workflows/ci.yml`).
- Android tooling: `adb`, Android emulator/device access, and optional `trace_processor` for Android performance capture (`packages/adapter-maestro/src/doctor-guidance.ts`, `packages/adapter-maestro/src/device-runtime-android.ts`, `packages/adapter-maestro/src/performance-tools.ts`).
- iOS tooling on macOS: `xcrun simctl`, `xcrun xctrace`, `idb`, and `idb_companion` for iOS UI and recording/runtime support (`packages/adapter-maestro/src/doctor-guidance.ts`, `packages/adapter-maestro/src/ui-runtime-ios.ts`, `packages/adapter-maestro/src/device-runtime-ios.ts`).
- Maestro CLI for flow execution and platform smoke (`packages/adapter-maestro/src/doctor-guidance.ts`, `.github/workflows/platform-smoke.yml`).
- Apple Vision OCR host support for bounded OCR fallback on macOS (`packages/adapter-vision/src/ocr/providers/mac-vision-ocr-provider.ts`).

**Production:**
- Distribution target is the npm package `@shenyuexin/mobile-e2e-mcp` built from `packages/mcp-server` and published via `.github/workflows/release-mcp.yml`.
- Runtime model is local or CI-hosted execution against Android devices, Android emulators, or iOS simulators rather than a hosted backend service (`README.md`, `packages/mcp-server/README.md`).

---

*Stack analysis: 2026-03-26*
