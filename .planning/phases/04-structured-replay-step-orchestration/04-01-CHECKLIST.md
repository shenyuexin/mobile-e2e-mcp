# Structured Replay Step Orchestration Checklist

## Contracts

- [x] Add `ReplayExecutionMode`
- [x] Add `ReplayProgressSummary`
- [x] Add `ReplayStepOutcome`
- [x] Extend `RunFlowData` with step-aware fields
- [x] Re-export new replay types from `packages/contracts/src/index.ts`

## Replay Planning

- [x] Create `replay-step-planner.ts`
- [x] Normalize recorded steps into canonical replay steps
- [x] Preserve `stepNumber`, confidence, and warnings
- [x] Build initial replay progress summary

## Replay Runtime

- [x] Create `replay-step-orchestrator.ts`
- [x] Add compatibility-safe branching to `run_flow`
- [x] Add `executionMode` reporting
- [x] Execute replay step-by-step through existing action orchestration
- [x] Return completed / failed / skipped / remaining steps

## Continue / Stop Semantics

- [x] Reuse `terminal_stop`
- [x] Reuse `recoverable_waiting`
- [x] Reuse `partial_progress`
- [x] Reuse `degraded_but_continue_safe`
- [x] Reuse `replay_recommended`
- [x] Preserve manual-handoff hard boundaries
- [x] Preserve terminal crash / backend / offline stop rules

## Evidence and Timeline

- [x] Add replay-step timeline events
- [x] Attach step-scoped artifacts
- [x] Attach step-scoped evidence summaries
- [x] Keep `actionId` linkage when a replay step triggers an action record
- [x] Keep replay-summary artifacts separate from step-local artifacts

## Core Persistence

- [x] Add replay-friendly session persistence helper or equivalent reuse path
- [x] Persist replay step events through the session store
- [x] Keep audit semantics aligned with existing session/action persistence

## Tests

- [x] Contract tests for new replay fields
- [x] Planner tests
- [x] Replay progress bookkeeping tests
- [x] Replay orchestrator tests
- [x] MCP server `run_flow` response-shape tests
- [x] Evidence/timeline attribution tests

## Docs

- [x] Update `docs/guides/flow-generation.md`
- [x] Update `docs/guides/ai-agent-invocation.zh-CN.md`
- [x] Update `docs/architecture/evidence-timeline-architecture.zh-CN.md`
- [x] Update `docs/architecture/session-orchestration-architecture.zh-CN.md`
- [x] Describe `runner_compat` vs `step_orchestrated` honestly

## Verification

- [x] `pnpm --filter @mobile-e2e-mcp/adapter-maestro test`
- [x] `pnpm --filter @mobile-e2e-mcp/mcp-server test`
- [x] `pnpm typecheck`
- [x] `pnpm build`

## Exit Criteria

- [x] `run_flow` returns step-aware replay data
- [x] Replay can identify current, completed, failed, skipped, and remaining steps
- [x] Replay stop/continue semantics are bounded and explainable
- [x] Crash/interruption/readiness evidence can be attributed to a replay step
- [x] Support docs match the implemented migration state
