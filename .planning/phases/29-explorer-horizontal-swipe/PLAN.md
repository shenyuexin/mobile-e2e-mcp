---
phase: 29-explorer-horizontal-swipe
plan: 01
title: Explorer Horizontal Swipe Discovery — Single-Axis MVP
status: completed
summary_file: 29-01-SUMMARY.md
verify_file: 29-01-VERIFY.md
requirements:
  - EXPL-29-01
  - EXPL-29-02
formal_truth_owners:
  - packages/explorer/src/types.ts
  - packages/explorer/src/scroll-segment.ts
  - packages/explorer/src/engine.ts
  - packages/explorer/src/backtrack.ts
  - packages/explorer/tests/scroll-segment.test.ts
  - docs/architecture/explorer-hybrid-traversal-ascii.md
---

# Phase 29 Plan 01: Explorer Horizontal Swipe Discovery — Single-Axis MVP

## Goal

### Problem

Explorer currently supports **vertical scroll discovery** (Phase 27) to find off-screen elements below the fold, but **horizontal swipe discovery is entirely missing**. Pages with horizontally scrollable content — such as category tabs, image carousels, card lists, and ViewPager-based screens — have actionable elements that are never discovered or explored.

**Evidence gap**:
- `scrollOnly({ direction: "left" | "right" })` is supported by the MCP tool layer, but Explorer's `discoverNextSegment()` hardcodes `direction: "up"`
- `Frame.scrollState` is a single-axis model with no concept of scroll direction
- No detection heuristic exists for horizontal scroll containers (`HorizontalScrollView`, `ViewPager`, `UICollectionView`, etc.)
- Backtrack/restore logic assumes vertical-only scroll recovery

### Expected Outcome

- [ ] Explorer can detect pages whose **primary scroll axis is horizontal** and discover off-screen elements via left-swipe segments
- [ ] Horizontal discovery is **bounded by a probe-swipe safety check** — if the probe changes page identity, horizontal discovery is disabled for that page
- [ ] `Frame.scrollState` carries axis metadata (`axis`, `forwardDirection`, `restoreDirection`, `strategy`, `supportLevel`) without breaking the single-cursor model
- [ ] Engine traversal respects **vertical-first** ordering: a frame only switches to horizontal after vertical segments are exhausted
- [ ] Horizontal support is explicitly marked `experimental` in capability reporting and logs
- [ ] Existing vertical-scroll behavior is **fully preserved** with zero regressions

### Non-goals

- **Simultaneous vertical + horizontal exploration** on the same page (e.g., an e-commerce home page with both a vertical product list and a horizontal category carousel) — out of scope for MVP
- **Container-targeted scroll** — `scrollOnly` does not accept bounds/selector; we accept full-screen best-effort swipe and document the caveat
- **`interleaved` scroll axis priority** — only `vertical-first` is supported in MVP
- **Horizontal scroll on iOS simulator** — deferred until validated on iOS physical device
- **Nested horizontal scrollables** — only the outermost detected horizontal container is considered
- **Tab bar / bottom navigation** treated as horizontal scroll — these are navigation affordances, not content scroll

## Plan

### Strategy

Build a **single-axis MVP** on top of Phase 27's scroll-segment infrastructure:

1. Extend `Frame.scrollState` with axis metadata fields (`axis`, `forwardDirection`, `restoreDirection`, `strategy`, `supportLevel`) while keeping the existing `segmentIndex` / `segments` / `seenKeys` cursor model intact.
2. Add horizontal container detection in `initScrollState()` using className heuristics + bounded probe validation.
3. Modify `discoverNextSegment()` to accept an implicit axis from `scrollState` and emit the correct `scrollOnly` direction.
4. Modify `restoreSegment()` to handle horizontal recovery (`right` swipe to return to origin, then `left` to target segment).
5. Modify `engine.ts` segment exhaustion logic to attempt **one-time horizontal discovery** after vertical segments are exhausted, then pop the frame.
6. Update tests, capability model, and docs to reflect `experimental` horizontal support.

### Read First

- `.planning/PROJECT.md` — planning charter and constraints
- `.planning/phases/27-scroll-discovery-for-off-screen-elements/PLAN.md` — Phase 27 vertical scroll discovery (this phase builds directly on it)
- `packages/explorer/src/types.ts` — `Frame.scrollState` shape
- `packages/explorer/src/scroll-segment.ts` — `initScrollState`, `discoverNextSegment`, `restoreSegment`
- `packages/explorer/src/engine.ts` — DFS loop and segment exhaustion logic
- `packages/explorer/src/backtrack.ts` — backtrack/restore assumptions
- `packages/explorer/src/mcp-adapter.ts` — `McpToolInterface.scrollOnly` contract (no container targeting)
- `docs/engineering/ai-first-capability-expansion-guideline.md` — capability expansion rules
- `docs/architecture/explorer-hybrid-traversal-ascii.md` — traversal architecture

### Task Breakdown

1. **Extend `Frame.scrollState` with backward-compatible axis metadata** (`packages/explorer/src/types.ts`)
   - Add optional fields to existing `scrollState` shape:
     - `axis?: "vertical" | "horizontal"` (default `"vertical"` when absent)
     - `forwardDirection?: "up" | "left"` (default `"up"` when absent)
     - `restoreDirection?: "up" | "right"` (default `"up"` when absent)
     - `strategy?: "continuous-scroll" | "page-snap"` (default `"continuous-scroll"` when absent)
     - `supportLevel?: "stable" | "experimental"` (default `"stable"` when absent)
   - Provide `normalizeScrollState(ss)` helper that fills defaults for any code reading these fields
   - **Rationale (Oracle req)**: Existing tests construct `scrollState` via object literals with required fields only; adding required fields breaks 50+ test assertions. Optional fields + normalizer preserve backward compatibility without rewriting all fixtures.

2. **Add horizontal container detection + bounded probe** (`packages/explorer/src/scroll-segment.ts`)
   - `detectHorizontalScrollables(uiTree)` — className heuristics for Android and iOS
   - Define structured `ProbeResult` type:
     ```typescript
     interface ProbeResult {
       enabled: boolean;
       disabledReason?: "fingerprint_changed" | "no_new_elements" | "scroll_failed" | "unsupported_platform";
       confidence: "high" | "medium" | "low";
       fingerprintBefore: string;
       fingerprintAfter: string;
       newElementCount: number;
     }
     ```
   - `performBoundedProbe(mcp, frame, config, candidates)` — probe workflow:
     a. Record pre-probe fingerprint
     b. Perform one `scrollOnly({ direction: "left", distance: "medium" })`
     c. `waitForUiStable`
     d. Re-inspect and compute post-probe fingerprint
     e. Return structured `ProbeResult`
   - `startHorizontalScrollState(frame, snapshot, config, probeResult)` — **explicit state transition**:
     - Do NOT mutate `frame.scrollState` in place
     - Save `completedVerticalState` (if any) into `frame._completedVerticalState` or discard if vertical was empty
     - Create fresh `scrollState` with `axis: "horizontal"`, `supportLevel: "experimental"`
     - Set `pageFingerprint` to probe's `fingerprintAfter`
   - Keep existing vertical detection as the **primary** path

3. **Make `discoverNextSegment` axis-aware** (`packages/explorer/src/scroll-segment.ts`)
   - Read `frame.scrollState.axis` and `forwardDirection`
   - Emit correct `scrollOnly` direction (`"up"` or `"left"`)
   - Keep all existing same-page fingerprint checks, dedup, and `maxSegments` logic

4. **Make `restoreSegment` axis-aware (MVP scope)** (`packages/explorer/src/scroll-segment.ts`)
   - For `axis === "horizontal"` with `strategy === "continuous-scroll"` (MVP):
     - First swipe `right` to return to origin (compensate for `left` scrolls)
     - Then swipe `left` N times to reach target segment
   - For `strategy === "page-snap"` (deferred to follow-up):
     - Record `swipeCounts: number[]` per segment during discovery
     - MVP: if `strategy === "page-snap"`, use conservative restore (swipe `right` until top, then replay `left` counts)
     - Full page-snap restore with snap-aware positioning is **out of MVP scope**
   - Keep vertical restore logic unchanged

5. **Wire vertical-first → horizontal fallback in engine** (`packages/explorer/src/engine.ts`)
   - After `discoverNextSegment` returns `isLastSegment=true` for vertical:
     - Check if horizontal probe was already attempted for this frame
     - If not, call `performBoundedProbe()` once
     - If probe returns `enabled === true`, call `startHorizontalScrollState(frame, snapshot, config, probeResult)` — **explicit state transition**, not in-place mutation
     - Continue DFS with fresh horizontal segments (`segmentIndex = 0`)
   - After horizontal is also exhausted → normal pop + backtrack
   - **Guard**: `frame-reconciler.ts` must invalidate/re-init `scrollState` when frame state is reconciled after backtrack; add `invalidateScrollStateOnReconcile(frame)` to prevent stale horizontal state from surviving frame reconciliation

6. **Update capability reporting** (`packages/explorer/src/report-generator.ts` or equivalent)
   - ⚠️ **Truth owner check required**: Verify whether `packages/explorer/src/capability-model.ts` exists before editing; if not, locate the actual Explorer capability/reporting module
   - Add `horizontalSwipeDiscovery: "experimental"` to Explorer capability summary
   - Ensure `summary.json` / `report.md` includes:
     - `horizontalSegmentsExplored: number`
     - `horizontalSegmentsSkipped: number`
     - `horizontalProbeDisabledCount: number` (with reasons)
   - Add `horizontalSwipe` caveat to report header: "Horizontal swipe discovery is experimental. Scroll actions are full-screen best-effort and may not target the intended container."

7. **Write tests** (`packages/explorer/tests/scroll-segment.test.ts` and `engine.test.ts`)
   - Horizontal container detection (Android `HorizontalScrollView`, `ViewPager`; iOS `UICollectionView`)
   - Bounded probe: fingerprint unchanged → horizontal enabled
   - Bounded probe: fingerprint changed → horizontal disabled
   - `discoverNextSegment` emits `direction: "left"` for horizontal axis
   - `restoreSegment` uses `right` + `left` for horizontal recovery
   - Engine: vertical exhausted → horizontal discovered → axis switch
   - Engine: vertical + horizontal both exhausted → frame pop
   - Page-snap strategy detection and restore
   - Regression: existing vertical-only tests still pass

8. **Update docs**
   - `docs/architecture/explorer-hybrid-traversal-ascii.md` — note horizontal as experimental
   - `docs/architecture/capability-map.md` — update Explorer capability support level
   - `README.md` — if README lists Explorer features, add horizontal caveat

### Risks / Unknowns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `scrollOnly(left)` triggers system back gesture or wrong container | Medium | High | Bounded probe detects page identity drift; if drift → disable horizontal for that page |
| `RecyclerView` orientation cannot be determined from className alone | High | Medium | Mark confidence as `medium`; require probe validation before enabling |
| iOS `UICollectionView` may be vertical — false positive horizontal detection | Medium | Medium | Same as above: probe validates before enabling; iOS-simulator excluded from MVP |
| Horizontal restore fails on `page-snap` containers (ViewPager retains position) | Medium | High | `page-snap` strategy uses swipe-count-based restore; if fail → abandon segment |
| Existing tests break due to `scrollState` shape change | Low | High | Add defaults so old shape is still valid; run full test suite before claiming done |
| Backtrack after horizontal segment tap lands on wrong position | Medium | High | `restoreSegment` is called before every tap; if restore fails, skip segment |
| Horizontal segment elements overlap with vertical segment elements | Low | Low | `seenKeys` dedup handles overlap; no new logic needed |
| **Probe swipe changes viewport but does not restore origin** | Medium | High | Probe result must include "restore origin" step or record probe viewport as segment origin; if probe lands in middle of carousel, first segment may be incomplete |
| **Frame reconciliation preserves stale `scrollState`** | Medium | High | `frame-reconciler.ts` must invalidate/re-init `scrollState` after backtrack reconciliation; add explicit `invalidateScrollStateOnReconcile(frame)` guard |

### Done Criteria

- [ ] `Frame.scrollState` has axis metadata fields with backward-compatible defaults
- [ ] `initScrollState()` detects horizontal containers and performs bounded probe
- [ ] `discoverNextSegment()` reads axis from `scrollState` and emits correct direction
- [ ] `restoreSegment()` handles horizontal recovery (origin reset + forward replay)
- [ ] `engine.ts` switches from vertical to horizontal once after vertical exhaustion
- [ ] All new code paths have unit tests (minimum 8 new test scenarios)
- [ ] All existing tests pass with zero regressions
- [ ] Capability reporting marks horizontal as `experimental`
- [ ] Docs updated with horizontal support caveat
- [ ] `pnpm build` and `pnpm typecheck` pass

## Implement

### Planned Changes

| File | Change |
|---|---|
| `packages/explorer/src/types.ts` | Add axis metadata fields to `Frame.scrollState` |
| `packages/explorer/src/scroll-segment.ts` | Add `detectHorizontalScrollables`, `initHorizontalScrollState`, axis-aware `discoverNextSegment` and `restoreSegment` |
| `packages/explorer/src/engine.ts` | Add vertical-exhausted → horizontal-discovery fallback in DFS loop |
| `packages/explorer/src/report-generator.ts` (or actual capability owner) | Add `horizontalSwipeDiscovery: "experimental"` and counters to capability summary; verify truth owner before editing |
| `packages/explorer/tests/scroll-segment.test.ts` | Add horizontal detection, probe, segment discovery, restore tests |
| `packages/explorer/tests/engine.test.ts` | Add axis-switch integration tests |
| `docs/architecture/explorer-hybrid-traversal-ascii.md` | Document horizontal as experimental |
| `docs/architecture/capability-map.md` | Update Explorer capability support level |

### Key Decisions To Preserve

1. **Single active axis per frame** — A frame never explores both vertical and horizontal simultaneously. Vertical is exhausted first; horizontal is attempted once; then the frame is popped.
2. **Bounded probe is mandatory** — Horizontal discovery is never enabled without a probe swipe and page-identity verification. No className-only activation.
3. **No container targeting** — `scrollOnly` is full-screen best-effort. The plan documents this as a known limitation, not a bug.
4. **Vertical-first ordering** — This preserves Phase 27 behavior and reduces engine complexity. Horizontal is a fallback, not a peer.
5. **`page-snap` is recorded but not fully implemented in MVP** — The `strategy` field distinguishes `page-snap` from `continuous-scroll`, but full swipe-count-based restore for page-snap containers is deferred to a follow-up phase. MVP uses conservative restore (reset to origin + replay).
6. **iOS-simulator excluded from MVP** — Reduces platform validation surface; enable after iOS-device validation.
7. **Frame reconciliation must invalidate `scrollState`** — `frame-reconciler.ts` does not currently clear `scrollState` during reconciliation. Phase 29 must add `invalidateScrollStateOnReconcile(frame)` to prevent stale horizontal state from corrupting post-backtrack exploration.

## Verify

### Test Cases

- [ ] **TC-1: Horizontal container detection (Android)**
  - Input: `uiTree` with `HorizontalScrollView` node
  - Expected: `detectHorizontalScrollables` returns 1 candidate with confidence `high`

- [ ] **TC-2: Horizontal container detection (iOS)**
  - Input: `uiTree` with `UICollectionView` node
  - Expected: `detectHorizontalScrollables` returns 1 candidate with confidence `medium`

- [ ] **TC-3: Bounded probe — fingerprint unchanged**
  - Input: probe swipe left, post-probe fingerprint == pre-probe fingerprint, new elements found
  - Expected: `scrollState.enabled = true`, `axis = "horizontal"`, `supportLevel = "experimental"`

- [ ] **TC-4: Bounded probe — fingerprint changed**
  - Input: probe swipe left, post-probe fingerprint != pre-probe fingerprint
  - Expected: `scrollState` remains undefined, horizontal disabled for this page

- [ ] **TC-5: Horizontal segment discovery**
  - Input: frame with `axis = "horizontal"`, `segmentIndex = 0`, `forwardDirection = "left"`
  - Expected: `discoverNextSegment` calls `scrollOnly({ direction: "left" })`, appends new segment

- [ ] **TC-6: Horizontal restore**
  - Input: frame with `axis = "horizontal"`, `segmentIndex = 2`, `restoreDirection = "right"`
  - Expected: `restoreSegment` swipes `right` to origin, then `left` twice, verifies target element visible

- [ ] **TC-7: Page-snap restore**
  - Input: frame with `strategy = "page-snap"`, recorded swipe counts `[1, 2]` for segments 1 and 2
  - Expected: `restoreSegment` uses recorded counts instead of `segmentIndex`

- [ ] **TC-8: Engine vertical-first → horizontal switch**
  - Input: vertical segments exhausted, horizontal probe succeeds
  - Expected: `frame.scrollState.axis` mutated to `"horizontal"`, `segmentIndex` reset to 0, DFS continues

- [ ] **TC-9: Legacy scrollState fixture compatibility**
  - Input: test constructs `scrollState` without new optional fields (`axis`, `forwardDirection`, etc.)
  - Expected: code reading these fields via `normalizeScrollState()` gets correct defaults; no compile errors

- [ ] **TC-10: Stale scrollState invalidation after frame reconciliation**
  - Input: frame with horizontal `scrollState` goes through backtrack → reconciliation
  - Expected: `invalidateScrollStateOnReconcile()` clears or re-initializes `scrollState`; old horizontal state does not leak

- [ ] **TC-11: Wrong-container swipe (full-screen left hits system gesture)**
  - Input: `scrollOnly({ direction: "left" })` triggers system back or wrong container
  - Expected: bounded probe detects page identity drift; `ProbeResult.enabled = false`, `disabledReason = "fingerprint_changed"`

- [ ] **TC-12: Tab bar / bottom navigation false positive**
  - Input: `uiTree` contains bottom tab bar with `clickable` nodes but no `scrollable` container
  - Expected: `detectHorizontalScrollables` does not return tab bar as candidate; no horizontal probe attempted

- [ ] **TC-13: Report counters**
  - Input: explorer run with 2 horizontal segments explored, 1 probe disabled due to fingerprint change
  - Expected: `summary.json` contains `horizontalSegmentsExplored: 2`, `horizontalProbeDisabledCount: 1`

- [ ] **TC-14: Regression — existing vertical scroll tests**
  - Input: all existing `scroll-segment.test.ts` test cases
  - Expected: all pass without modification

### Verification Commands

```bash
# Build and typecheck
pnpm build
pnpm typecheck

# Explorer package tests
pnpm --filter @mobile-e2e-mcp/explorer test

# Full test suite (regression check)
pnpm test:ci

# Architecture guardrails
pnpm validate:architecture-guardrails
```

### Acceptance Criteria

- [ ] `Frame.scrollState` shape change is backward-compatible: existing code that reads `scrollState.segmentIndex` still works
- [ ] Horizontal discovery is never activated without a successful bounded probe
- [ ] `discoverNextSegment` never emits `direction: "left"` for a frame whose `axis` is `"vertical"`
- [ ] `restoreSegment` never emits `direction: "right"` for a frame whose `axis` is `"vertical"`
- [ ] Engine never pops a frame before both vertical and horizontal segments are exhausted
- [ ] Capability summary explicitly marks horizontal swipe discovery as `experimental`
- [ ] Docs clearly state the container-targeting limitation

### Success Criteria

- [ ] Explorer can discover and explore horizontally scrollable pages on Android (physical device or emulator)
- [ ] At least one end-to-end explorer run demonstrates horizontal segment discovery in logs
- [ ] No regression in vertical scroll discovery behavior
- [ ] All new tests pass; full test suite passes
- [ ] Architecture guardrails pass (no giant files, no policy leakage into adapter, etc.)
