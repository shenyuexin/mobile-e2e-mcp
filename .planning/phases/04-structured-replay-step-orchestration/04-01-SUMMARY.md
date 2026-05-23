---
phase: 04-structured-replay-step-orchestration
plan: 01
summary_type: internal-planning
task_type: feature
completed: 2026-03-27
requirements_completed:
  - RPL-01
  - RPL-02
  - EVA-03
key_files:
  created:
    - packages/adapter-maestro/src/replay-step-orchestrator.ts
    - packages/adapter-maestro/src/replay-step-persistence.ts
    - packages/adapter-maestro/src/replay-step-planner.ts
  modified:
    - packages/adapter-maestro/src/flow-runtime.ts
    - packages/adapter-maestro/src/action-outcome.ts
    - packages/contracts/src/types.ts
    - packages/contracts/src/index.ts
    - packages/core/src/session-store.ts
    - packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts
    - docs/guides/flow-generation.md
verify_file: 04-01-VERIFY.md
repo_truth_synced:
  - packages/adapter-maestro/src/flow-runtime.ts
  - packages/contracts/src/types.ts
  - packages/core/src/session-store.ts
  - packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts
  - docs/guides/flow-generation.md
---

# Phase 04 Plan 01 Summary

## Meta
- Task ID: 04-01
- Date: 2026-03-27
- Repo: mobile-e2e-mcp
- Branch: active branch at execution time
- Owner: maintainer + AI session
- Type: feature

## Goal

### Problem
`run_flow` still behaved like a run-level wrapper, so exported recorded flows lacked step-aware preview, replay progress, and step-local evidence needed for structured replay reasoning.

### Expected Outcome
- [x] `run_flow` supports step-aware dry-run preview for exported recorded flows.
- [x] Replay progress, step outcomes, and replay timeline persistence are exposed with auditable artifacts.

### Non-goals
- Non-preview replay execution beyond the exported recorded-flow path.
- Broad replay behavior changes unrelated to step orchestration.

## Plan

### Strategy
Add a bounded replay-step orchestration layer for exported recorded flows, persist step-aware timeline/evidence data, and sync docs/checklists to the new preview behavior without broadening unrelated runtime paths.

### Task Breakdown
1. Add replay contracts, planner, persistence, and orchestration helpers.
2. Upgrade `run_flow` dry-run handling to return step-aware replay preview data.
3. Persist replay timeline events and sync docs/checklists to the landed behavior.

### Risks / Unknowns
- Replay preview could accidentally imply broader replay execution support than is actually verified.
- Replay-summary artifacts could blur together with step-local evidence unless separated explicitly.

### Done Criteria
- [x] Exported recorded flows return step-aware dry-run preview data through `run_flow`.
- [x] Replay timeline persistence and replay-summary artifact separation are present and documented.

## Implement

### Changes
- `packages/adapter-maestro/src/flow-runtime.ts` — upgraded replay path to orchestrate step-aware preview outcomes.
- `packages/adapter-maestro/src/replay-step-orchestrator.ts` — added orchestration for replay-step execution modeling.
- `packages/adapter-maestro/src/replay-step-persistence.ts` — added persistence helpers for replay timeline state.
- `packages/adapter-maestro/src/replay-step-planner.ts` — added replay-step planning logic.
- `packages/contracts/src/types.ts` and `packages/contracts/src/index.ts` — added replay contracts/types for step-aware preview data.
- `packages/core/src/session-store.ts` — persisted replay timeline events through the session store.
- `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts` — aligned remediation/replay path with the structured replay surface.
- `docs/guides/flow-generation.md` — synced docs to the new preview behavior.

### Key Decisions
- Kept the slice bounded to exported recorded-flow preview only.
- Separated replay-summary artifacts from step-local replay outputs.
- Persisted replay timeline events through the session store for auditability.
- Exposed step-aware preview data without broadening unrelated runtime behavior.

### Notes
- The landed surface is intentionally preview-oriented; broader replay execution remains future work.

### Deviations
- None — the slice stayed within the intended preview-only boundary.

## Verify

### Test Cases
- [x] Adapter replay-related tests pass.
- [x] MCP server replay/remediation tests pass.
- [x] Type/build validation stays green.
- [x] Manual dry-run closure returns step-aware preview data.

### Evidence Types
- [x] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
pnpm --filter @shenyuexin/adapter-maestro test
pnpm --filter @shenyuexin/mcp-server test
pnpm typecheck
pnpm build
```

- Manual QA readback:
  - `export_session_flow -> run_flow` dry-run closure returned `step_orchestrated` with `executionMode`, `replayProgress`, and `stepOutcomes` preview data.

### Result
- ✅ Success

### Execution Metrics
- Duration: approximately 0.8h
- Verification scenarios run: 4 command validations + 1 manual replay preview check
- Environments checked: repo-local test/build environment and manual dry-run replay path
- Notable evidence count: build, typecheck, 2 test surfaces, and 1 manual QA result

## Retro

### What went well
- Bounding the slice to preview behavior kept the replay change reviewable.
- Separating replay-summary artifacts early reduced ambiguity in evidence ownership.

### What went wrong
- The replay surface is easy to overclaim; without explicit wording it could be read as broader execution support than was actually verified.

### Reusable Rule
- If replay capability expands through a preview-only slice, then state the verified boundary explicitly in both planning artifacts and docs, because replay behavior is easy to overgeneralize from partial wins.

### Optimization Ideas
- Add a dedicated follow-up slice for non-preview replay execution instead of stretching preview-oriented plans.

## Source-of-Truth Sync

- Formal repo truth affected: yes
- If yes, where it was updated: `packages/adapter-maestro/src/flow-runtime.ts`, `packages/contracts/src/types.ts`, `packages/core/src/session-store.ts`, `packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`, `docs/guides/flow-generation.md`

## Next Step

- Ready for a follow-up Phase 04 plan only if its scope is explicitly limited to unverified replay behavior beyond 04-01.
