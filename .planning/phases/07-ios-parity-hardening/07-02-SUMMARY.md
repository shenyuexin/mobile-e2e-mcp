---
phase: 07-ios-parity-hardening
plan: 02
summary_type: internal-planning
task_type: chore
completed: 2026-03-30
requirements_completed: []
key_files:
  created:
    - .planning/phases/07-ios-parity-hardening/07-02-SUMMARY.md
    - .planning/phases/07-ios-parity-hardening/07-02-VERIFY.md
  modified:
    - .planning/ROADMAP.md
    - .planning/STATE.md
repo_truth_synced: []
verify_file: 07-02-VERIFY.md
---

# Phase 07 Plan 02 Summary

## Meta
- Task ID: 07-02
- Date: 2026-03-30
- Repo: mobile-e2e-mcp
- Branch: current workspace
- Owner: OpenCode agent
- Type: chore

## Goal

### Problem
Phase 07 needed a durable decision on the target iOS UI backend path before any selector, recording, observability, or support-promotion work could proceed safely.

### Expected Outcome
- [x] A concrete backend design now exists for the next iOS UI execution lane.
- [x] The design explicitly answers whether parity should come from extending idb, introducing a WDA/XCUITest-grade lane, or supporting both long-term.
- [x] Future implementation can continue without reopening the backend-path decision in every session.

### Non-goals
- Implementing the new iOS backend in this slice.
- Promoting iOS support-level claims.
- Reworking Android runtime behavior.

## Plan

### Strategy
Compare the current Android and iOS runtime boundaries, combine that with external backend references and Oracle review, then lock one target direction and preserve the rollout constraints in `.planning` before implementation starts.

### Task Breakdown
1. Read the current iOS and Android runtime hooks, shared orchestration, doctor/toolchain seams, tests, and capability notes.
2. Collect external evidence on idb versus WDA/XCUITest-style UI backends.
3. Use Oracle review to choose the target path and record what should be decided now versus deferred.
4. Sync the planning workspace so `07-03` can proceed above a fixed backend assumption.

### Risks / Unknowns
- The eventual WDA/XCUITest provisioning path is still deferred and may affect implementation complexity later.
- Real-device proof remains a later concern; this slice locks the architectural target, not the support-grade evidence bar.

### Done Criteria
- [x] The iOS backend path decision is explicit and durable enough for later implementation.
- [x] Future work now knows which files own backend strategy, runtime probing, and action execution seams.
- [x] The design keeps deterministic-first behavior and honest partial/fallback semantics intact.

## Implement

### Changes
- Added `.planning/phases/07-ios-parity-hardening/07-02-SUMMARY.md` to record the backend-path decision.
- Added `.planning/phases/07-ios-parity-hardening/07-02-VERIFY.md` to capture the evidence and advancement gate for the decision.
- Updated `.planning/ROADMAP.md` so `07-02` is complete and `07-03` becomes the next slice.
- Updated `.planning/STATE.md` so the fast-resume point now starts from selector/action fidelity work on top of the chosen backend direction.

### Key Decisions
- The target primary iOS UI backend is **WDA/XCUITest-grade element interaction**, not a deeper long-term investment in idb-only UI semantics.
- The current **idb path stays only as a temporary compatibility/fallback lane during rollout**, not as a permanent dual-primary architecture.
- `ui-runtime-platform.ts` should evolve from one iOS hook object into a backend-strategy seam.
- iOS-specific capture/probe logic should move out of the shared `ui-runtime.ts` file into backend-specific modules so `ui-runtime.ts` stays focused on shared polling and loop behavior.
- Support-level promotion stays deferred until later slices add runtime implementation, regression coverage, and proof lanes.

### Notes
- This slice closes a planning decision only; no runtime behavior has changed yet.
- The deciding evidence came from current repo code, external backend references, and Oracle review, all aligned on idb being useful as transport/lifecycle plumbing but weak as the final semantic UI backend for parity work.

### Deviations
- None — the slice stayed within the planned 07-02 scope.

## Verify

### Test Cases
- [x] The summary states the current iOS path and the chosen target path.
- [x] The summary names the adapter boundaries that future implementation must change.
- [x] The summary preserves fallback and support-boundary honesty.

### Evidence Types
- [ ] test
- [x] command
- [ ] screenshot
- [ ] log

### Evidence
```bash
grep -n "inspect_ui\|tap_element\|type_into_element\|wait_for_ui" packages/adapter-maestro/src/capability-model.ts
# confirms current iOS support notes and the partial/full split that 07-02 must interpret honestly

grep -n "buildIosUiDescribeCommand\|captureIosUiSnapshot\|probeIdbAvailability" packages/adapter-maestro/src/ui-runtime.ts
# confirms current iOS capture/probe logic is still embedded in shared runtime code

grep -n "buildTapCommand\|buildTypeTextCommand\|buildHierarchyCapturePreviewCommand" packages/adapter-maestro/src/ui-runtime-ios.ts
# confirms the current iOS hook is a thin idb-backed command builder
```

- Artifact / diff / readback:
  - Oracle review selected WDA/XCUITest-grade backend as the primary target lane and idb as transitional compatibility/fallback only.
  - External reference brief concluded idb is useful as transport/lifecycle substrate, while WDA/XCUITest is the stronger semantic UI backend for selector/action parity.

### Result
- ✅ Success

### Execution Metrics
- Duration: architecture decision slice
- Verification scenarios run: 3 readback checks + Oracle review + external reference brief
- Environments checked: local planning workspace and source readback
- Notable evidence count: repo runtime readback + capability readback + Oracle verdict + external backend comparison

## Retro

### What went well
- The codebase already separated shared orchestration from platform hooks enough to make the backend decision legible.
- External references and Oracle both converged on the same answer, reducing ambiguity.

### What went wrong
- Current capability metadata makes iOS actions look stronger than the underlying inspect/runtime maturity, so later slices will need to keep truth-sync discipline tight.

### Reusable Rule
- If selector/action parity depends on deeper platform semantics than the current transport CLI provides, then lock the semantic backend target before touching ranking or replay logic, because higher-layer improvements will otherwise be built on the wrong foundation.

### Optimization Ideas
- The future implementation slice should create backend-specific iOS runtime modules early so shared runtime code stops carrying idb-specific branches.

## Source-of-Truth Sync

- Formal repo truth affected: no
- If yes, where it was updated: []

## Next Step

- Ready for `07-03-PLAN.md`
