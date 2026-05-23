# Phase 25: Full App Explorer — DFS-Based Automated UI Traversal

## Summary

Build a DFS-based exploration engine that automatically traverses all reachable screens in a mobile app, producing a page inventory, path report, and Mermaid visualization. Designed for small teams and individual developers who need full-function regression before releases without dedicated QA.

**Target platforms:** iOS first (simulator + real device), then Android.
**Primary use case:** Pre-release full regression, post-refactor verification, new-project onboarding.
**Expected frequency:** 1-2× per release cycle (typically 1-2× per month for small teams).

### Design Review History

See [`REVIEWLOG.md`](./REVIEWLOG.md) for the full history of design review findings and their resolutions.

**Review 1 fixes:**
- **Safety:** Destructive operation protection (§3.1, §4.4)
- **Algorithm:** Page-change validation to prevent infinite loops (§4.1)
- **Budget:** Backtrack cost included in `maxPages` derivation (§4.7)
- **Reliability:** Circuit breaker counts per-page failures, not per-element (§4.1)
- **Implementation gate:** MCP adapter call path confirmed before engine code (§4.8)
- **Dedup:** Screenshot normalization pipeline for cross-device `pixelmatch` (§4.3.1)

**Review 2 fixes (after Review 1):**
- **Algorithm (critical):** DFS backtrack-once logic restructured to per-element immediate exploration — fixes sibling page corruption where elements were tapped on wrong pages (§4.1)
- **Consistency:** `captureSnapshot(config)` signature updated to match `findClickableElements`'s `config` dependency (§4.2)
- **Accuracy:** `sharp` native dependency claim corrected — "prebuilt binaries" not "zero native deps" (§4.3.1)
- **Evidence:** `pixelmatch` 0.05 threshold marked TBD pending 25-00 spike validation (§4.3)
- **Reliability:** `isSystemDialog` detection improved with structural `accessibilityRole` check + keyword threshold raised 2→3 (§4.1)
- **Budget:** `avgBacktrackRate` 0.8 marked as calibratable from spike data (§4.7)
- **Verification:** Backtrack accuracy quantified to ≥95% across ≥30 operations (§9.1)

---

## 1. Problem Statement

Small teams and individual developers lack the resources to manually test every screen and flow before releasing an app update. Existing E2E flows (Maestro YAML) require upfront investment — you need to know what to test. This explorer inverts that model: **discover what exists first, then decide what needs structured test coverage**.

The engine leverages existing MCP tools (`inspect_ui`, `resolve_ui_target`, `tap_element`, `wait_for_ui_stable`, `navigate_back`, `take_screenshot`) to autonomously walk through an app's UI tree, recording every unique screen and the paths that lead to it.

### 1.1 Prior Art — Why Build vs. Buy

The following existing tools were evaluated before proposing a custom solution:

| Tool | Why Not Used |
|------|-------------|
| **Appium Crawler** | Requires Appium server setup, does not use existing MCP tool infrastructure, iOS simulator support is flaky, no built-in dedup or report generation |
| **Google Firebase Test Lab Explorer** | Cloud-only, requires uploading APK/IPA, no access to UI tree for custom dedup, not suitable for pre-release local iteration |
| **Barista (Android)** | Android-only, no iOS support |
| **UIAutomator exploration mode** | Android-only, raw output, no structured report or Mermaid graph |
| **XCUITest + custom scripts** | Requires writing Swift test code — defeats the "zero upfront investment" goal |

**Decision:** Build a custom explorer that (a) reuses the existing `mobile-e2e-mcp` MCP tool catalog, (b) produces structured, actionable reports, (c) works cross-platform from day one. The custom approach avoids external server dependencies and integrates directly with the monorepo's existing infrastructure.

### 1.2 Quantified Baseline

- A typical small-team app has **30-80 unique screens** (home + 3-5 tabs × 2-3 sub-levels + settings).
- Manual exploration of such an app takes **15-45 minutes** per release cycle.
- This explorer targets the same coverage in **3-8 minutes** (smoke) or **15-30 minutes** (full), with structured output.

### 1.3 Validation Target

The phase will be validated on the **system Settings app** (`com.apple.Preferences` on iOS, `com.android.settings` on Android) as the primary target, plus a second app to validate Tab Bar-based smoke mode rules.

**Primary: System Settings app**

- **Available on every device** — no installation or build required
- **No auth needed** — skips the auth pre-flight complexity for validation
- **Known structure** — ~15-25 top-level sections, each with 1-3 sub-levels of known content
- **Multiple navigation patterns** — standard list items, toggle switches, detail pages with static content, "Back" button navigation
- **Reproducible** — structure is stable within an OS version

**Validation target version lock:** iOS 17.4 Simulator (M1/M2) for primary benchmarks. Android results will use API 34 emulator. Results may vary across OS versions and should be documented.

**Settings-specific considerations:**
- Settings app contains many **toggle/switch cells** (Wi-Fi on/off, Bluetooth on/off, etc.) that change system state but do not navigate. These must be excluded from clickable elements (see §4.4 `isToggle`).
- Settings sub-pages (e.g., General → About, General → Storage) have **highly homogeneous structure** (all UITableView-based lists). This means L2 structural hash collision rate will be higher than average — Settings is actually a *stress test* for L3 pixelmatch dedup, not a typical case.
- Some Settings items open **system-level pages** (Wi-Fi opens system network panel, Cellular Data opens cellular settings). These are valid exploration targets but may have different UI characteristics.

**Manual baseline requirement:** Before any automated exploration, Plan 25-00 includes a manual inventory pass:
1. Open iOS 17.4 Settings on simulator.
2. Count and record all top-level sections and their sub-pages (depth 1 and depth 2).
3. Note toggle cells that should be excluded.
4. Record the expected unique navigable page count.
5. This manual count becomes the baseline for dedup accuracy calculation.

**Expected unique navigable page count on iOS 17.4 Settings:** ~50-75 pages (estimated: ~25 top-level sections × 2-3 navigable sub-pages each, excluding toggle cells and non-navigable static text).

**Secondary: Tab Bar validation target**

To validate smoke mode rules for Tab Bar-based apps (the primary use case for small-team product apps), Plan 25-00 will also run a quick smoke-mode exploration on a well-known open-source React Native app with bottom Tab Bar navigation. A concrete candidate (e.g., `react-native-template-typescript` demo app or an existing team app) will be selected during the spike.

A second, product-specific validation will be performed by teams using this tool on their own app after Phase 1 is complete.

### 1.4 Traversal Strategy — Why DFS

**DFS vs. BFS vs. Hybrid:** DFS was chosen because:
- **Full coverage is the primary goal.** DFS guarantees that every reachable page is visited (within the budget), which aligns with the "discover what exists" objective.
- **BFS gives breadth-first coverage** (all top-level screens first), which is better for early feedback but requires storing the entire frontier in memory. For large apps with many tabs × sub-levels, BFS would exhaust the `maxPages` budget before reaching any depth.
- **Hybrid (BFS for breadth, DFS for depth)** was considered but adds complexity without clear benefit — the smoke mode (Mode A) already provides the "breadth-first, shallow" coverage pattern that hybrid would offer.

**Tradeoff:** DFS goes deep before going wide, meaning the first 50% of a full-mode run may cover only 1-2 tabs deeply. Users who want to see all top-level pages quickly should use smoke mode first.

---

## 2. Architecture

### 2.1 Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Pre-flight Interview                       │
│  (mode · auth · failure-policy · depth · compare · platform)  │
└──────────────────────┬───────────────────────────────────────┘
                       │ config
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    DFS Explorer Engine                        │
│                                                               │
│  ┌────────────┐   ┌──────────┐   ┌───────────────────────┐   │
│  │ Snapshot   │──▶│ Dedup    │──▶│ Element Selector      │   │
│  │ Collector  │   │ Checker  │   │ (priority-ordered)    │   │
│  └────────────┘   └──────────┘   └───────────┬───────────┘   │
│                                               │               │
│              ┌──── backtrack ◀────────────────┘               │
│              │                                                │
│              ▼                                                │
│  ┌──────────────┐   ┌───────────────────────────────────┐    │
│  │ Tap + Wait   │──▶│ Failure Handler (by policy)       │    │
│  │ + Validate   │   │  retry-3 | skip | handoff         │    │
│  └──────────────┘   └───────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────┘
                       │ visited[] + failed[]
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Report Generator                           │
│                                                               │
│  summary.json  +  report.md  +  Mermaid graph                │
│  → index.json update                                          │
│  → optional: diff vs selected historical run                  │
└──────────────────────────────────────────────────────────────┘
```

### 2.1.1 Module Boundaries

Phase 1 uses a **single package** with clear internal module boundaries. Splitting into separate packages is deferred until independent reuse or independent versioning justifies the monorepo overhead.

| Module | Location | Responsibility |
|--------|----------|----------------|
| `src/explorer/config.ts` | within `explorer/` package | Pre-flight interview, config persistence, validation |
| `src/explorer/engine.ts` | within `explorer/` package | DFS traversal, snapshot collection, dedup, backtracking |
| `src/explorer/report.ts` | within `explorer/` package | Report generation, Mermaid graph, history diff |

**Constraint:** The explorer package must NOT introduce new MCP tools. It consumes existing MCP tools as a client. The explorer is a **consumer layer** on top of the existing tool catalog, not a new tool provider.

### 2.1.2 CLI Delivery Mechanism

The explorer is delivered as a **single entry point** invoked via:

```bash
npx mobile-e2e-mcp explore
```

Implementation uses `tsup` to bundle the package for fast startup. No standalone binary is needed for Phase 1; `npx` with a bundled entry point is sufficient. CI integration (Phase 27) will reuse the same entry point.

---

## 3. Pre-flight Interview

### 3.1 Configuration Schema

```typescript
interface ExplorerConfig {
  // --- Exploration Mode ---
  mode: 'smoke' | 'scoped' | 'full';
  scope?: {
    type: 'screen-title' | 'element-text' | 'tab-index' | 'module-name';
    value: string | number;
  };

  // --- Authentication ---
  auth:
    | { type: 'already-logged-in' }
    | { type: 'skip-auth' }
    | { type: 'handoff' }              // user logs in manually, then signals continue
    | { type: 'auto-login'; credentials: TestCredentials };

  // --- Failure Policy ---
  failureStrategy: 'retry-3' | 'skip' | 'handoff';

  // --- Depth Control ---
  maxDepth: number;        // 5 (shallow) | 8 (standard) | 12 (deep)
  maxPages: number;        // adaptive: derived from timeoutMs / avgPageTime; default ~200 for 30-min timeout
  timeoutMs: number;       // 15-30 min total

  // --- History ---
  compareWith: string | null;   // run ID to diff against, null = no comparison

  // --- Platform ---
  platform: 'ios-simulator' | 'ios-device' | 'android-emulator' | 'android-device';

  // --- Destructive Action Policy ---
  destructiveActionPolicy: 'skip' | 'confirm' | 'allow';  // default: 'skip' — never click destructive elements

  // --- Persistence ---
  appId: string;           // bundle ID / package name
  reportDir: string;       // base output directory, default: './reports'
}

interface TestCredentials {
  identifierField: string;   // CSS-like selector or accessibility ID for the username field
  passwordField: string;     // same for password
  submitAction: string;      // text or ID of the login button
  identifier: string;
  passwordEnv: string;       // env var name for password (never stored in plaintext)
}
```

### 3.2 Config Persistence

```
.explorer-config.json   (gitignored by default, but !.explorer-config.json can be tracked)
```

Fields stored:
- `mode`, `scope`, `failureStrategy`, `maxDepth`, `platform`, `appId`
- `testCredentials.identifierField`, `testCredentials.passwordField`, `testCredentials.submitAction`, `testCredentials.identifier`
- `testCredentials.passwordEnv` only (password value comes from env at runtime)

On next run: "使用上次配置？[Y/n]" → if yes, load and allow selective overrides.

### 3.3 Interview Flow (User Interaction)

Implemented via `ask_user_question` MCP tool or CLI prompts. Six sequential questions:

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | 探索模式 | A) 主流程冒烟 B) 指定模块 C) 全量探索 | B (指定模块 — 适合首次使用) |
| 2 | 登录态 | A) 已登录 B) 测试账号 C) 手动登录 D) 不需要 | A |
| 3 | 失败策略 | A) 重试3次 B) 跳过 C) 等待处理 | A |
| 4 | 探索深度 | A) 浅层(5) B) 标准(8) C) 深层(12) | B |
| 5 | 历史对比 | A) 对比最近一次 B) 选择历史版本 C) 不对比 | C |
| 6 | 平台 | A) iOS 模拟器 B) iOS 真机 C) Android 模拟器 D) Android 真机 | A |
| 7 | 破坏性操作 | A) 跳过(默认) B) 允许 C) 弹出确认 | A (跳过 — 不点删除/退出/重置) |

---

## 4. DFS Explorer Engine

### 4.1 Core Algorithm

The exploration flow has two phases: **app launch + initial snapshot**, then **DFS traversal**.

**App launch:**
```
1. launch_app({ appId: config.appId })
2. wait_for_ui_stable({ timeoutMs: 10000 })   // wait for initial screen
3. startState = captureSnapshot(config)       // first screen state (needs config for destructive filter)
4. if config.auth requires login → handle auth (handoff or auto-login)
5. explore(startState, config)                // begin DFS
```

**DFS traversal (corrected iterative DFS — per-element immediate exploration):**

> **Why this version:** The original stack-based approach had a critical bug — after tapping element A and pushing Child-A to the stack, the `for` loop would try to tap element B while the device was still on Child-A's page (not the parent). This rewrite uses **per-element immediate exploration**: each successful tap is followed by an immediate recursive descent, then backtrack to the parent before continuing with siblings.

```
function explore(startState: PageState, config: ExplorerConfig): ExplorationResult {
  const visited = new PageRegistry();   // dedup index
  const failed = new FailureLog();
  const stack: Frame[] = [{ state: startState, depth: 0, path: [], elementIndex: 0 }];
  let consecutiveFailedPages = 0;  // counts pages where ALL elements failed (not per-element)

  while (stack.length > 0 && !timeout() && visited.count < config.maxPages) {
    const frame = stack[stack.length - 1];  // peek (don't pop yet)

    // Step 0: Navigate to this frame's page if needed
    // On first iteration: we're on startState (from app launch).
    // After exploring a child and backtracking: we should be back on the parent.
    // After popping a completed frame: we're on its parent (backtrack was done).
    if (frame.depth > 0 && !isOnExpectedPage(frame)) {
      // We're not on the expected page — something went wrong with backtracking.
      // Try one more navigate_back to recover.
      navigateBack();
      await wait_for_ui_stable({ timeoutMs: 5000 });
      if (!isOnExpectedPage(frame)) {
        log('backtrack-recovery-failed: cannot reach expected parent page');
        failed.record({ type: 'BACKTRACK_MISMATCH', frame });
        stack.pop();  // abandon this frame
        continue;
      }
    }

    // Step 1: Snapshot (only on first visit, elementIndex === 0)
    if (frame.elementIndex === 0) {
      const snapshot = captureSnapshot(config);
      const dedupResult = visited.dedup(snapshot);
      if (dedupResult.alreadyVisited) {
        stack.pop();  // skip this page entirely
        if (frame.depth > 0) {
          navigateBack();
          await wait_for_ui_stable({ timeoutMs: 5000 });
        }
        continue;
      }
      visited.register(dedupResult, snapshot, frame.path);
      frame.elements = prioritizeElements(snapshot.clickableElements);
    }

    // Step 2: Visit next unexplored element
    if (frame.elementIndex >= frame.elements.length) {
      // All elements explored — pop and backtrack
      stack.pop();
      if (frame.depth > 0) {
        navigateBack();
        await wait_for_ui_stable({ timeoutMs: 5000 });
      }
      continue;
    }

    const element = frame.elements[frame.elementIndex];
    frame.elementIndex++;  // advance for next iteration (even if this one fails)

    // Retry loop for this element
    let elementRetries = 0;
    let elementResult = tapAndWait(element, config.timeoutMs);
    while (!elementResult.success) {
      elementResult.error.retryCount = elementRetries;
      failed.record(element, elementResult.error, frame.state);
      const action = handleFailure(elementResult.error, config.failureStrategy);
      if (action === 'abort') break;
      if (action === 'retry') {
        elementRetries++;
        elementResult = tapAndWait(element, config.timeoutMs);
        continue;
      }
      if (action === 'handoff') {
        waitForUserSignal();
        elementResult = tapAndWait(element, config.timeoutMs);
        if (elementResult.success) break;
        continue;
      }
      // action === 'skip'
      break;
    }

    if (elementResult.success) {
      // Validate navigation — ensure the tap actually changed the page
      const navValidation = validateNavigation(elementResult.nextState, frame.state);
      if (!navValidation.navigated) {
        log(`no-navigation: ${navValidation.reason}`);
        continue;  // element didn't lead anywhere — try next sibling
      }

      // Push child frame for immediate exploration in next iteration
      stack.push({
        state: elementResult.nextState,
        depth: frame.depth + 1,
        path: [...frame.path, element.label],
        elementIndex: 0,
        elements: []
      });
      // Don't backtrack here — the child will backtrack when it's done.
    }
    // If element failed, just continue the while loop to try next sibling.
    // No backtrack needed — we're still on the parent page (failed tap didn't navigate).
  }

  // 6. Generate report
  const result = { visited, failed };
  if (consecutiveFailedPages >= 5) {
    log('CIRCUIT_BREAKER: 5 consecutive pages with no successful navigation — aborting run');
    generateReport(result, { partial: true });
    result.aborted = true;
  } else {
    generateReport(result, { partial: false });
  }
  return result;
}

interface Frame {
  state: PageState;
  depth: number;
  path: string[];
  elementIndex: number;       // next element to explore (mutable cursor)
  elements: ClickableTarget[]; // pre-computed clickable elements on this page
}

function isOnExpectedPage(frame: Frame): boolean {
  // Lightweight check: just get screenId, don't compute clickableElements
  const uiTree = inspect_ui();
  const currentScreenId = generateScreenId(uiTree);
  return currentScreenId === frame.state.screenId;
}
```

**How this fixes the sibling exploration bug:**

| Scenario | Old Algorithm (BROKEN) | New Algorithm (CORRECT) |
|----------|----------------------|------------------------|
| Frame P with elements [A, B, C] | Pop P → tap A (push A) → tap B on A's page (WRONG!) | Peek P → tap A → push A → next iteration explore A → A finishes → A backtracks to P → next iteration continue with B on P's page |
| After exploring A's subtree | A's subtree explored, but B/C were tapped on wrong page | B is tapped on P's page (correct), because A backtracked to P before B |
| Backtrack timing | Single `navigateBack()` at end of while body — too late, too early, or wrong context | Each frame calls `navigateBack()` when it's popped (all elements done) — precise depth tracking |
| Failed element retry | Retried on possibly wrong page | Retried on the correct page — frame ensures we're positioned correctly |
```

**`validateNavigation` — ensures a tap led to a real page change:**
```typescript
function validateNavigation(nextState: PageState, prevState: PageState): { navigated: true } | { navigated: false; reason: string } {
  // Check 1: screenId changed — page content is different
  if (nextState.screenId === prevState.screenId) {
    return { navigated: false, reason: 'screenId unchanged — element had no navigation effect' };
  }

  // Check 2: detect system dialogs (permission requests, update prompts, rating popups)
  if (isSystemDialog(nextState)) {
    handleSystemDialog();  // dismiss or record
    return { navigated: false, reason: 'system dialog detected — dismissed' };
  }

  // Check 3: depth increased but content is nearly identical — possible modal overlay
  if (nextState.depth > prevState.depth && structuralSimilarity(nextState, prevState) > 0.85) {
    // Likely a modal overlay on top of the same page — still valid navigation but mark it
    nextState.isModalOverlay = true;
    return { navigated: true };  // modal is a valid child, will be explored to depth 1
  }

  return { navigated: true };
}
```

**`isSystemDialog` — detects OS-level dialogs that block exploration:**

```typescript
function isSystemDialog(snapshot: PageSnapshot): boolean {
  // Structural check (primary): look for alert/modal role in the UI tree
  const hasAlertRole = snapshot.uiTree.elements.some(el =>
    el.accessibilityRole === 'alert'
    || el.accessibilityRole === 'SystemAlert'
    || el.elementType === 'Alert'
    || el.elementType === 'Sheet'
  );
  if (hasAlertRole) return true;  // structural confidence — no keyword needed

  // Keyword fallback (secondary): if no structural marker, check for dialog-like text patterns
  // Requires 3+ keywords to reduce false positives (e.g., Notifications settings page has "Allow" + "Not Now" but no alert role)
  const textLabels = extractAllVisibleTexts(snapshot.uiTree);
  const dialogKeywords = [
    'Would Like to Send', 'Allow', 'Don\'t Allow',           // iOS permission
    'Allow ACCESS to use', 'While Using the App',            // iOS privacy
    'Update Available', 'Not Now', 'Remind Me Later',        // iOS update
    'Sign in to iCloud',                                     // system account
    'OK', 'Cancel', 'Allow Once',                            // generic system dialogs
  ];
  const matched = dialogKeywords.filter(kw => textLabels.some(t => t.includes(kw)));
  return matched.length >= 3;  // raised from 2 to 3 to reduce false positives on legitimate settings pages
}
```

**`handleSystemDialog` — deterministic dismissal:**
```typescript
async function handleSystemDialog() {
  // Priority 1: Tap "Allow" / "OK" / "While Using" / "Not Now" (least destructive)
  // Priority 2: Tap first button in the dialog (usually the primary action)
  // Priority 3: If dialog cannot be safely dismissed, skip the parent element
  const dialogButtons = findDialogButtons();
  const safeDismissal = dialogButtons.find(btn =>
    /Allow|OK|While Using|Not Now|Cancel/i.test(btn.label)
  );
  if (safeDismissal) {
    await tap_element(safeDismissal.selector);
    await wait_for_ui_stable({ timeoutMs: 5000 });
  }
}
```

**`generateReport` — single entry point for both full and partial reports:**
- Writes all artifacts described in §5.1 (output structure).
- When `partial: true`: adds `aborted: true` + `abortReason` to summary.json, prefixes report.md header with `⚠️ PARTIAL REPORT — `, and marks `index.json` entry as `"status": "partial"`.
- When `partial: false`: normal completion, `"status": "complete"` in index.json.

interface Frame {
  state: PageState;
  depth: number;
  path: string[];
}
```

### 4.2 Snapshot Collection

**`tapAndWait` — the core interaction primitive:**

```typescript
async function tapAndWait(
  element: ClickableTarget,
  overallTimeoutMs: number,
  config: ExplorerConfig
): Promise<{ success: true; nextState: PageState } | { success: false; error: Error }> {
  const tapStart = Date.now();

  // 1. Resolve the element
  const resolved = await resolve_ui_target(element.selector);
  if (!resolved) {
    return { success: false, error: new Error('TAP_FAILED: element not found') };
  }

  // 2. Tap
  const tapOk = await tap_element(resolved);
  if (!tapOk) {
    return { success: false, error: new Error('TAP_FAILED: tap action returned false') };
  }

  // 3. Wait for UI to stabilize
  const settleTimeoutMs = Math.min(10000, overallTimeoutMs - (Date.now() - tapStart));
  const stableOk = await wait_for_ui_stable({ timeoutMs: settleTimeoutMs });
  if (!stableOk) {
    return { success: false, error: new Error('TIMEOUT: UI did not stabilize') };
  }

  // 4. Capture next state
  const nextState = captureSnapshot(config);
  const loadTimeMs = Date.now() - tapStart;

  return {
    success: true,
    nextState: { ...nextState, loadTimeMs }
  };
}
```

**`captureSnapshot` — assembles a PageSnapshot from MCP tool calls:**

```typescript
function captureSnapshot(config: ExplorerConfig): PageSnapshot {
  const uiTree = inspect_ui();                    // full UI hierarchy dump
  const screenshotPath = take_screenshot();       // save PNG to reports directory

  return {
    screenId: generateScreenId(uiTree),
    screenTitle: extractScreenTitle(uiTree),
    uiTree,
    clickableElements: findClickableElements(uiTree, config),  // computed from uiTree, needs config for destructive filter
    screenshotPath,
    capturedAt: new Date().toISOString(),
    // These are filled in by the explore loop:
    arrivedFrom: null,
    viaElement: null,
    depth: 0,
    loadTimeMs: 0,
    stabilityScore: 1.0,
  };
}
```

**Design note:** `clickableElements` is computed from `uiTree` in `captureSnapshot(config)` so the snapshot is self-contained. The explore loop can use `snapshot.clickableElements` directly instead of calling `findClickableElements(snapshot.uiTree, config)` again. This also ensures the snapshot passed to `dedup()` already has the computed field for potential future use in report generation.

**`generateScreenId` — deterministic identifier for a page:**
1. Collect all visible, non-decorative text labels from the UI tree (exclude system bars, status indicators).
2. Sort alphabetically and join with `-`.
3. Truncate to 120 characters.
4. Hash with SHA-256 (first 16 hex chars) for compactness.
Example: `"Home-Wi-Fi-Bluetooth-General-Notifications-..."` → `"a3f7b2c1d4e5f6a7"`

**`extractScreenTitle` — human-readable page title:**
1. Check for navigation bar title element (iOS: `elementType === 'NavigationBarTitle'`, Android: `resource-id` contains `toolbar` + `text` property).
2. Fallback: first prominent text label that isn't a button or list item.
3. Fallback: first 3 visible words joined by spaces.
4. Return `undefined` if no title can be extracted.

**`buildSelector` — creates a unique selector for `resolve_ui_target`:**
1. If `accessibilityId` is present → return `{ accessibilityId: el.accessibilityId }`.
2. If `resource-id` is present → return `{ resourceId: el.resourceId }`.
3. If `label` or `visibleTexts[0]` is present → return `{ text: el.label || el.visibleTexts[0], elementType: el.elementType }`.
4. Fallback → return `{ position: { x: el.frame.x, y: el.frame.y } }` (coordinate-based, least reliable).

**Each page visit produces a structured snapshot:**

```typescript
interface PageSnapshot {
  // Identification
  screenId: string;          // heuristic: visibleTexts.join('-') or accessibility label
  screenTitle?: string;      // from navigation bar title if present
  routeName?: string;        // if RN/Flutter exposes it

  // UI Structure
  uiTree: UiHierarchy;       // from inspect_ui()
  clickableElements: ClickableTarget[];

  // Evidence
  screenshotPath: string;    // relative path to screenshot PNG
  capturedAt: string;        // ISO timestamp

  // Navigation context
  arrivedFrom: string | null;   // previous page's screenId
  viaElement: string | null;    // label of the tapped element
  depth: number;

  // Health
  loadTimeMs: number;        // time from tap to UI stable
  stabilityScore: number;    // 0-1, based on wait_for_ui_stable iterations
}
```

### 4.3 Dedup Strategy

Three-tier dedup, escalating cost. L3 uses [`pixelmatch`](https://github.com/mapbox/pixelmatch) — a lightweight (200-line) JS-native pixel diff library with no native dependencies, suitable for bundling with `tsup`.

| Level | Method | Trigger | Cost (M1 sim) | Target Accuracy |
|-------|--------|---------|---------------|-----------------|
| L1 | `screenId` hash (sorted visible text labels) | Always | ~0ms | ~80% (dynamic content causes misses) |
| L2 | UI tree structural hash (element types + depth + child counts) | L1 collision | ~5ms | ~95% (layout changes may collide) |
| L3 | `pixelmatch` normalized pixel diff | L2 collision | ~30-80ms for 1080p screenshot | ~99% (threshold **TBD — validate in 25-00 spike**; initial guess 0.05) |

**Implementation note for L3:** `pixelmatch` requires same-size images. Screenshots are normalized to a standard size before comparison (see §4.3.1). The initial 0.05 mismatch threshold is a **guess** — it will be validated during 25-00 spike by taking 10+ screenshots of the same page at different times and measuring the actual pixel diff distribution. If dynamic content (clock, battery, weather widgets) pushes the ratio above 0.05, we'll either mask those regions or raise the threshold based on empirical data.

### 4.3.1 Screenshot Normalization

`pixelmatch` compares two images pixel-by-pixel, so **all screenshots must be the same dimensions** before comparison. Without normalization, screenshots from different sources would produce false mismatches:

| Source | Typical Resolution | Problem |
|--------|-------------------|---------|
| iOS Simulator (iPhone 15) | 1179 × 2556 | Different simulators have different scales |
| iOS real device (iPhone 14 Pro) | 1179 × 2556 | Same resolution but different status bar height |
| Android Emulator (Pixel 6) | 1080 × 2400 | Different aspect ratio entirely |
| Keyboard visible | UI pushed up by ~300px | Content area shifted |

**Normalization pipeline (via `sharp` library):**

```typescript
const STANDARD_WIDTH = 375;  // iPhone standard logical width (points, not pixels)
const IOS_STATUS_BAR_HEIGHT = 44;   // iOS standard status bar
const ANDROID_STATUS_BAR_HEIGHT = 24; // Android standard status bar dp

async function normalizeScreenshot(imagePath: string, platform: string): Promise<Buffer> {
  const img = sharp(imagePath);
  const metadata = await img.metadata();
  const actualWidth = metadata.width!;
  const actualHeight = metadata.height!;

  // Step 1: Calculate content area (exclude status bar + bottom safe area)
  const statusBarPx = platform.startsWith('ios')
    ? Math.round(actualHeight * (IOS_STATUS_BAR_HEIGHT / 852))  // proportional to device height
    : Math.round(actualHeight * (ANDROID_STATUS_BAR_HEIGHT / 800));
  const bottomSafeAreaPx = platform.startsWith('ios')
    ? Math.round(actualHeight * (34 / 852))  // iPhone home indicator
    : 0;
  const contentHeight = actualHeight - statusBarPx - bottomSafeAreaPx;

  // Step 2: Crop to content area
  let cropped = img.extract({
    left: 0,
    top: statusBarPx,
    width: actualWidth,
    height: contentHeight,
  });

  // Step 3: Resize to standard width (maintain aspect ratio)
  return cropped.resize(STANDARD_WIDTH, -1, { fit: 'inside' }).png().toBuffer();
}
```

**Dependency note:** `sharp` bundles `libvips` (a C library) as a prebuilt binary. Prebuilt ≠ zero native dependencies — on macOS x64/ARM64, prebuilt binaries are available and install without a compiler. On Linux CI environments or unusual architectures, installation may require native compilation of `libvips`. The monorepo should test `sharp` installation on the target CI platform before committing. As a pure-JS fallback, `pngjs` + manual bicubic resize is an option (slower but zero native deps).

**If `sharp` is not acceptable** for the monorepo's dependency policy, an alternative is to use `canvas` (pure JS image manipulation) or to rely on the MCP tool's `take_screenshot` returning a normalized image (if the tool supports it). This will be decided during Plan 25-00 spike.

**Accuracy targets are goals, not guarantees.** Phase 1 validation will measure actual false-positive and false-negative rates on the sample app. Target: <5% false positives (different pages marked as same), <2% false negatives (same pages marked as different). If these targets are not met, the threshold and hash functions will be tuned before marking the phase complete.

```typescript
class PageRegistry {
  private byTextHash = new Map<string, PageEntry>();
  private byStructureHash = new Map<string, PageEntry[]>();

  dedup(snapshot: PageSnapshot): DedupResult {
    const textHash = hashVisibleTexts(snapshot.uiTree);
    if (this.byTextHash.has(textHash)) {
      return { alreadyVisited: true, matchedId: this.byTextHash.get(textHash)!.id };
    }

    const structHash = hashUiStructure(snapshot.uiTree);
    const structCandidates = this.byStructureHash.get(structHash) || [];
    if (structCandidates.length > 0) {
      // L3: pixelmatch visual comparison
      for (const candidate of structCandidates) {
        const mismatchRatio = compareScreenshotsPixelmatch(
          snapshot.screenshotPath,
          candidate.screenshotPath,
          { threshold: 0.05 }
        );
        if (mismatchRatio < 0.05) {
          return { alreadyVisited: true, matchedId: candidate.id, confidence: 'visual' };
        }
      }
      // L2 match but L3 says different page — register as new with warning
      return { alreadyVisited: false, warning: 'structurally-similar-but-visually-different' };
    }

    return { alreadyVisited: false };
  }

  register(result: DedupResult, snapshot: PageSnapshot, path: string[]) {
    if (result.alreadyVisited) return;
    const entry = { id: generatePageId(), snapshot, path };
    const textHash = hashVisibleTexts(snapshot.uiTree);
    const structHash = hashUiStructure(snapshot.uiTree);
    this.byTextHash.set(textHash, entry);
    this.byStructureHash.set(structHash, [...(this.byStructureHash.get(structHash) || []), entry]);
  }
}
```

### 4.4 Element Prioritization

When a page has multiple clickable elements, visit in this priority order (DFS-friendly):

```typescript
function findClickableElements(uiTree: UiHierarchy, config: ExplorerConfig): ClickableTarget[] {
  return uiTree.elements.filter(el => {
    // Include: buttons, links, list items, images with button trait, nav hints
    if (!isInteractive(el)) return false;
    // Exclude: toggle/switch cells (change state but don't navigate)
    if (isToggle(el)) return false;
    // Exclude: text input fields (Phase 2 scope)
    if (isTextInput(el)) return false;
    // Exclude: progress indicators, static text, separators
    if (isNonInteractive(el)) return false;
    // Exclude: destructive operations (Delete Account, Reset Settings, Sign Out, etc.)
    if (isDestructive(el, config.destructiveActionPolicy)) return false;
    return true;
  }).map(el => toClickableTarget(el));
}

function isDestructive(el: ClickableTarget, policy: 'skip' | 'confirm' | 'allow'): boolean {
  if (policy === 'allow') return false;  // user explicitly permits destructive actions
  const label = (el.label || '').toLowerCase();
  const destructivePatterns = [
    /delete\s*(account|data|all)?/i,
    /remove\s*(account|data)?/i,
    /reset\s*(all\s*)?settings?/i,
    /clear\s*(all\s*)?(data|cache|storage)/i,
    /sign\s*out/i, /log\s*out/i, /logoff/i,
    /erase\s*(all)?/i, /factory\s*reset/i,
    /uninstall/i, /offload\s*app/i,
  ];
  return destructivePatterns.some(pattern => pattern.test(label));
}

function prioritizeElements(elements: ClickableTarget[]): ClickableTarget[] {
  return elements.sort((a, b) => priorityScore(b) - priorityScore(a));
}

function priorityScore(el: ClickableTarget): number {
  if (isTabBarItem(el)) return 100;        // bottom tab bar = major module switch
  if (isListItem(el)) return 90;           // list items / cards = content entries
  if (isNavHint(el)) return 80;            // "Next", "更多", ">", arrows
  if (isSettingsIcon(el)) return 70;       // gear, hamburger menu
  if (isButton(el)) return 60;             // generic buttons
  if (isLink(el)) return 50;               // text links
  if (isIcon(el)) return 40;               // standalone icons (share, favorite, etc.)
  return 10;                               // unknown
}

function isToggle(el: ClickableTarget): boolean {
  return el.elementType === 'Switch'
    || el.elementType === 'Toggle'
    || el.accessibilityTraits?.includes('toggleButton')
    || el.accessibilityTraits?.includes('switch');
}
```

**Heuristic classification rules** (based on element properties from `inspect_ui`):

| Type | Detection Rule |
|------|---------------|
| Tab bar item | `elementType === 'Button'` AND `position.y` near bottom of screen AND sibling count > 3 in same horizontal row |
| List item | `elementType === 'Cell'` OR `elementType === 'ListItem'` OR has `index` property in a scrollable container |
| Nav hint | text matches `/(Next|More|继续|更多|>|→|›)/i` |
| Settings icon | `accessibilityLabel` matches `/(settings|config|gear|设置)/i` OR resource-id contains `settings` |
| Button | `elementType === 'Button'` AND not classified above |
| Link | `elementType === 'StaticText'` AND `isLink === true` OR underline style |
| Icon | `elementType === 'Image'` AND `isButton === true` |

**Element filtering helper functions** (called by `findClickableElements`):

> **⚠️ Important:** The element types listed below (`NavigationBarButton`, `TabBarButton`, etc.) are **anticipated names based on iOS Accessibility traits and common UI framework conventions**. The actual `elementType` values depend on the `inspect_ui` MCP tool's output format. Plan 25-00 must verify these names against real `inspect_ui` dumps from iOS Settings, a SwiftUI app, and an Android Settings app before implementation begins.

| Function | Logic |
|----------|-------|
| `isInteractive(el)` | `elementType` matches any known interactive type: `Button`, `Cell`, `ListItem`, `Link`, `StaticText` (with `isLink` or `isTappable` trait), `Image` (with `isButton` trait). Framework-specific types like `NavigationBarButton`, `TabBarButton`, `SwiftUI.Button` (if exposed) should be added after spike validation. |
| `isToggle(el)` | `elementType` is `Switch` or `Toggle`, OR `accessibilityTraits` contains `toggleButton`/`switch` |
| `isTextInput(el)` | `elementType` is `TextField`, `SecureTextField`, `TextView` (editable), OR `accessibilityTraits` contains `allowsDirectInteraction` |
| `isNonInteractive(el)` | `elementType` is one of `StaticText` (non-link), `Image` (non-button), `Separator`, `ActivityIndicator`, `ProgressBar`, `ScrollView` (container, not an action), `Group` |
| `toClickableTarget(el)` | Extract `{ label: el.label \|\| el.accessibilityLabel \|\| el.visibleTexts[0] \|\| el.elementType, selector: buildSelector(el), elementType: el.elementType }` |

**Validation plan:** Before Phase 1 implementation, run `inspect_ui` on 3 real apps (one UIKit-based, one SwiftUI-based, one Flutter-based if available) and verify that the heuristic rules correctly classify ≥80% of elements. If a rule consistently fails on a specific framework, add framework-specific detection logic. Priority scores may be adjusted based on empirical results.

### 4.5 Backtracking

```
Priority 1: navigate_back()       — system-level back (iOS swipe-back or Android KEYEVENT_BACK)
Priority 2: Find "Back"/"返回" button on page and tap it
Priority 3: Re-launch app from home screen  — nuclear option, resets state
```

Backtracking must verify we returned to the expected parent page:
```
after navigate_back():
  newSnapshot = captureSnapshot(config)
  if newSnapshot.screenId !== expectedParentScreenId:
    log('backtrack mismatch: expected ${expectedParentScreenId}, got ${newSnapshot.screenId}')
    retry with Priority 2
    if still mismatched: mark as 'backtrack-failed' and continue from current page
```

**iOS modal navigation caveat:** On iOS, `presentedViewController` modals behave differently from `UINavigationController` stack entries. `navigate_back()` on a modal may dismiss the entire modal and return to the presenting controller, not to the modal's internal child.

Mitigation strategy:
- Detect modal context: if `uiTree.presentationStyle` or `accessibilityTraits` indicates a modal sheet, set `expectedParentScreenId` to the presenting page (not the modal's internal parent).
- After dismissing a modal, the engine should recognize it has returned to the pre-modal page and continue DFS from there.
- If the app uses a custom navigation overlay (e.g., React Navigation modal stack), the heuristic should check for the presence of a close/dismiss button (Priority 2) before falling back to relaunch (Priority 3).

This will be verified during the heuristic validation spike (Section 4.4).

### 4.6 Failure Handler

Driven by `config.failureStrategy`:

```typescript
function handleFailure(err: Error, strategy: ExplorerConfig['failureStrategy']): Action {
  switch (strategy) {
    case 'retry-3':
      if (err.retryCount < 3) {
        wait(2000 * err.retryCount);  // exponential backoff
        return 'retry';
      }
      return 'skip';  // after 3 retries, mark as failed and move on

    case 'skip':
      return 'skip';

    case 'handoff':
      return 'handoff';  // pause, wait for user signal
  }
}
```

**Circuit breaker integration:** The `consecutiveFailedPages` counter is maintained in the main `explore()` loop (see §4.1). When it reaches 5, the loop exits and `generateReport(result, { partial: true })` is called. This counter is incremented only when a page has **zero successful navigations** (all elements on the page failed) and reset to 0 when at least one element leads to a successful navigation.

Failure types to track:
| Failure Type | Example | Recovery |
|-------------|---------|----------|
| `TAP_FAILED` | Element not found after scroll | Retry with scroll, then skip |
| `TIMEOUT` | Page didn't stabilize in 30s | Mark as slow, continue |
| `CRASH` | App crashed / returned to home | Re-launch + `reset_app_state`, mark as crash |
| `BACKTRACK_MISMATCH` | Back navigation went to wrong page | Continue from current, flag as navigation issue |
| `INTERRUPTED` | System dialog (permission, update prompt) | Use existing interruption handler, then retry |

**State recovery:** When a `CRASH` or `BACKTRACK_MISMATCH` occurs, the engine calls `reset_app_state` (clear data / reinstall) before resuming. The config's `appId` is used to identify the target app. This ensures exploration doesn't continue from a corrupted state.

### 4.7 Exploration Modes

#### Mode A: Smoke (主流程冒烟)

Does NOT traverse all buttons. Uses heuristic rules to find "main paths":

**For apps with Tab Bar:**
```
1. Launch → Splash/Home (if exists)
2. Home → Each bottom tab (major modules)
3. Each tab → First list item → Detail page (if list exists)
4. Settings → Key items only (Account, Privacy, About)
```

**For list-based apps without Tab Bar (e.g., Settings):**
```
1. Launch → First screen
2. Visit each top-level grouped section header's first navigable item
3. For each section → First list item → Detail page (depth 2 max)
4. Skip toggle/switch cells (they change state but don't navigate)
```

**Common skip rules (both types):**
- Edge buttons (share, favorite, feedback)
- Sub-menus beyond depth 2
- Deeply nested settings (beyond depth 3)
- Input forms (Phase 2 scope)
- Infinite scroll containers (detect by content not changing after scroll + tap)
- Toggle/switch cells (UISwitch, Toggle element type)

**Infinite scroll detection algorithm:** When the engine encounters a long scrollable list:
1. Record the current UI tree structural hash and visible text set before scrolling.
2. Perform a scroll-down gesture (tap the last visible list item or use `scroll_only`).
3. Wait for UI to settle.
4. Record the new UI tree structural hash and visible text set.
5. Calculate **content change ratio**: `(newTexts ∩ oldTexts) / min(newTexts.size, oldTexts.size)`.
6. If content change ratio > 90% AND structural hash is identical → increment "no-change" counter.
7. Repeat steps 2-6. If "no-change" counter reaches **minimum 3 consecutive no-change observations** → classify as "infinite scroll" and skip the container.
8. If content change ratio < 90% at any point → reset counter and treat as a normal list with DFS on visible items.

**Why content change ratio, not fixed scroll count:** A short list may reach its end in 1-2 scrolls (structural hash changes because element count decreases). An infinite feed (news, social media) may produce new items on every scroll but with high visual similarity. The content change ratio detects both patterns: short lists show structural change, infinite feeds show high text overlap. The minimum 3-observation counter prevents false positives on lazy-loading lists that take 2-3 scrolls to populate.

**Common UI pattern handling:**
- **Modals:** If tapping an element opens a modal (detected by `presentationStyle: 'modal'` or `accessibilityTraits` change), the engine explores the modal's immediate children up to depth 1, then dismisses and continues DFS on the presenting page.
- **Carousels/Horizontal lists:** Treated as a single interactive unit — tap the first visible item, skip the rest.
- **Search bars:** Skipped in smoke mode (input forms). Full mode explores if search results page is reachable.
- **Bottom sheets:** Treated similarly to modals — explore to depth 1, then dismiss.

Expected: 3-8 minutes on M1/M2 simulator, 15-40 pages. Times on real devices may be 2-3× higher.

#### Mode B: Scoped (指定模块)

User specifies an entry point. Engine navigates to it, then DFS from there.

```
Entry specification:
- screen-title: "从 '我的订单' 页面开始"
- element-text: "从底部 'Cart' 按钮开始"
- tab-index: "从第 3 个 Tab 开始"
- module-name: "只探索 Checkout 流程"

Behavior:
1. Navigate to entry point (tap matching elements from home)
2. Begin DFS from entry page
3. Do NOT backtrack before entry point (prune pre-entry branches)
```

#### Mode C: Full (全量探索)

Complete DFS with all rules, all depths up to `maxDepth`, all elements.

Expected: 15-30 minutes, 50-200 pages depending on app complexity.

**Adaptive `maxPages` derivation:** Rather than a hard-coded 200, the engine derives `maxPages` from `timeoutMs` and a running average of per-page time **including backtrack cost**:

```
// After each page visit, update rolling average of page time:
rollingAvgPageTimeMs = (0.7 * rollingAvgPageTimeMs) + (0.3 * currentPageTimeMs);

// Update rolling average of backtrack time (measured separately):
// Only measured when backtrack actually happens (depth > 0 pages)
rollingAvgBacktrackTimeMs = (0.7 * rollingAvgBacktrackTimeMs) + (0.3 * currentBacktrackTimeMs);

// Calculate effective cost per page:
// avgBacktrackRate — calibrated during 25-00 spike; 0.8 is an initial estimate for balanced trees
// Real app navigation trees are skewed (some tabs deep, some shallow), so this should be measured
avgBacktrackRate = backtrackCount / max(visitedCount, 1);  // rolling, initial estimate 0.8 — calibrate with spike data
effectiveCostPerPage = rollingAvgPageTimeMs + (avgBacktrackRate * rollingAvgBacktrackTimeMs);

// Derive maxPages with floor and ceiling:
// 0.85 factor reserves 15% for failure recovery and system dialogs (not just backtracking)
rawMaxPages = floor(timeoutMs * 0.85 / effectiveCostPerPage);
maxPages = clamp(rawMaxPages, minPages: 50, maxPages: 500);
```

**Why backtrack must be tracked separately:** A tap+wait on a fast settings page may take 2s, but `navigate_back()` + `wait_for_ui_stable()` takes another 3-5s. If backtrack isn't tracked, the engine will overestimate how many pages it can visit. On a 30-minute timeout with 200 pages, backtrack alone can consume 10-15 minutes — 33-50% of the budget.

**Floor/ceiling rationale:**
- **minPages = 50:** Prevents the engine from giving up too early if the first few pages are unusually slow (e.g., cold start, network calls). Even with high per-page times, the engine should explore at least 50 pages.
- **maxPages = 500:** Prevents runaway exploration on extremely fast pages (e.g., a simple settings page with no sub-navigation) that would produce diminishing returns. At 500 pages, the report is already comprehensive for any typical app.

### 4.8 MCP Adapter Confirmation (Pre-Implementation Gate)

**Problem:** The engine calls 12 existing MCP tools, but the exact import path and call signature are not yet confirmed. Plan 25-01's Step 0 leaves two options (direct import vs HTTP client) without a decision — this causes implementation delay.

**Resolution:** Before any engine code is written, Plan 25-00 **must** complete the following sub-task:

1. **Locate existing MCP tool exports:** Run `grep -r "inspect_ui\|tap_element\|navigate_back" packages/ --include="*.ts" -l` to find the monorepo's tool export location.
2. **Determine call pattern:** Check whether tools are:
   - Exported as named functions (direct `import { inspect_ui } from '@mobile-e2e-mcp/server'`)
   - Exposed via an MCP server process (requiring JSON-RPC or stdio transport)
   - Available through a CLI wrapper (`npx mobile-e2e-mcp tools ...`)
3. **Record the decision** in `packages/explorer/MCP-ADAPTER.md` with:
   - The exact import path or endpoint URL
   - A working smoke test (call `launch_app` + `inspect_ui` on Settings app)
   - Any type mismatches between the engine's expected types and the actual tool return types

**This is a blocking gate.** Plan 25-01 engine implementation cannot begin until this sub-task is complete. The MCP adapter interface (`McpToolInterface`) is already defined in the 25-01 PLAN.md — the spike only needs to fill in the implementation body.

---

## 5. Report Generator

### 5.1 Output Structure

```
reports/
├── index.json                          // run registry
├── {run-id}/
│   ├── summary.json                    // structured data
│   ├── report.md                       // human-readable report
│   ├── graph.mmd                       // Mermaid graph source
│   ├── config.json                     // config used for this run
│   └── pages/
│       ├── page-001-{screenId}/
│       │   ├── ui-tree.json
│       │   ├── screenshot.png
│       │   ├── clickable-elements.json
│       │   └── metadata.json
│       ├── page-002-{screenId}/
│       └── ...
└── diffs/
    └── {runIdA}-vs-{runIdB}.md         // diff report (optional)
```

### 5.2 `index.json` Schema

```typescript
interface RunIndex {
  runs: RunEntry[];
}

interface RunEntry {
  id: string;                 // ISO timestamp slug: "2026-04-12T14-30"
  appId: string;
  appVersion: string;         // detected from device
  platform: string;
  mode: 'smoke' | 'scoped' | 'full';
  scope?: string;
  pageCount: number;
  failureCount: number;
  durationMs: number;
  maxDepthReached: number;
  configPath: string;         // relative path to config.json
  summaryPath: string;        // relative path to summary.json
}
```

### 5.3 `summary.json` Schema

```typescript
interface ExplorationSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;

  // Stats
  totalPages: number;
  totalPaths: number;
  totalFailures: number;
  maxDepthReached: number;
  uniqueModules: string[];    // inferred from page path prefixes (see §5.3.1)

  // Failures
  failures: FailureEntry[];

  // Page inventory
  pages: PageEntry[];
}

interface FailureEntry {
  pageScreenId: string;
  elementLabel: string;
  failureType: 'TAP_FAILED' | 'TIMEOUT' | 'CRASH' | 'BACKTRACK_MISMATCH' | 'INTERRUPTED';
  retryCount: number;
  errorMessage: string;
  depth: number;
  path: string[];
}

interface PageEntry {
  id: string;                 // "page-001"
  screenId: string;
  screenTitle?: string;
  depth: number;
  path: string[];             // navigation path from start page
  arrivedFrom: string | null;
  viaElement: string | null;
  loadTimeMs: number;
  clickableCount: number;
  hasFailure: boolean;
}
```

### 5.3.1 Report Generation

Single function `generateReport(result, opts)` produces all artifacts described in §5.1.

| Flag | `partial: false` (normal) | `partial: true` (circuit breaker) |
|------|--------------------------|------------------------------------|
| `summary.json` | standard fields | + `aborted: true`, `abortReason: "5 consecutive failures"` |
| `report.md` header | `# APP Exploration Report` | `# ⚠️ PARTIAL REPORT — APP Exploration Report` |
| `report.md` body | all sections | + "Last successful page: {path}" note |
| Mermaid graph | complete | only visited pages (may be incomplete) |
| `index.json` entry | `"status": "complete"` | `"status": "partial"` |

### 5.3.2 Module Inference

The engine infers module groupings from the navigation path structure, not from screenId prefixes (which are unreliable for Settings-like apps with non-hierarchical naming).

**Algorithm:**
1. Extract the **depth-1 path segment** for each visited page — i.e., the first element tapped from the home screen.
2. Group all pages that share the same depth-1 segment into the same module.
3. Label the module with the depth-1 element's `screenTitle` (e.g., "General", "Wi-Fi", "Notifications").

**Example (Settings app):**
```
Path: ["General"] → module: "General" (contains General/About, General/Storage, General/Software Update)
Path: ["Wi-Fi"] → module: "Wi-Fi" (contains Wi-Fi networks detail, Wi-Fi settings)
Path: ["Notifications"] → module: "Notifications"
```

**Fallback:** If a page has no path (depth 0, i.e., the home screen), label it as `"Home"`.

This approach works for both Tab Bar apps (depth-1 = tab name) and list-based apps like Settings (depth-1 = top-level section item).

### 5.3.3 Full Report Generation

`generateFullReport(result)` produces the standard output described in §5.1–§5.3. It:
1. Writes `summary.json` with `status: "complete"` (no `aborted` field).
2. Writes `report.md` using the template in §5.4.
3. Generates Mermaid graph via `generateMermaidGraph()` (§5.5).
4. Writes per-page artifacts (ui-tree.json, screenshot.png, clickable-elements.json, metadata.json) to `pages/`.
5. Updates `index.json` with `"status": "complete"`.

`generatePartialReport(result)` (circuit breaker case, §5.3.4 below) follows the same structure but with the differences noted below.

### 5.3.4 Partial Report

When the circuit breaker triggers (5 consecutive failures), the engine generates a partial report with these differences from a full report:

| Field | Full Report | Partial Report |
|-------|------------|----------------|
| `summary.json` | `aborted` absent | `"aborted": true`, `"abortReason": "5 consecutive failures"` |
| `report.md` header | `# APP Exploration Report` | `# ⚠️ PARTIAL REPORT — APP Exploration Report` |
| `report.md` body | All sections | Includes "Last successful page: {path}" note |
| Mermaid graph | Complete graph | May be incomplete (only visited pages) |
| `index.json` entry | `"status": "complete"` | `"status": "partial"` |

Partial reports are useful for diagnosing why an app failed to explore (broken launch, crash loops, auth walls) without waiting for manual intervention.

### 5.4 `report.md` Template

```markdown
# APP Exploration Report — {appId} v{appVersion}

## Overview
| Metric | Value |
|--------|-------|
| Exploration Time | {startedAt} |
| Duration | {durationMs formatted} |
| Mode | {mode} {scope info if scoped} |
| Total Pages | {totalPages} |
| Total Paths | {totalPaths} |
| Failures | {failureCount} |
| Max Depth | {maxDepthReached} |
| Platform | {platform} |

## Page Map

{Mermaid graph embedded or linked}

## Module Breakdown

{Group pages by inferred module (see §5.3.1 Module Inference)}

### {Module Name} ({count} pages)
| Page | Depth | Path | Status |
|------|-------|------|--------|
| {screenTitle} | {depth} | {path.join(' → ')} | ✅ / ❌ / ⚠️ |

## Alerts

{#failures > 0 ? `### ❌ Failed Pages ({failureCount})` : ''}
{#failures.map(f => `- **${f.pageScreenId}**: ${f.failureType} on "${f.elementLabel}" at depth ${f.depth}\n  Path: ${f.path.join(' → ')}\n  Error: ${f.errorMessage}`)}

{#slowPages > 0 ? `### ⚠️ Slow Pages (load > 5s)` : ''}
{#slowPages.map(p => `- **${p.screenId}**: ${p.loadTimeMs}ms`)}

{#duplicateWarnings > 0 ? `### ℹ️ Possible Duplicates` : ''}
{#duplicateWarnings.map(d => `- ${d.pageA} ≈ ${d.pageB} (${d.similarity}% similar)`)}

## Historical Comparison

{compareWith ? diffSection : 'No comparison requested.'}

---
*Generated by mobile-e2e-mcp Explorer v{version}*
```

### 5.5 Mermaid Graph Generation

```typescript
function generateMermaidGraph(pages: PageEntry[], failures: FailureEntry[]): string {
  const lines = ['graph TD'];

  // Nodes
  for (const page of pages) {
    const style = getFailureStatus(page.id, failures);
    const label = escapeMermaidLabel(page.screenTitle || page.screenId);
    lines.push(`  ${page.id}["${label}"]`);
    if (style === 'fail') lines.push(`  style ${page.id} fill:#f99,stroke:#f66`);
    else if (style === 'warn') lines.push(`  style ${page.id} fill:#ff9,stroke:#cc6`);
  }

  // Edges (navigation paths)
  for (const page of pages) {
    if (page.arrivedFrom) {
      const fromId = findPageIdByScreenId(pages, page.arrivedFrom);
      const edgeLabel = page.viaElement ? `|${escapeMermaidLabel(page.viaElement)}|` : '';
      lines.push(`  ${fromId} -->${edgeLabel} ${page.id}`);
    }
  }

  return lines.join('\n');
}

// Helper: find page entry by screenId
function findPageIdByScreenId(pages: PageEntry[], screenId: string): string {
  const found = pages.find(p => p.screenId === screenId);
  return found ? found.id : 'Home';  // fallback to Home if not found
}

// Helper: determine failure status for styling
function getFailureStatus(pageId: string, failures: FailureEntry[]): 'ok' | 'warn' | 'fail' {
  const pageFailures = failures.filter(f => f.path.some(p => p.includes(pageId)));
  if (pageFailures.length > 2) return 'fail';
  if (pageFailures.length > 0) return 'warn';
  return 'ok';
}

// Helper: escape special Mermaid characters in labels
function escapeMermaidLabel(text: string): string {
  return text.replace(/["()]/g, '').replace(/#/g, 'sharp');  // remove quotes/parens, replace #
}
```

**For large apps (200+ pages):**
- Generate a **top-level graph** with only depth-0 and depth-1 nodes (module entry points)
- Generate **sub-graphs** per module as separate `.mmd` files
- Reference sub-graphs in the report: "See [Settings Module Graph](./graphs/settings.mmd)"

### 5.6 History Diff

When `compareWith` is set, generate a diff report:

```markdown
# Diff: {runA.id} vs {runB.id}

## Summary
| Metric | {runA} | {runB} | Delta |
|--------|--------|--------|-------|
| Pages | {a.totalPages} | {b.totalPages} | {delta} |
| Failures | {a.failureCount} | {b.failureCount} | {delta} |

## New Pages ({newPages.length})
{newPages.map(p => `- ✅ ${p.screenId} (depth ${p.depth}, via ${p.path.join(' → ')})`)}

## Removed Pages ({removedPages.length})
{removedPages.map(p => `- ❌ ${p.screenId} (was at depth ${p.depth})`)}

## Status Changes
{#fixed.map(f => `- 🟢 ${f.screenId}: was failing, now OK`)}
{#regressed.map(r => `- 🔴 ${r.screenId}: was OK, now failing (${r.failureType})`)}

## Path Changes
{pathDiffs.map(d => `- ${d.screenId}: path changed from "${d.oldPath}" to "${d.newPath}"`)}
```

---

## 6. Existing MCP Tool Dependencies

The explorer consumes these existing tools. No new MCP tools are introduced in Phase 1.

| Tool | Usage |
|------|-------|
| `launch_app` | Start the target app |
| `inspect_ui` | Capture page UI hierarchy |
| `wait_for_ui_stable` | Wait for page to settle after tap |
| `resolve_ui_target` | Find specific UI element |
| `tap_element` | Tap a resolved element |
| `navigate_back` | System-level back navigation |
| `take_screenshot` | Capture page screenshot |
| `get_screen_summary` | Quick screen state check |
| `type_into_element` | Phase 2: form filling |
| `reset_app_state` | Recovery from bad state |
| `recover_to_known_state` | Recovery fallback |
| `request_manual_handoff` | Pause for user intervention |

---

## 7. Non-Goals (Phase 1)

| Out of Scope | Reason |
|-------------|--------|
| Form auto-filling with test data | Requires test-data generator, field-type inference, validation logic — Phase 2 |
| Login auto-detection and credential injection | Complex UI pattern detection; Phase 1 uses pre-flight auth config |
| Visual regression (pixel comparison of page content) | Requires baseline image store and diff pipeline — separate concern |
| CI/CD integration | Phase 1 is CLI/interactive only; CI reuse is via the same `npx` entry point |
| Multi-app exploration | One run = one app |
| Real device performance metrics | loadTimeMs is captured but not benchmarked against baselines |
| YAML/TOML config format | JSON is used for Phase 1; migration to human-editable format can happen later if manual config overrides become common |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Infinite page generation (news feeds, infinite scroll) | High | `maxPages` adaptive limit, depth limit, content-change detection after scroll (§4.7) |
| App crash during exploration | Medium | Crash detection + `reset_app_state` re-launch, mark page as failed, continue |
| Back navigation unreliable on iOS (especially modals) | Medium | Multi-strategy backtracking (system back → find back button → relaunch) + modal detection + presenting-page tracking |
| Dedup false positives (different pages look similar) | Medium | Three-tier dedup (text → structure → `pixelmatch`), screenshot normalization (§4.3.1), threshold TBD via spike (§4.3), manual review flag |
| Exploration too slow for large apps | Medium | Timeout (15-30 min), adaptive `maxPages` with backtrack cost (§4.7), smoke mode as faster alternative |
| Login-required pages unreachable | Low | Pre-flight interview covers auth; handoff mode for manual login |
| State corruption from side-effect actions (e.g., creating data, toggling settings) | Medium | `reset_app_state` on crash/backtrack mismatch; toggle cells excluded; destructive elements excluded by default (§4.4 `isDestructive`) |
| Engine hangs on broken app (no crashes, no progress) | Medium | Circuit breaker: 5 consecutive **pages** (not elements) with no navigation → abort with partial report (§4.1) |
| Destructive operation triggered accidentally (Delete Account, Reset Settings) | **High** | Default `destructiveActionPolicy: 'skip'` blocks all destructive patterns; user must explicitly set `'allow'` (§3.1, §4.4) |
| Tap on no-op element causes infinite loop (disabled button, decorative icon) | **High** | `validateNavigation()` checks `screenId` changed before pushing to stack; no-change = no push (§4.1) |
| System dialog blocks exploration (permission, update prompt) | Medium | `isSystemDialog()` detection + `handleSystemDialog()` safe dismissal (§4.1) |
| MCP adapter call path undecided — implementation blocked | Medium | §4.8 pre-implementation gate: 25-00 spike must confirm tool export path before 25-01 begins |

---

## 9. Acceptance Criteria

### 9.1 Functional

- [ ] Can launch an app and explore all reachable screens in smoke mode (depth 5) within 8 minutes on M1/M2 simulator
- [ ] Can explore all reachable screens in full mode (depth 8) within 30 minutes on M1/M2 simulator for a typical app (50-100 pages)
- [ ] Produces a valid `summary.json` with all pages visited and failures logged
- [ ] Produces a readable `report.md` with page inventory, alerts, and Mermaid graph
- [ ] Dedup false-positive rate <5% and false-negative rate <2% on the validation sample app (measured against manual page inventory)
- [ ] Backtracking works: after visiting a child page, returns to expected parent and continues with next sibling — **≥95% backtrack accuracy across ≥30 backtrack operations** on ≥3 navigation patterns (UINavigationController, React Navigation stack, modal dismissal)
- [ ] Failure policy is respected: retry-3 retries 3 times before skipping; skip never retries; handoff pauses
- [ ] History diff correctly identifies new/removed/changed pages between two runs
- [ ] Circuit breaker triggers after 5 consecutive **pages** (not elements) with no successful navigation and produces a partial report
- [ ] Infinite scroll containers are detected and skipped (not treated as endless new pages)
- [ ] Destructive elements (Delete Account, Reset Settings, Sign Out) are excluded by default (`destructiveActionPolicy: 'skip'`); user can override to `'allow'`
- [ ] `validateNavigation()` prevents infinite loops on no-op elements (disabled buttons, decorative icons)
- [ ] System dialogs (permission requests, update prompts) are detected and safely dismissed
- [ ] MCP adapter is confirmed and smoke-tested before 25-01 engine implementation begins (§4.8 gate)

### 9.2 Platform

- [ ] iOS simulator (M1/M2, iOS 17.4): full functionality, performance benchmarks measured here, dedup accuracy validated against manual baseline
- [ ] iOS real device: full functionality with caveat that tap latency may be 2-3× higher than simulator; dedup L3 cost may be higher due to different screenshot format
- [ ] Android emulator (API 34): full functionality, smoke-mode test on Settings
- [ ] Android real device: full functionality

### 9.3 Config

- [ ] Pre-flight interview collects all **7** config dimensions (6 original + `destructiveActionPolicy`)
- [ ] Config persists to `.explorer-config.json`
- [ ] Re-run offers to reuse previous config
- [ ] `testCredentials.passwordEnv` is read from environment at runtime, never persisted

### 9.4 Report

- [ ] `index.json` is updated after each run
- [ ] Mermaid graph renders in GitHub, Obsidian, and VS Code Markdown preview
- [ ] Diff report is generated when `compareWith` is set

---

## 10. Implementation Plan

Phase 25 will be broken into sub-plans:

| Plan | Scope | Deliverable |
|------|-------|-------------|
| 25-00 | Validation spike: (a) Manual inventory of iOS 17.4 Settings — count top-level sections, sub-pages, toggle cells; (b) Run `inspect_ui` + `tap_element` + `navigate_back` on Settings for 10 pages; measure per-page latency, dedup collision rate, backtrack success rate, element heuristic accuracy; (c) Quick smoke-mode test on a Tab Bar-based RN app | Manual baseline document + spike results documented |
| 25-01 | Explorer engine core (DFS + snapshot + dedup with `pixelmatch` + circuit breaker + toggle exclusion) | `packages/explorer/src/engine.ts` |
| 25-02 | Report generator (summary + markdown + Mermaid + history diff + partial report support) | `packages/explorer/src/report.ts` |
| 25-03 | Pre-flight interview + config persistence + CLI entry point | `packages/explorer/src/config.ts` + `src/cli.ts` |
| 25-04 | Validation on Settings app (iOS 17.4 simulator) — end-to-end run with evidence, compare against manual baseline | E2E test run with dedup accuracy calculation |
| 25-05 | Cross-platform validation (iOS real device, Android API 34 emulator, Android real device) + Tab Bar app smoke mode test | Platform-specific E2E runs |

**Dependencies:** Existing MCP tools must be stable. No new MCP tool development required.

**Risk note:** The dedup algorithm's accuracy depends on app-specific UI patterns. The three-tier approach (text → structure → `pixelmatch`) should handle most cases, but edge cases (dynamic content, A/B variants) may need tuning during validation. The `pixelmatch` threshold (0.05) and hash functions are expected to require 1-2 iterations of tuning based on spike results from Plan 25-00.

---

## 11. Future Extensions (Not Phase 1)

| Extension | Description | Dependency |
|-----------|-------------|------------|
| Phase 26: Form Auto-Fill | Detect input fields, generate test data, fill and submit | Field type inference, test-data generator |
| Phase 27: CI Integration | Headless exploration in CI with pass/fail gates | 25-05 validation complete |
| Phase 28: Visual Regression | Compare page screenshots against baseline | Baseline image store, diff pipeline |
| Phase 29: Flow Generation | Auto-generate Maestro YAML from explored paths | Flow template engine |
| Phase 30: Smart Scope | ML-based path prioritization based on change impact | Code change analysis + UI mapping |
