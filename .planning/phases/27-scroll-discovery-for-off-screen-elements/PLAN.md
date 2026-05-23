# Phase 27: Progressive Scroll-Aware DFS (Single Frame + Segment Cursor)

## Problem Statement

The Android Settings explorer currently only captures elements visible on the first viewport. Long scrollable lists (e.g., the Settings homepage) have many navigable rows below the fold that are never discovered, causing incomplete traversal.

**Evidence from latest run (`2026-04-28T03-38-20`)**:
- Settings homepage `clickableCount=8` (only first-viewport items: Bluetooth, SIMs, More connections, Notifications, Sounds, Display, Home screen, Settings)
- Missing: Wi-Fi (explicitly excluded by code), Airplane mode (filtered as toggle), and all items further down (Apps, Security, Privacy, Storage, Accounts, System management, About phone, etc.)
- `totalPages=45` with many branches never reached because the entry elements were off-screen

## Goal

Redesign element discovery so that **scrollable pages are explored segment-by-segment within a single logical frame**, where each scroll position reveals a new set of elements that are DFS-expanded before moving to the next segment. A single page frame holds all segments and a cursor; scrolling is managed as page-local state.

## Design Principles

1. **Single logical frame per page**: One frame represents one logical page regardless of how many scroll positions it has. The frame owns a `segmentIndex` cursor and a `segments` array.
2. **Actionability guaranteed by restore**: Before tapping any element in segment N, the engine ensures the viewport is at segment N via an explicit restore algorithm. If restore fails, the segment is abandoned.
3. **No snapshot mutation**: `captureSnapshot()` remains read-only. Scroll actions happen in the engine's frame-local exploration logic.
4. **Cumulative dedup**: Elements are deduplicated against a page-level `seenKeys` set, not just the previous segment.
5. **Segment transitions are internal bookkeeping**: They are **not** registered as forward navigation transitions in the state graph or counted by the circuit breaker.
6. **Hard termination**: `maxSegments` and `maxRestoreAttempts` prevent infinite loops.

## Core Concepts

### Scroll Segment

A scroll segment represents one viewport of a scrollable page. Segments are stored inside a single frame:

```
Frame "Settings" (depth=2)
├── segments[0]: [Bluetooth, SIMs, More connections, Notifications, Sounds, Display, Home screen, Settings]
├── segments[1]: [Wi-Fi, Airplane mode, Apps, Security, Privacy]
├── segments[2]: [Storage, Accounts, System management, About phone]
├── segmentIndex: 1        ← current cursor
├── seenKeys: Set          ← cumulative dedup keys for this page
└── scrollable: true
```

### Frame Extension

```typescript
export interface Frame {
  state: PageState;
  depth: number;
  path: string[];
  elementIndex: number;
  elements: ClickableTarget[];          // Alias for segments[segmentIndex]
  parentTitle?: string;
  appId?: string;
  isExternalApp?: boolean;
  noOpElements?: Set<string>;
  /** NEW: scroll-aware exploration state */
  scrollState?: {
    enabled: boolean;                  // true if this page is scrollable
    segmentIndex: number;              // current segment cursor
    segments: ClickableTarget[][];     // all discovered segments
    seenKeys: Set<string>;             // cumulative element keys for dedup
    pageFingerprint: string;           // stable identity for same-page checks
    maxSegments: number;               // hard limit (default 10)
    restoreAttempts: number;           // current restore attempt count
    maxRestoreAttempts: number;        // hard limit (default 3)
  };
}
```

### Frame Accessor

```typescript
function getCurrentSegmentElements(frame: Frame): ClickableTarget[] {
  if (!frame.scrollState || frame.scrollState.segments.length === 0) {
    return frame.elements;
  }
  return frame.scrollState.segments[frame.scrollState.segmentIndex] ?? [];
}
```

### Segment Lifecycle

```
Enter page "Settings"
  → capture snapshot at top → push Frame
  → frame.scrollState.enabled = hasScrollableContainer(uiTree)
  → frame.scrollState.segments[0] = first-viewport elements
  → DFS explores segment 0 (Bluetooth → child page → back)

After back from child:
  → restoreSegment(frame, 0) — ensure viewport is at segment 0
  → Continue exploring segment 0 elements

Segment 0 exhausted:
  → discoverNextSegment(frame)
  → scroll down + inspect_ui
  → If same page and new elements:
      → segmentIndex = 1
      → segments[1] = new elements
      → Continue DFS (no push/pop, same frame)
  → If no new elements or page changed:
      → scrollState.enabled = false
      → Pop frame, backtrack to parent
```

## Implementation Plan

### Step 1: Extend Types (`packages/explorer/src/types.ts`)

Replace `scrollSegment` with `scrollState`:

```typescript
export interface Frame {
  state: PageState;
  depth: number;
  path: string[];
  elementIndex: number;
  elements: ClickableTarget[];
  parentTitle?: string;
  appId?: string;
  isExternalApp?: boolean;
  noOpElements?: Set<string>;
  /** Scroll-aware exploration state for long scrollable pages */
  scrollState?: {
    enabled: boolean;
    segmentIndex: number;
    segments: ClickableTarget[][];
    seenKeys: Set<string>;
    pageFingerprint: string;
    maxSegments: number;
    restoreAttempts: number;
    maxRestoreAttempts: number;
  };
}
```

### Step 2: Add Scroll-Segment Engine Module (`packages/explorer/src/scroll-segment.ts`)

New file with scroll-aware logic. This is a **pure helper** called by the engine; it does not push/pop frames or register state graph transitions.

```typescript
import type { McpToolInterface, ExplorerConfig, PageSnapshot, UiHierarchy, Frame } from "./types.js";
import { findClickableElements, getElementKey } from "./element-prioritizer.js";
import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import { flattenTree } from "./element-prioritizer.js";

export interface SegmentDiscoveryResult {
  success: boolean;
  newElements?: ClickableTarget[];
  isLastSegment?: boolean;
}

const DEFAULT_MAX_SEGMENTS = 10;
const DEFAULT_MAX_RESTORE_ATTEMPTS = 3;

/**
 * Compute a stable page fingerprint for same-page detection.
 * Uses: appId + pageContext.type + top 3 visible texts + structural hash prefix.
 */
function computePageFingerprint(snapshot: PageSnapshot): string {
  const topTexts = flattenTree(snapshot.uiTree)
    .map(n => n.text || n.contentDesc)
    .filter(Boolean)
    .slice(0, 3)
    .join("|");
  const type = snapshot.pageContext?.type ?? "unknown";
  return `${snapshot.appId}::${type}::${topTexts}`;
}

/**
 * Initialize scrollState on a newly pushed frame.
 */
export function initScrollState(
  frame: Frame,
  snapshot: PageSnapshot,
  config: ExplorerConfig,
): void {
  const hasScrollable = flattenTree(snapshot.uiTree).some(n => n.scrollable);
  if (!hasScrollable) {
    return;
  }

  const elements = findClickableElements(snapshot.uiTree, config);
  const seenKeys = new Set(elements.map(getElementKey).filter(Boolean));

  frame.scrollState = {
    enabled: true,
    segmentIndex: 0,
    segments: [elements],
    seenKeys,
    pageFingerprint: computePageFingerprint(snapshot),
    maxSegments: DEFAULT_MAX_SEGMENTS,
    restoreAttempts: 0,
    maxRestoreAttempts: DEFAULT_MAX_RESTORE_ATTEMPTS,
  };

  console.log(`[SCROLL-STATE] Initialized for "${snapshot.screenTitle}" — ${elements.length} elements in segment 0, fingerprint=${frame.scrollState.pageFingerprint}`);
}

/**
 * Discover the next scroll segment for the given frame.
 * Called when the current segment's elements are exhausted.
 *
 * 1. Scroll down via scrollOnly
 * 2. Wait for UI stable
 * 3. Capture new snapshot
 * 4. Validate same-page invariant (fingerprint match)
 * 5. Extract new elements (dedup against seenKeys)
 * 6. If new elements found: append to segments, increment segmentIndex
 * 7. If not: mark as last segment
 */
export async function discoverNextSegment(
  mcp: McpToolInterface,
  frame: Frame,
  config: ExplorerConfig,
): Promise<SegmentDiscoveryResult> {
  if (!frame.scrollState?.enabled) {
    return { success: false, isLastSegment: true };
  }

  const ss = frame.scrollState;
  if (ss.segmentIndex + 1 >= ss.maxSegments) {
    console.log(`[SCROLL-SEGMENT] maxSegments (${ss.maxSegments}) reached`);
    return { success: false, isLastSegment: true };
  }

  const platformHooks = resolveExplorerPlatformHooks(config.platform);

  // 1. Scroll down
  const scrollResult = await mcp.scrollOnly({ direction: "down", distance: "medium" });
  if (scrollResult.status !== "success" && scrollResult.status !== "partial") {
    console.log(`[SCROLL-SEGMENT] scrollOnly failed: ${scrollResult.reasonCode}`);
    return { success: false, isLastSegment: true };
  }

  // 2. Wait for stabilization
  await mcp.waitForUiStable({ timeoutMs: 3000 });

  // 3. Capture post-scroll snapshot
  const inspectResult = await mcp.inspectUi({ appId: config.appId });
  if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
    return { success: false, isLastSegment: true };
  }

  const inspectData = inspectResult.data as unknown as Record<string, unknown>;
  const uiTree = platformHooks.parseInspectUi(inspectData, { fallbackToDataRoot: true }) as UiHierarchy;

  // 4. Same-page invariant (fingerprint match)
  const pageContext = typeof inspectData.pageContext === "object" && inspectData.pageContext !== null
    ? inspectData.pageContext
    : undefined;
  const appId = platformHooks.extractAppId(uiTree) ?? config.appId;
  const postSnapshot: PageSnapshot = {
    screenId: "", // not used here
    screenTitle: platformHooks.extractScreenTitle(uiTree),
    pageContext: pageContext as PageSnapshot["pageContext"],
    uiTree,
    clickableElements: [],
    screenshotPath: "",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: frame.depth,
    loadTimeMs: 0,
    stabilityScore: 1.0,
    appId,
    isExternalApp: false,
  };
  const newFingerprint = computePageFingerprint(postSnapshot);

  if (newFingerprint !== ss.pageFingerprint) {
    console.log(`[SCROLL-SEGMENT] Page fingerprint changed: ${ss.pageFingerprint} → ${newFingerprint}. Stopping.`);
    return { success: false, isLastSegment: true };
  }

  // 5. Extract and dedup new elements
  const allElements = findClickableElements(uiTree, config);
  const newElements = allElements.filter(e => {
    const key = getElementKey(e);
    return key && !ss.seenKeys.has(key);
  });

  if (newElements.length === 0) {
    console.log(`[SCROLL-SEGMENT] No new elements after scroll — bottom reached.`);
    return { success: false, isLastSegment: true };
  }

  // 6. Update state
  for (const el of newElements) {
    const key = getElementKey(el);
    if (key) ss.seenKeys.add(key);
  }
  ss.segmentIndex += 1;
  ss.segments.push(newElements);
  ss.restoreAttempts = 0;

  console.log(`[SCROLL-SEGMENT] Segment ${ss.segmentIndex}: +${newElements.length} new elements (total unique: ${ss.seenKeys.size})`);
  return { success: true, newElements, isLastSegment: false };
}

/**
 * Restore the viewport to the current segment position before tapping an element.
 *
 * This is called after backtracking from a child page to ensure the element
 * we are about to tap is actually visible.
 *
 * Algorithm:
 * 1. Capture current snapshot
 * 2. Compute current fingerprint and visible elements
 * 3. If fingerprint matches and current segment's first element is visible → success
 * 4. If not, scroll down from top up to segmentIndex times, checking after each scroll
 * 5. If restore fails after maxRestoreAttempts → abandon segment
 */
export async function restoreSegment(
  mcp: McpToolInterface,
  frame: Frame,
  config: ExplorerConfig,
): Promise<boolean> {
  if (!frame.scrollState?.enabled) {
    return true;
  }

  const ss = frame.scrollState;
  if (ss.segmentIndex === 0) {
    // Segment 0 is always at the top; assume we are there after backtrack
    return true;
  }

  const platformHooks = resolveExplorerPlatformHooks(config.platform);

  // 1. Check if we are already at the right segment
  const inspectResult = await mcp.inspectUi({ appId: config.appId });
  if (inspectResult.status === "success" || inspectResult.status === "partial") {
    const data = inspectResult.data as unknown as Record<string, unknown>;
    const uiTree = platformHooks.parseInspectUi(data, { fallbackToDataRoot: true }) as UiHierarchy;
    const currentElements = findClickableElements(uiTree, config);
    const expectedFirstElement = ss.segments[ss.segmentIndex]?.[0];
    if (expectedFirstElement && currentElements.some(e => getElementKey(e) === getElementKey(expectedFirstElement))) {
      console.log(`[SCROLL-RESTORE] Already at segment ${ss.segmentIndex}`);
      return true;
    }
  }

  // 2. Need to restore — scroll down from top
  console.log(`[SCROLL-RESTORE] Restoring to segment ${ss.segmentIndex}`);
  ss.restoreAttempts += 1;

  if (ss.restoreAttempts > ss.maxRestoreAttempts) {
    console.log(`[SCROLL-RESTORE] maxRestoreAttempts (${ss.maxRestoreAttempts}) exceeded — abandoning segment ${ss.segmentIndex}`);
    return false;
  }

  // 3. Scroll to top first (optional: if we know we are at bottom, scroll up)
  // For Android Settings, system_back usually returns to top, so we scroll down from top
  for (let i = 0; i < ss.segmentIndex; i++) {
    const scrollResult = await mcp.scrollOnly({ direction: "down", distance: "medium" });
    if (scrollResult.status !== "success" && scrollResult.status !== "partial") {
      return false;
    }
    await mcp.waitForUiStable({ timeoutMs: 2000 });
  }

  // 4. Verify restore
  const verifyResult = await mcp.inspectUi({ appId: config.appId });
  if (verifyResult.status === "success" || verifyResult.status === "partial") {
    const data = verifyResult.data as unknown as Record<string, unknown>;
    const uiTree = platformHooks.parseInspectUi(data, { fallbackToDataRoot: true }) as UiHierarchy;
    const currentElements = findClickableElements(uiTree, config);
    const expectedFirstElement = ss.segments[ss.segmentIndex]?.[0];
    if (expectedFirstElement && currentElements.some(e => getElementKey(e) === getElementKey(expectedFirstElement))) {
      console.log(`[SCROLL-RESTORE] Successfully restored to segment ${ss.segmentIndex}`);
      return true;
    }
  }

  console.log(`[SCROLL-RESTORE] Failed to restore segment ${ss.segmentIndex}`);
  return false;
}
```

### Step 3: Modify Engine Frame Lifecycle (`packages/explorer/src/engine.ts`)

#### 3a. On first frame entry (initialize scroll state)

After pushing a child frame, initialize scroll state:

```typescript
// After: stack.push(childFrame)
initScrollState(childFrame, nextStateSnapshot, config);
```

#### 3b. On element tap (before executing tap)

Before tapping an element in a scrollable frame, ensure we are at the right segment:

```typescript
// In the main loop, before executing the next action:
const currentElements = getCurrentSegmentElements(frame);
const element = currentElements[frame.elementIndex];

if (frame.scrollState && frame.scrollState.segmentIndex > 0) {
  const restored = await restoreSegment(mcp, frame, config);
  if (!restored) {
    // Restore failed — mark remaining elements in this segment as no-op and move on
    console.log(`[SCROLL-RESTORE] Giving up on segment ${frame.scrollState.segmentIndex}`);
    frame.elementIndex = currentElements.length; // skip to end of segment
    continue;
  }
}

// Execute tap...
```

#### 3c. On segment exhaustion (discover next segment)

When `elementIndex >= currentElements.length`:

```typescript
// Current segment exhausted
if (frame.scrollState?.enabled) {
  const result = await discoverNextSegment(mcp, frame, config);
  if (result.success && result.newElements && result.newElements.length > 0) {
    // Reset elementIndex to explore new segment
    frame.elementIndex = 0;
    console.log(`[SCROLL-SEGMENT] Exploring segment ${frame.scrollState.segmentIndex} with ${result.newElements.length} elements`);
    continue; // restart loop with new segment
  }
}

// No more segments or not scrollable — normal pop + backtrack
console.log(`[POP] Frame "${frame.state.screenTitle}" all elements explored.`);
stack.pop();
// ... existing backtrack logic
```

#### 3d. Frame accessor

Replace `frame.elements` usage with `getCurrentSegmentElements(frame)` throughout the engine:

```typescript
// Before:
const element = frame.elements[frame.elementIndex];

// After:
const currentElements = getCurrentSegmentElements(frame);
const element = currentElements[frame.elementIndex];
```

### Step 4: Modify Element Prioritizer (`packages/explorer/src/element-prioritizer.ts`)

Add `getElementKey` as a public export (if not already present):

```typescript
export function getElementKey(el: UiHierarchy): string {
  return [el.resourceId, el.contentDesc || el.accessibilityLabel, el.text]
    .filter(Boolean)
    .join("|");
}
```

### Step 5: State Graph and Circuit Breaker Integration

**Critical rule**: Segment progression is **not** a page navigation. Do **not** register it as a `forward` transition.

Changes in `engine.ts`:

- Remove any `stateGraph.registerTransition({ kind: "forward", intentLabel: "<scroll-segment-N>" })` calls
- Segment transitions are internal bookkeeping only
- The `transitionLifecycle.transitionCommitted` counter should **not** be incremented for segment changes
- The circuit breaker should treat segment changes as **same-page** activity, not as a new page

```typescript
// When segment changes:
// stateGraph.registerTransition({ ... }) — DO NOT CALL
// transitionLifecycle.transitionCommitted += 1 — DO NOT INCREMENT
// Instead, log internally:
console.log(`[SCROLL-SEGMENT] Advanced to segment ${frame.scrollState.segmentIndex}`);
```

### Step 6: Testing

Add `packages/explorer/tests/scroll-segment.test.ts`:

```typescript
/**
 * Must-test scenarios:
 *
 * 1. **Basic 3-segment page**
 *    - Mock inspectUi returning 3 different sets of elements across scrolls
 *    - Verify initScrollState creates segment 0
 *    - Verify discoverNextSegment appends segments 1 and 2
 *    - Verify frame.segmentIndex advances correctly
 *
 * 2. **Restore after child back**
 *    - Mock: segment 1 active → tap element → back returns to top (segment 0 viewport)
 *    - Verify restoreSegment scrolls back to segment 1
 *    - Verify next tap succeeds
 *
 * 3. **Restore failure**
 *    - Mock: restore always fails (element never reappears)
 *    - Verify maxRestoreAttempts triggers abandon
 *    - Verify frame skips to next segment / backtrack
 *
 * 4. **Same-page detection**
 *    - Mock: scroll changes page fingerprint
 *    - Verify discoverNextSegment stops immediately
 *
 * 5. **Cumulative dedup**
 *    - Mock: segment 2 contains some elements from segment 0 (overlap/recycler reuse)
 *    - Verify duplicate elements are not re-added to segments
 *
 * 6. **Bottom detection**
 *    - Mock: scroll returns same elements (no new ones)
 *    - Verify discoverNextSegment returns isLastSegment=true
 *
 * 7. **Non-scrollable page**
 *    - Mock: uiTree has no scrollable nodes
 *    - Verify scrollState is undefined
 *
 * 8. **State graph isolation**
 *    - Verify segment advancement does not call stateGraph.registerTransition
 *    - Verify transitionCommitted counter is unchanged
 */
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Restore fails permanently (Android always returns to top and re-scroll doesn't work) | Low-Medium | High | maxRestoreAttempts cap; abandon segment and continue |
| RecyclerView reuses elements causing false dedup matches | Medium | Medium | Cumulative seenKeys + label+role key; acceptable for Settings |
| scrollOnly triggers pull-to-refresh or unintended action | Low | Medium | "medium" distance is conservative; fingerprint check after scroll |
| Fingerprint collision (different pages with same top 3 texts) | Low | Low | Includes appId + pageContext.type + top texts |
| Performance: many segments add ~5s each | Medium | Low | maxSegments=10 cap; lazy discovery only when needed |
| Nested scrollables (horizontal carousel inside vertical list) | Low | Low | Only scrolls the outermost vertical scroller via generic scrollOnly |

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] New unit tests in `scroll-segment.test.ts` pass (all 8 scenarios)
- [ ] Full explorer run on Android Settings shows `totalPages > 60` (vs baseline 45)
- [ ] Settings homepage elements include items previously off-screen (Apps, Security, etc.)
- [ ] Log shows `[SCROLL-STATE]`, `[SCROLL-SEGMENT]`, and `[SCROLL-RESTORE]` entries
- [ ] No regression in existing explorer tests
- [ ] State graph does not contain `<scroll-segment-*>` transitions

## Files to Modify

| File | Change |
|---|---|
| `packages/explorer/src/types.ts` | Replace `scrollSegment` with `scrollState` in `Frame` |
| `packages/explorer/src/scroll-segment.ts` | **New file** — `initScrollState`, `discoverNextSegment`, `restoreSegment` |
| `packages/explorer/src/engine.ts` | Wire scroll state init, segment discovery, restore before tap, frame accessor |
| `packages/explorer/src/element-prioritizer.ts` | Export `getElementKey` |
| `packages/explorer/tests/scroll-segment.test.ts` | **New file** — 8 must-test scenarios |

## Out of Scope

- Horizontal scroll segments (carousels, tab bars) — vertical only
- Smart scroll distance adaptation — fixed "medium" distance
- Pre-scanning / eager discovery — lazy only
- Nested scrollable containers — outermost vertical scroller only
- Scroll-to-top gesture — not needed with restore algorithm

## Related Issues

- Phase 26 (page-context-detection): Add apps page was fixed but unreachable because "Apps" element is off-screen
- Phase 25 (full-app-explorer): Explorer baseline; this phase extends coverage
- Oracle review (2026-04-28): Recommended single logical frame with segment cursor over synthetic frames or snapshot merging

## Architecture Decision Records

### ADR-1: Single frame with segment cursor (not synthetic frames)

**Decision**: Use one logical page frame with in-place segment mutation, rather than pushing synthetic frames for each segment.

**Rationale**:
- A scroll segment is **page-local state**, not a navigation state
- Synthetic frames would confuse backtrack logic (stack depth ≠ navigation depth)
- The state graph and circuit breaker should not count scroll progression as page traversal

### ADR-2: Lazy segment discovery

**Decision**: Discover segments on-demand when the current segment is exhausted.

**Rationale**:
- Avoids upfront scroll cost for pages with no off-screen elements
- Natural fit with DFS order: explore what we can see, then scroll, then explore more

### ADR-3: Explicit restore before tap

**Decision**: Before tapping any element in segment N > 0, explicitly restore the viewport to segment N.

**Rationale**:
- Android system_back from child pages often returns to the top of the list
- Without restore, elements in scrolled segments are not actionable
- Restore is bounded by maxRestoreAttempts to prevent infinite loops

### ADR-4: Page fingerprint for same-page detection

**Decision**: Use `appId + pageContext.type + top 3 visible texts` as the page fingerprint.

**Rationale**:
- `appId + pageContext.type` alone is too weak (same page can have different contexts)
- Top visible texts provide a lightweight viewport identity
- Does not rely on bounds or coordinates, which change with scroll position
