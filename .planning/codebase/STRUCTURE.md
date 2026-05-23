# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```text
[project-root]/
├── packages/        # Monorepo packages for contracts, core logic, adapters, server transport, and CLI wrapper
├── configs/         # Policy baselines, harness defaults, and framework profile declarations
├── flows/           # Replayable sample flows and shared interruption subflows
├── scripts/         # Validation, release, report, and shell runner utilities
├── docs/            # Durable public architecture, engineering, delivery, and showcase docs
├── tests/           # Shared fixtures and top-level test guidance
├── examples/        # Sample AUT applications and upstream app snapshots
├── artifacts/       # Runtime-generated evidence, sessions, leases, and debug output
├── .github/         # CI, release, and policy-gate workflows
├── package.json     # Workspace scripts and root package manager definition
└── tsconfig.json    # TypeScript project references across core packages
```

## Directory Purposes

**`packages/contracts`:**
- Purpose: Keep shared types and schema baselines for every layer.
- Contains: `src/index.ts`, `src/types.ts`, `src/reason-codes.ts`, `session.schema.json`, `tool-result.schema.json`
- Key files: `packages/contracts/src/types.ts`, `packages/contracts/session.schema.json`

**`packages/core`:**
- Purpose: Keep reusable control-plane logic that must remain adapter-agnostic.
- Contains: Session/action/record stores, policy loading, governance helpers, device leases, scheduler coordination
- Key files: `packages/core/src/policy-engine.ts`, `packages/core/src/session-record-store.ts`, `packages/core/src/execution-coordinator.ts`

**`packages/adapter-maestro`:**
- Purpose: Keep the main execution adapter and tool-facing runtime logic.
- Contains: `src/index.ts` export surface, runtime helpers, UI tooling, diagnostics, performance, interruption handling, recovery, recording, and action orchestration
- Key files: `packages/adapter-maestro/src/index.ts`, `packages/adapter-maestro/src/harness-config.ts`, `packages/adapter-maestro/src/action-orchestrator.ts`, `packages/adapter-maestro/src/ui-tools.ts`

**`packages/adapter-vision`:**
- Purpose: Keep OCR fallback policy and verification separate from deterministic execution.
- Contains: OCR provider abstraction, resolver, fallback gating, verification helpers
- Key files: `packages/adapter-vision/src/ocr/service/ocr-service.ts`, `packages/adapter-vision/src/ocr/policy/fallback-policy.ts`

**`packages/mcp-server`:**
- Purpose: Keep the published server package, tool registry, stdio transports, and dev CLI.
- Contains: `src/server.ts`, `src/index.ts`, `src/tools/*.ts`, `src/dev-cli.ts`, `src/stdio-server.ts`, `src/mcp-stdio-server.ts`
- Key files: `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/server.ts`, `packages/mcp-server/src/tools/start-session.ts`

**`packages/cli`:**
- Purpose: Keep the private wrapper CLI that forwards into `packages/mcp-server`.
- Contains: `src/index.js`
- Key files: `packages/cli/src/index.js`

**`configs`:**
- Purpose: Keep repo-local runtime configuration instead of hardcoding policy/profile defaults.
- Contains: `configs/policies/*.yaml`, `configs/profiles/*.yaml`, `configs/harness/sample-harness.yaml`, `configs/matrices/framework-profile-matrix.md`
- Key files: `configs/policies/access-profiles.yaml`, `configs/policies/interruption/android.yaml`, `configs/profiles/react-native.yaml`, `configs/harness/sample-harness.yaml`

**`flows`:**
- Purpose: Keep reusable Maestro flow definitions and generated exports.
- Contains: `flows/samples/ci/*.yaml`, `flows/samples/react-native/*.yaml`, `flows/samples/native/*.yaml`, `flows/samples/flutter/*.yaml`, `flows/samples/generated/*.yaml`, `flows/shared/*.yaml`
- Key files: `flows/samples/react-native/android-login-smoke.yaml`, `flows/shared/handle-interruptions-android.yaml`

**`scripts`:**
- Purpose: Keep operational runners, validation scripts, release tooling, and reporting utilities.
- Contains: `scripts/dev/*`, `scripts/release/*`, `scripts/report/*`, top-level validation scripts such as `scripts/validate-dry-run.ts`
- Key files: `scripts/validate-dry-run.ts`, `scripts/dev/run-phase1-android.sh`, `scripts/release/validate-mcp-release.ts`

**`docs`:**
- Purpose: Keep public architecture, engineering guidance, and showcase evidence.
- Contains: `docs/architecture/*`, `docs/engineering/*`, `docs/delivery/*`, `docs/guides/*`, `docs/showcase/*`
- Key files: `docs/architecture/architecture.md`, `docs/engineering/ai-first-capability-expansion-guideline.md`, `docs/README.md`

**`tests`:**
- Purpose: Keep shared fixtures and top-level test policy.
- Contains: `tests/fixtures/ui/*`, `tests/fixtures/ocr/*`, `tests/README.md`
- Key files: `tests/README.md`, `tests/fixtures/ui/android-cart.xml`, `tests/fixtures/ocr/manifest.json`

**`examples`:**
- Purpose: Keep AUT/sample apps used for validation and demonstrations.
- Contains: `examples/rn-login-demo`, `examples/demo-ios-app`, `examples/demo-flutter-app`, other imported example trees
- Key files: `examples/rn-login-demo/package.json`, `examples/demo-ios-app/Docs/AUTOMATION.md`

**`artifacts`:**
- Purpose: Keep generated runtime outputs and persisted execution state.
- Contains: Sessions, actions, leases, crash signals, debug evidence, and phase artifacts written by runtime code
- Key files: Paths are generated by `packages/core/src/session-record-store.ts`, `packages/core/src/action-record-store.ts`, `packages/core/src/device-lease-store.ts`, and `packages/adapter-maestro/src/harness-config.ts`

## Key File Locations

**Entry Points:**
- `package.json`: Root scripts for `build`, `typecheck`, `test`, `mcp:dev`, and `mcp:stdio`
- `packages/mcp-server/src/mcp-stdio-server.ts`: MCP SDK stdio entrypoint
- `packages/mcp-server/src/stdio-server.ts`: Minimal JSON-lines stdio entrypoint
- `packages/mcp-server/src/dev-cli.ts`: Local CLI entrypoint
- `packages/cli/src/index.js`: Pass-through wrapper CLI

**Configuration:**
- `pnpm-workspace.yaml`: Workspace package list
- `tsconfig.json`: Project references to `packages/contracts`, `packages/core`, `packages/adapter-maestro`, and `packages/mcp-server`
- `configs/harness/sample-harness.yaml`: Default harness selection inputs used by `packages/adapter-maestro/src/harness-config.ts`
- `configs/policies/access-profiles.yaml`: Policy profiles used by `packages/mcp-server/src/policy-guard.ts`
- `configs/policies/interruption/android.yaml`: Platform interruption rules loaded by `packages/core/src/policy-engine.ts`

**Core Logic:**
- `packages/contracts/src/types.ts`: Shared type system
- `packages/core/src/policy-engine.ts`: Policy and interruption config loading
- `packages/core/src/session-record-store.ts`: Session persistence and timeline mutation
- `packages/adapter-maestro/src/index.ts`: Adapter export surface
- `packages/adapter-maestro/src/action-orchestrator.ts`: Deterministic action execution plus OCR/interruption/replay hooks
- `packages/mcp-server/src/index.ts`: Tool descriptor registry and runtime wrapper composition

**Testing:**
- `packages/core/test/*.test.ts`: Core lease and scheduler coverage
- `packages/adapter-maestro/test/*.test.ts`: Adapter, interruption, recovery, and runtime coverage
- `packages/adapter-vision/test/*.test.ts`: OCR policy and provider coverage
- `packages/mcp-server/test/*.test.ts`: Registry, stdio, CLI, session, and governance coverage
- `tests/fixtures/**`: Shared UI and OCR fixtures

## Naming Conventions

**Files:**
- Use lowercase kebab-case for tool entry files in `packages/mcp-server/src/tools/*.ts`: `start-session.ts`, `perform-action-with-evidence.ts`
- Use lowercase kebab-case for focused runtime modules in `packages/core/src/*.ts` and `packages/adapter-maestro/src/*.ts`: `policy-engine.ts`, `action-orchestrator.ts`, `recording-runtime.ts`
- Use descriptive suffixes for role-specific modules: `*-runtime.ts`, `*-tools.ts`, `*-store.ts`, `*-model.ts`, `*-policy.ts`
- Use uppercase `README.md` and uppercase planning docs such as `.planning/codebase/ARCHITECTURE.md`

**Directories:**
- Keep package roots flat under `packages/<package-name>/`
- Keep specialized adapter concerns in topic folders only when the concern has its own namespace, as in `packages/adapter-vision/src/ocr/{policy,providers,resolver,service,verification}`
- Keep shared YAML assets grouped by responsibility: `configs/policies/`, `configs/profiles/`, `flows/samples/`, `flows/shared/`

## Where to Add New Code

**New MCP Tool:**
- Primary code: `packages/mcp-server/src/tools/<tool-name>.ts`
- Registry wiring: `packages/mcp-server/src/index.ts`
- Contracts: `packages/contracts/src/types.ts` and, if needed, `packages/mcp-server/src/server.ts`
- Shared policy/session behavior: `packages/core/src/*.ts`
- Adapter execution path: `packages/adapter-maestro/src/*.ts` or `packages/adapter-vision/src/ocr/*` if the behavior is probabilistic OCR
- Tests: `packages/mcp-server/test/`, plus adapter/core tests in the owning package

**New Control-Plane Capability:**
- Primary code: `packages/core/src/<capability>.ts`
- Config baselines: `configs/policies/*.yaml` or `configs/profiles/*.yaml`
- Tests: `packages/core/test/<capability>.test.ts`

**New Deterministic Adapter Capability:**
- Implementation: `packages/adapter-maestro/src/<capability>.ts`
- Public export: `packages/adapter-maestro/src/index.ts`
- If it is a selector/query/action concern, place it near `packages/adapter-maestro/src/ui-tools.ts`, `packages/adapter-maestro/src/ui-model.ts`, or `packages/adapter-maestro/src/device-runtime.ts`
- If it is recovery, evidence, interruption, or planning logic, place it near `packages/adapter-maestro/src/recovery-tools.ts`, `packages/adapter-maestro/src/action-orchestrator.ts`, or `packages/adapter-maestro/src/task-planner.ts`

**New OCR / Vision Fallback Capability:**
- Implementation: `packages/adapter-vision/src/ocr/`
- Policy gating: `packages/adapter-vision/src/ocr/policy/`
- Tests: `packages/adapter-vision/test/`

**Utilities:**
- Shared helpers inside a package stay in that package; do not create a cross-package utility layer unless the type or behavior is reused by multiple packages.
- Repo-wide operational scripts belong in `scripts/`, not inside runtime packages.

## Special Directories

**`packages/*/dist`:**
- Purpose: Compiled TypeScript output
- Generated: Yes
- Committed: Yes

**`packages/mcp-server/bundle`:**
- Purpose: Bundled publishable artifacts for the public npm package
- Generated: Yes
- Committed: Yes

**`flows/samples/generated`:**
- Purpose: Exported or replay-ready generated flows
- Generated: Yes
- Committed: Yes

**`artifacts`:**
- Purpose: Runtime evidence and persisted session state
- Generated: Yes
- Committed: No in normal workflow

**`.planning/codebase`:**
- Purpose: Generated repo analysis for other GSD commands
- Generated: Yes
- Committed: Yes when the mapping is refreshed intentionally

**`examples`:**
- Purpose: Sample apps and imported validation targets
- Generated: No as a repo directory, but many subtrees contain their own build output
- Committed: Yes

---

*Structure analysis: 2026-03-26*
