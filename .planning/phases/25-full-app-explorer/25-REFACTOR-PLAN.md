# Phase 25 Refactor Plan — Explorer StateGraph Hybrid

## Goal

Refactor explorer traversal from path-first DFS into a state-transition validated hybrid model while preserving deterministic-first behavior and incremental delivery.

## Baseline Preservation Rule

- Treat commit `7804ac5d` as the known-good **iOS Explorer behavior baseline** for Phase 25 follow-on refactors.
- Any hook/platform-seam extraction must preserve iOS behavior first before Android experimentation is allowed to influence shared explorer contracts.
- Android real-device hook work remains additive/provisional until it is independently verified; it must not redefine shared defaults during the baseline-preservation slice.

## Scope

- package focus: `packages/explorer`
- docs + planning sync only (no MCP tool surface expansion)
- rollout via feature flags and PR slicing

---

## PR Split (Execution Backbone)

### PR 0 — `test(explorer): lock iOS baseline parity before hook extraction`

**Objective**
- Freeze the verified iOS lane before platform-seam refactors.
- Add parity fixtures for direct-tree vs wrapped-result payload shapes and current back/title/actionability behavior.

**Files (expected)**
- `packages/explorer/tests/**/*.test.ts`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/element-prioritizer.ts`

**Deliverables**
- explicit iOS baseline tests tied to `7804ac5d` behavior
- merge gate preventing shared parser/actionability changes without iOS parity coverage
- documented stop/go checkpoint before Android-driven hook work

**Acceptance**
- iOS parity is locked before shared explorer/platform-hook extraction starts
- Android experimentation cannot become the de facto source of truth for shared explorer behavior

---

### PR 1 — `feat(explorer): add transition commit + stale-frame guard`

**Objective**
- Separate action execution from navigation commit.
- Block stale frame action emission.

**Files (expected)**
- `packages/explorer/src/engine.ts`
- `packages/explorer/src/types.ts`
- `packages/explorer/tests/engine.test.ts`

**Deliverables**
- event taxonomy: `action_sent`, `post_state_observed`, `transition_committed|rejected`
- epoch guard for frame invalidation
- home recovery hard-stop (no ghost taps)

**Acceptance**
- cannot continue sibling taps when current UI does not match top frame state
- tests for stale-frame continuation regression

---

### PR 2 — `feat(explorer): introduce state graph and state identity`

**Objective**
- Introduce explicit state nodes/edges and stronger state identity.

**Files (expected)**
- `packages/explorer/src/state-graph.ts` (new)
- `packages/explorer/src/page-registry.ts`
- `packages/explorer/src/snapshot.ts`
- `packages/explorer/src/types.ts`
- `packages/explorer/tests/page-registry.test.ts`

**Deliverables**
- `StateNode`, `TransitionEdge` model
- state fingerprint composite (`structureHash + textHash + keyElementsHash`)
- edge accounting by `(stateId, intentLabel)`

**Acceptance**
- reduced false-equality collisions on similarly titled pages
- deterministic state ID generation under same profile

---

### PR 3 — `refactor(explorer): graph-backed dfs traversal and recovery`

**Objective**
- Make DFS traversal graph-aware and recovery contract-driven.

**Files (expected)**
- `packages/explorer/src/engine.ts`
- `packages/explorer/src/backtrack.ts`
- `packages/explorer/src/state-graph.ts`
- `packages/explorer/tests/engine.test.ts`
- `packages/explorer/tests/backtrack.test.ts`

**Deliverables**
- coherence check before each sibling action
- bounded recovery ladder: `Back -> Cancel -> Home -> Relaunch`
- transition commit gating integrated with DFS cursor movement

**Acceptance**
- no `General -> About -> General -> About` loop progression unless graph transition commits
- deep return chains resume correct parent/sibling order

---

### PR 4 — `test(explorer): add deep backtracking regression matrix`

**Objective**
- Lock behavior with scenario matrix and run evidence.

**Files (expected)**
- `packages/explorer/tests/engine.test.ts`
- `packages/explorer/tests/backtrack.test.ts`
- `packages/explorer/tests/report/*.test.ts`
- `scripts/explorer/test-explorer.ts` (if needed for scenario knobs)

**Deliverables**
- matrix cases:
  - About/iOS Version/Cert chain
  - Fonts/System Fonts/font-detail chain
  - Add Language picker with Cancel recovery
  - home recovery failure abort
- artifact checks for tree/graph consistency and sampling transparency

**Acceptance**
- matrix all green in CI path (`pnpm --filter @mobile-e2e-mcp/explorer test`)
- targeted smoke evidence attached

---

## Detailed Work Packages

## WP-A: Transition Ledger Foundation

- [ ] add transition event struct + reason codes
- [ ] emit action lifecycle events
- [ ] prevent cursor advancement on rejected transitions
- [ ] add tests for action/reject/commit separation

## WP-B: Frame Coherence Enforcement

- [ ] enforce top-frame/current-state equality before sibling tap
- [ ] add epoch invalidation on any pop/recovery rewrite
- [ ] abort on unrecoverable home mismatch

## WP-C: StateGraph Core

- [ ] implement node/edge registry and in-memory API
- [ ] wire registry into engine loop
- [ ] add utility to query outgoing unexplored intents

## WP-D: Recovery Planner

- [ ] encode recovery ladder with post-condition checks
- [ ] add bounded attempts + structured recovery logs
- [ ] ensure fallback does not silently advance frame

## WP-E: Report & Observability Adjustments

- [ ] include commit/reject counters in summary
- [ ] include sampling detail transparency in tree/summary
- [ ] include mismatch context snapshots for debugging

---

## Verification Plan

Per PR minimum:

- [ ] `pnpm --filter @mobile-e2e-mcp/explorer test`
- [ ] `pnpm --filter @mobile-e2e-mcp/explorer typecheck`
- [ ] one targeted smoke run with artifacts attached

Phase end:

- [ ] compare mismatch/abort metrics against baseline runs (`2026-04-15T03-26-32`, `2026-04-15T07-53-25`)
- [ ] confirm sibling continuity after deep branch returns

---

## Feature Flags / Rollout

Recommended flags:

- `EXPLORER_ENABLE_TRANSITION_COMMIT`
- `EXPLORER_ENABLE_STATE_GRAPH`
- `EXPLORER_ENABLE_GRAPH_BACKTRACK`

Rollout order:

1. enable commit guard in dev
2. keep iOS lane authoritative while state graph/hook extraction runs in shadow mode
3. enable state graph in shadow mode
4. enable Android graph-backed recovery/hook path for smoke only after iOS parity gates stay green
5. full mode cutover after metrics stabilize

---

## Risks and Mitigations

1. **Too-strict state gating increases aborts**
   - mitigation: progressive rollout + explicit recovery ladder
2. **State ID instability across dynamic pages**
   - mitigation: key-elements hash + app context normalization
3. **Complexity creep in engine.ts**
   - mitigation: extract `state-graph.ts` and `recovery-planner.ts` utilities

---

## Done Criteria

- [ ] all 4 PRs merged with green targeted validation
- [ ] no ghost progress behavior in smoke logs
- [ ] deep backtracking scenarios pass regression matrix
- [ ] docs updated: architecture + engineering notes + phase summary
