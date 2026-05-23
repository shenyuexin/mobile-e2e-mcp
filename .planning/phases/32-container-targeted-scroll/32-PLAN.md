# Container-Targeted Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional container-targeted swipe coordinates to `scroll_only` so Explorer horizontal discovery can scroll the intended container instead of relying on full-screen best-effort gestures.

**Architecture:** Extend the existing `scroll_only` gesture contract with an optional rectangular `containerBounds`. The adapter computes coordinates inside that rectangle only when the field is present, while the no-container path remains semantically unchanged. Explorer stores the selected horizontal container bounds in scroll state and reuses them for probe, segment discovery, and restore.

**Tech Stack:** TypeScript, `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/adapter-maestro`, `@mobile-e2e-mcp/explorer`, Node `tsx --test`.

---

## Review Gate

External Oracle review was attempted but did not produce a usable verdict:

- default `opencode run` failed on the local opencode DB checkpoint;
- isolated `XDG_DATA_HOME` fixed DB startup;
- `google/gemini-3-pro-preview` lacked an API key;
- `codexlb/gpt-5.5` and `opencode/deepseek-v4-flash-free` ran without review output and were stopped.

Fallback review verdict: **Acceptable with revisions**. Implementation must include the following corrections before code can be considered complete:

- `containerBounds` is optional and additive. Existing `scroll_only` calls without it must preserve behavior.
- `gestureApplied` keeps existing fields and only adds optional evidence fields such as `coordinateScope` and `containerBoundsApplied`.
- Invalid bounds fail with `CONFIGURATION_ERROR`; they must not silently fall back to viewport scrolling.
- Explorer horizontal state stores the selected bounds once and reuses the same bounds for probe, discover, and restore.
- Initial rollout only applies container targeting to Explorer horizontal scrolling; vertical scroll remains unchanged.

## File Map

- `packages/contracts/src/types.ts`
  - Add `ScrollOnlyContainerBounds`.
  - Add optional `containerBounds` to `ScrollOnlyGesture`.
  - Add optional `coordinateScope` and `containerBoundsApplied` to `ScrollOnlyData.gestureApplied`.

- `packages/adapter-maestro/src/ui-model.ts`
  - Extend `buildScrollOnlySwipeCoordinates()` with optional bounds.
  - Keep current coordinate output unchanged when bounds are omitted.

- `packages/adapter-maestro/src/ui-action-scroll.ts`
  - Validate `gesture.containerBounds`.
  - Return `CONFIGURATION_ERROR` for invalid bounds.
  - Include `coordinateScope` and `containerBoundsApplied` in `gestureApplied`.
  - Use container bounds for dry-run and live execution coordinate generation.

- `packages/adapter-maestro/test/ui-model.test.ts`
  - Add coordinate geometry tests for omitted bounds, horizontal bounds, vertical bounds, and invalid-bound runtime behavior.

- `packages/explorer/src/types.ts`
  - Add optional horizontal container bounds to scroll state.

- `packages/explorer/src/mcp-adapter.ts`
  - Allow Explorer's `scrollOnly()` abstraction to pass optional `containerBounds`.

- `packages/explorer/src/scroll-segment.ts`
  - Extract bounds from detected horizontal candidates.
  - Store the selected bounds in horizontal scroll state.
  - Pass stored bounds to horizontal probe, discover, and restore only.

- `packages/explorer/tests/scroll-segment.test.ts`
  - Add tests proving horizontal container bounds are reused and vertical scroll calls remain unbounded.

- `packages/mcp-server/src/index.ts` and stdio schema tests if needed
  - Update tool description/schema only if current schema generation exposes `ScrollOnlyInput` manually.

- `docs/strategy/mobile-developer-workflow-analysis.md`
- `docs/strategy/mobile-developer-workflow-analysis.zh-CN.md`
  - Replace the “full-screen best-effort” caveat for horizontal Explorer scrolling with the new bounded behavior and remaining limitations.

## Task 1: Contract And Adapter Geometry Tests

**Files:**
- Modify: `packages/contracts/src/types.ts`
- Modify: `packages/adapter-maestro/src/ui-model.ts`
- Test: `packages/adapter-maestro/test/ui-model.test.ts`

- [ ] **Step 1: Write failing coordinate tests**

Add tests near the existing `buildScrollOnlySwipeCoordinates generates correct geometry` test:

```ts
test("buildScrollOnlySwipeCoordinates keeps viewport geometry when container bounds are omitted", () => {
  const coords = buildScrollOnlySwipeCoordinates([], "left", 250);

  assert.deepEqual(coords, {
    start: { x: 810, y: 960 },
    end: { x: 270, y: 960 },
    durationMs: 250,
  });
});

test("buildScrollOnlySwipeCoordinates anchors horizontal gestures inside container bounds", () => {
  const coords = buildScrollOnlySwipeCoordinates([], "left", 250, undefined, undefined, {
    x: 100,
    y: 400,
    width: 300,
    height: 120,
  });

  assert.deepEqual(coords, {
    start: { x: 325, y: 460 },
    end: { x: 175, y: 460 },
    durationMs: 250,
  });
});

test("buildScrollOnlySwipeCoordinates anchors vertical gestures inside container bounds", () => {
  const coords = buildScrollOnlySwipeCoordinates([], "up", 250, undefined, undefined, {
    x: 20,
    y: 200,
    width: 200,
    height: 600,
  });

  assert.deepEqual(coords, {
    start: { x: 120, y: 650 },
    end: { x: 120, y: 350 },
    durationMs: 250,
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test -- --test-name-pattern="container bounds|keeps viewport geometry"
```

Expected: TypeScript/test failure because `buildScrollOnlySwipeCoordinates()` does not accept a bounds argument yet.

- [ ] **Step 3: Add contract types and geometry implementation**

Implement:

```ts
export interface ScrollOnlyContainerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Add to `ScrollOnlyGesture`:

```ts
containerBounds?: ScrollOnlyContainerBounds;
```

Add optional fields to `gestureApplied`:

```ts
coordinateScope?: "viewport" | "container";
containerBoundsApplied?: ScrollOnlyContainerBounds;
```

Update `buildScrollOnlySwipeCoordinates(..., containerBounds?)` so it uses the container rectangle as the coordinate viewport when present.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test -- --test-name-pattern="container bounds|keeps viewport geometry"
```

Expected: PASS.

## Task 2: Runtime Validation And Dry-Run Evidence

**Files:**
- Modify: `packages/adapter-maestro/src/ui-action-scroll.ts`
- Test: `packages/adapter-maestro/test/ui-model.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Add tests near existing `scrollOnlyWithMaestroTool` dry-run tests:

```ts
test("scrollOnlyWithMaestroTool dry-run reports container coordinate scope", async () => {
  const result = await scrollOnlyWithMaestroTool({
    sessionId: "test-scroll-container-dry-run",
    platform: "android",
    deviceId: "device-1",
    gesture: {
      direction: "left",
      containerBounds: { x: 100, y: 400, width: 300, height: 120 },
    },
    swipeDurationMs: 250,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.gestureApplied.coordinateScope, "container");
  assert.deepEqual(result.data.gestureApplied.containerBoundsApplied, { x: 100, y: 400, width: 300, height: 120 });
  assert.ok(JSON.stringify(result.data.commandHistory).includes("325"));
  assert.ok(JSON.stringify(result.data.commandHistory).includes("175"));
});

test("scrollOnlyWithMaestroTool rejects invalid container bounds", async () => {
  const result = await scrollOnlyWithMaestroTool({
    sessionId: "test-scroll-container-invalid",
    platform: "android",
    deviceId: "device-1",
    gesture: {
      direction: "left",
      containerBounds: { x: 100, y: 400, width: 0, height: 120 },
    },
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, REASON_CODES.configurationError);
  assert.match(result.nextSuggestions?.[0] ?? "", /containerBounds/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test -- --test-name-pattern="container coordinate scope|invalid container bounds"
```

Expected: FAIL because runtime does not validate or report container scope.

- [ ] **Step 3: Implement validation and evidence**

Add a local validator:

```ts
function normalizeScrollOnlyContainerBounds(bounds: ScrollOnlyInput["gesture"]["containerBounds"]): ScrollOnlyContainerBounds | string | undefined
```

Rules:

- omitted -> `undefined`
- all values must be finite numbers
- `width > 0`
- `height > 0`
- `x >= 0`
- `y >= 0`

Include normalized bounds in `NormalizedScrollGesture`, pass it to coordinate generation, and set:

```ts
coordinateScope: normalized.containerBounds ? "container" : "viewport"
containerBoundsApplied: normalized.containerBounds
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test -- --test-name-pattern="scrollOnlyWithMaestroTool|buildScrollOnlySwipeCoordinates"
```

Expected: PASS.

## Task 3: Explorer Contract And Horizontal Wiring

**Files:**
- Modify: `packages/explorer/src/types.ts`
- Modify: `packages/explorer/src/mcp-adapter.ts`
- Modify: `packages/explorer/src/scroll-segment.ts`
- Test: `packages/explorer/tests/scroll-segment.test.ts`

- [ ] **Step 1: Write failing Explorer tests**

Add tests that create a horizontal candidate with bounds and assert:

- `performBoundedProbe()` calls `scrollOnly({ direction: "left", containerBounds })`
- `discoverNextSegment()` uses `frame.scrollState.containerBounds`
- vertical scroll state calls omit `containerBounds`

Use the existing mock `McpToolInterface` style in `scroll-segment.test.ts`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/explorer test -- --test-name-pattern="container bounds|vertical scroll"
```

Expected: FAIL because Explorer's `scrollOnly` type does not accept bounds and scroll-segment does not pass them.

- [ ] **Step 3: Implement Explorer bounds extraction and reuse**

Implementation requirements:

- parse common bounds shapes from `UiHierarchy`:
  - Android string: `"[x1,y1][x2,y2]"`
  - object: `{ x, y, width, height }`
  - object: `{ left, top, right, bottom }`
- choose the highest-confidence horizontal candidate with valid bounds;
- save it in `frame.scrollState.containerBounds`;
- pass it only when `normalizeScrollState(ss).axis === "horizontal"`;
- leave vertical scroll calls unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/explorer test -- --test-name-pattern="container bounds|vertical scroll"
```

Expected: PASS.

## Task 4: Tool Surface Documentation And Regression Verification

**Files:**
- Modify: `packages/mcp-server/src/index.ts` if needed
- Modify: `docs/strategy/mobile-developer-workflow-analysis.md`
- Modify: `docs/strategy/mobile-developer-workflow-analysis.zh-CN.md`
- Modify: `.planning/ROADMAP.md`
- Modify: `.planning/STATE.md`

- [ ] **Step 1: Update docs**

Docs should say:

- `scroll_only` supports optional container-targeted coordinates.
- Explorer horizontal scrolling uses detected container bounds when available.
- Remaining caveat: detection depends on bounds being present and valid in the UI tree; otherwise Explorer falls back to existing full-screen bounded probe behavior or disables horizontal path if page identity changes.

- [ ] **Step 2: Run targeted verification**

Run:

```bash
pnpm --filter @mobile-e2e-mcp/adapter-maestro test
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Run no-device probe contract checks**

Run:

```bash
pnpm run test:probe-report-contract
pnpm run validate:probe-dry-run
```

Expected: both pass. If sandbox blocks `tsx` IPC pipes, rerun with approved escalation.

## Completion Criteria

- Existing `scroll_only` calls without `containerBounds` retain viewport/default coordinate behavior.
- Invalid container bounds fail loudly with `CONFIGURATION_ERROR`.
- Explorer horizontal scroll calls pass stable bounds when available.
- Explorer vertical scroll calls do not pass bounds.
- Adapter and Explorer targeted tests pass.
- `pnpm typecheck` and `git diff --check` pass.
