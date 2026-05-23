# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** Layered pnpm monorepo with typed contracts, file-backed control-plane services, adapter-driven execution, and thin transport wrappers.

**Key Characteristics:**
- Keep shared data semantics in `packages/contracts/src/types.ts` and `packages/contracts/src/index.ts`, then consume them from every runtime layer.
- Keep policy, leases, scheduling, audits, and persistence in `packages/core/src/*.ts`; do not embed those concerns directly inside `packages/mcp-server/src/tools/*.ts`.
- Keep platform execution in `packages/adapter-maestro/src/*.ts`, with OCR/CV fallback isolated in `packages/adapter-vision/src/ocr/*` and invoked only from the adapter/action orchestration path.

## Layers

**Contracts Layer:**
- Purpose: Define the machine-consumable envelopes, session model, reason codes, and tool input/output types.
- Location: `packages/contracts/src/index.ts`, `packages/contracts/src/types.ts`, `packages/contracts/src/reason-codes.ts`, `packages/contracts/session.schema.json`, `packages/contracts/tool-result.schema.json`
- Contains: `ToolResult<T>`, `Session`, `ActionIntent`, interruption/recovery types, OCR types, and schema baselines.
- Depends on: No internal package dependencies.
- Used by: `packages/core/src/*.ts`, `packages/adapter-maestro/src/*.ts`, `packages/adapter-vision/src/*.ts`, `packages/mcp-server/src/*.ts`

**Core Control-Plane Layer:**
- Purpose: Persist sessions and action history, enforce policy/config loading, coordinate leases, schedule exclusive tool execution, and build audit metadata.
- Location: `packages/core/src/index.ts`, `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, `packages/core/src/execution-coordinator.ts`, `packages/core/src/session-record-store.ts`, `packages/core/src/action-record-store.ts`, `packages/core/src/recording-store.ts`
- Contains: YAML-backed policy readers, JSON-backed record stores, device lease locking, queue serialization, and audit helpers.
- Depends on: `@mobile-e2e-mcp/contracts`, YAML config in `configs/policies/*.yaml`
- Used by: `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/policy-guard.ts`, `packages/adapter-maestro/src/index.ts`, `packages/adapter-maestro/src/action-orchestrator.ts`, `packages/adapter-maestro/src/recovery-tools.ts`

**Execution Adapter Layer:**
- Purpose: Translate typed tool calls into platform/runtime behavior, UI inspection, action execution, flow running, evidence capture, interruption handling, and recovery.
- Location: `packages/adapter-maestro/src/index.ts` plus focused modules such as `packages/adapter-maestro/src/ui-tools.ts`, `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/flow-runtime.ts`, `packages/adapter-maestro/src/action-orchestrator.ts`, `packages/adapter-maestro/src/interruption-tools.ts`, `packages/adapter-maestro/src/recovery-tools.ts`
- Contains: Tool-facing adapter exports, harness/profile resolution, shell-command runners, UI parsers, action orchestration, and session-state summarization.
- Depends on: `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/core`, `@mobile-e2e-mcp/adapter-vision`, repo config in `configs/harness/sample-harness.yaml`, `configs/profiles/*.yaml`, `flows/**/*.yaml`, and shell runners in `scripts/dev/*`
- Used by: `packages/mcp-server/src/tools/*.ts`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/policy-guard.ts`

**Vision Fallback Layer:**
- Purpose: Keep probabilistic OCR fallback separate from deterministic adapter execution.
- Location: `packages/adapter-vision/src/index.ts`, `packages/adapter-vision/src/ocr/service/ocr-service.ts`, `packages/adapter-vision/src/ocr/policy/fallback-policy.ts`, `packages/adapter-vision/src/ocr/resolver/resolve-text-target.ts`, `packages/adapter-vision/src/ocr/verification/verify-ocr-action.ts`
- Contains: OCR provider abstraction, fallback gating, target resolution, and post-action verification helpers.
- Depends on: `@mobile-e2e-mcp/contracts`
- Used by: `packages/adapter-maestro/src/index.ts`, `packages/adapter-maestro/src/action-orchestrator-ocr.ts`, `packages/adapter-maestro/src/action-orchestrator.ts`

**Server and Transport Layer:**
- Purpose: Publish the tool catalog, wrap handlers with policy/session/audit behavior, and expose stdio or CLI entrypoints.
- Location: `packages/mcp-server/src/server.ts`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/mcp-stdio-server.ts`, `packages/mcp-server/src/stdio-server.ts`, `packages/mcp-server/src/dev-cli.ts`, `packages/cli/src/index.js`
- Contains: Typed tool registry, `ToolDescriptor` metadata, stdio server variants, dev CLI argument parsing, preset execution, and context aliasing.
- Depends on: `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/core`, `@mobile-e2e-mcp/adapter-maestro`, `@modelcontextprotocol/sdk`
- Used by: Root scripts in `package.json`, published package entrypoints in `packages/mcp-server/package.json`, local wrapper in `packages/cli/src/index.js`

**Config and Content Layer:**
- Purpose: Supply policy baselines, framework support profiles, harness defaults, and reusable flow definitions without recompiling code.
- Location: `configs/policies/*.yaml`, `configs/profiles/*.yaml`, `configs/harness/sample-harness.yaml`, `flows/samples/**/*.yaml`, `flows/shared/*.yaml`
- Contains: Access scopes, interruption policy rules, audit retention, framework readiness requirements, sample harness defaults, and replay flows.
- Depends on: No code dependency; loaded by `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, and `packages/adapter-maestro/src/harness-config.ts`
- Used by: `packages/core`, `packages/adapter-maestro`, root validation scripts in `scripts/*.ts`

## Data Flow

**Tool Invocation Flow:**

1. A caller enters through `packages/mcp-server/src/mcp-stdio-server.ts`, `packages/mcp-server/src/stdio-server.ts`, `packages/mcp-server/src/dev-cli.ts`, or the wrapper in `packages/cli/src/index.js`.
2. `packages/mcp-server/src/index.ts` builds `TOOL_DESCRIPTORS`, composes wrappers such as `withPolicy`, `withPolicyAndAudit`, and `withSessionExecution`, and returns a `MobileE2EMcpServer` from `packages/mcp-server/src/server.ts`.
3. Policy is enforced by `packages/mcp-server/src/policy-guard.ts`, which loads the active policy profile through `packages/core/src/policy-engine.ts` and session state through `packages/core/src/session-record-store.ts`.
4. Session-bound tools are normalized by `withSessionExecution` in `packages/mcp-server/src/index.ts`, which auto-resolves active sessions, recovers stale leases, and serializes execution via `runExclusive` from `packages/core/src/session-scheduler.ts`.
5. The concrete tool handler in `packages/mcp-server/src/tools/*.ts` delegates to adapter exports from `packages/adapter-maestro/src/index.ts`.
6. Adapter modules execute deterministic platform actions through `packages/adapter-maestro/src/ui-tools.ts`, `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/flow-runtime.ts`, and related runtime helpers.
7. When deterministic execution is insufficient, `packages/adapter-maestro/src/action-orchestrator.ts` consults `packages/adapter-vision/src/ocr/policy/fallback-policy.ts` and `packages/adapter-vision/src/ocr/service/ocr-service.ts` before attempting bounded OCR fallback.
8. Result envelopes, action records, session state, timeline events, and audits are persisted under `artifacts/` through `packages/core/src/action-record-store.ts`, `packages/core/src/session-record-store.ts`, `packages/core/src/recording-store.ts`, and `packages/core/src/governance.ts`.

**State Management:**
- Session state is file-backed, not process-memory-only. Active session records live under paths built by `packages/core/src/session-record-store.ts`; lease state lives under `artifacts/leases/*.json` via `packages/core/src/device-lease-store.ts`; action history lives under `artifacts/actions/*.json` via `packages/core/src/action-record-store.ts`.

## Key Abstractions

**Typed Tool Contract Map:**
- Purpose: Make every tool name map to a specific input and output payload.
- Examples: `packages/mcp-server/src/server.ts`, `packages/contracts/src/types.ts`
- Pattern: Centralized generic map via `MobileE2EMcpToolContractMap`, then registry composition in `packages/mcp-server/src/index.ts`

**Tool Descriptor Metadata:**
- Purpose: Separate tool behavior from transport concerns such as policy enforcement, session requirements, and audit capture.
- Examples: `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/tools/start-session.ts`, `packages/mcp-server/src/tools/perform-action-with-evidence.ts`
- Pattern: Declarative descriptor array plus handler composition wrappers

**Session Record and Timeline:**
- Purpose: Keep execution reproducible and auditable across tool calls.
- Examples: `packages/core/src/session-record-store.ts`, `packages/core/src/governance.ts`, `packages/contracts/session.schema.json`
- Pattern: JSON persistence with append/update helpers and timeline event aggregation

**Action Outcome Record:**
- Purpose: Preserve per-action evidence, recovery hints, and replay checkpoints.
- Examples: `packages/adapter-maestro/src/action-orchestrator.ts`, `packages/adapter-maestro/src/action-outcome.ts`, `packages/core/src/action-record-store.ts`
- Pattern: Deterministic execution first, then enriched `PerformActionWithEvidenceData` plus persisted action record

**Harness Selection:**
- Purpose: Resolve default device, app, runner script, and flow paths from repo-local config.
- Examples: `packages/adapter-maestro/src/harness-config.ts`, `configs/harness/sample-harness.yaml`
- Pattern: YAML-backed config reader with profile-aware defaults and repo-root discovery

**Recovery and Interruption Checkpoints:**
- Purpose: Bound recovery automation and prevent unsafe replays.
- Examples: `packages/adapter-maestro/src/interruption-tools.ts`, `packages/adapter-maestro/src/recovery-tools.ts`, `packages/core/src/policy-engine.ts`
- Pattern: Checkpoint traces, policy-scoped interruption resolution, and replay refusal for high-risk actions

## Entry Points

**Published MCP stdio server:**
- Location: `packages/mcp-server/src/mcp-stdio-server.ts`
- Triggers: `pnpm mcp:stdio`, the `mobile-e2e-mcp` bin in `packages/mcp-server/package.json`, or `npx -y @shenyuexin/mobile-e2e-mcp@latest`
- Responsibilities: Adapt the typed server to the official MCP SDK request/response protocol

**Minimal stdio server:**
- Location: `packages/mcp-server/src/stdio-server.ts`
- Triggers: `pnpm --filter @shenyuexin/mobile-e2e-mcp stdio:minimal`
- Responsibilities: Accept JSON-line requests, normalize tool names, and invoke the same typed server without the MCP SDK layer

**Dev CLI:**
- Location: `packages/mcp-server/src/dev-cli.ts`
- Triggers: `pnpm mcp:dev` or `pnpm --filter @shenyuexin/mobile-e2e-mcp dev`
- Responsibilities: Parse flags, resolve session aliases/presets, and call the typed server directly for local development and validation

**CLI wrapper package:**
- Location: `packages/cli/src/index.js`
- Triggers: `mobile-e2e-mcp` from the private wrapper package
- Responsibilities: Forward arguments to the real dev CLI in `packages/mcp-server`

**Tool registry composition:**
- Location: `packages/mcp-server/src/index.ts`
- Triggers: Every runtime entrypoint imports `createServer()`
- Responsibilities: Compose the registry, attach wrappers, and publish tool metadata

**Adapter export surface:**
- Location: `packages/adapter-maestro/src/index.ts`
- Triggers: Tool handlers import adapter functions from here
- Responsibilities: Expose the supported execution capabilities while delegating focused work to submodules

## Error Handling

**Strategy:** Return typed `ToolResult` envelopes with `status`, `reasonCode`, `artifacts`, and `nextSuggestions`; reserve thrown exceptions for malformed transport/config cases.

**Patterns:**
- Policy denials become regular tool failures in `packages/mcp-server/src/policy-guard.ts`, not uncaught exceptions.
- Session mismatches, ambiguous auto-resolution, and queue/lease issues are converted to structured failures in `packages/mcp-server/src/index.ts`.
- Adapter execution failures are classified and persisted by `packages/adapter-maestro/src/action-orchestrator.ts`, `packages/adapter-maestro/src/action-outcome.ts`, and `packages/adapter-maestro/src/recovery-tools.ts`.

## Cross-Cutting Concerns

**Logging:** Log and evidence collection are exposed as tools instead of a shared logger framework. Runtime collection lives in `packages/adapter-maestro/src/device-runtime.ts`, `packages/adapter-maestro/src/js-debug.ts`, and tool wrappers in `packages/mcp-server/src/tools/get-logs.ts`, `packages/mcp-server/src/tools/collect-debug-evidence.ts`.

**Validation:** Static typing comes from `packages/contracts/src/types.ts`; baseline JSON validation comes from `packages/contracts/session.schema.json` and `packages/contracts/tool-result.schema.json`; runtime config validation happens while parsing YAML in `packages/core/src/policy-engine.ts`, `packages/core/src/governance.ts`, and `packages/adapter-maestro/src/harness-config.ts`.

**Authentication:** Not detected as a remote auth/authn subsystem. Governance is local and profile-based through `configs/policies/access-profiles.yaml`, enforced by `packages/mcp-server/src/policy-guard.ts`, with additional interruption risk checks in `packages/core/src/governance.ts`.

---

*Architecture analysis: 2026-03-26*
