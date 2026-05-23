# Plan 25-01: Explorer Engine Core

**Parent:** Phase 25 — Full App Explorer
**Type:** Implementation
**Location:** `packages/explorer/`
**Dependencies:** 25-00 spike results (element type mapping, toggle detection)
**Duration:** 2-3 days
**Parallelism note:** 25-02 (Report) and 25-03 (Config/CLI) can start in parallel once types from Step 1-2 are defined. They do NOT need to wait for 25-01 engine implementation.

---

## Objective

Implement the core DFS exploration engine with snapshot collection, three-tier dedup, element prioritization, backtracking, and circuit breaker. This is the largest and most critical sub-plan.

---

## Step 0: MCP Adapter Implementation (DO THIS FIRST)

### 0.1 Confirmed MCP call path (R5-A, R5-D — locked after repo-truth review)

**Decision:** The explorer calls MCP tools through the **in-process `MobileE2EMcpServer.invoke()`** API. No HTTP/RPC, no `ask_user_question`, no external server.

**How it works in the live repo:**
- `MobileE2EMcpServer` is defined in `packages/mcp-server/src/server.ts`
- It exposes `invoke<TName>(toolName, input): Promise<ToolResult<ToolOutputData<TName>>>`
- All tools return `ToolResult<TData>` — a wrapper with `status`, `reasonCode`, `data`, `artifacts`, `nextSuggestions`, `sessionId`, `durationMs`, `attempts`
- The CLI (`packages/cli/src/index.js`) is a thin stdio pass-through; real tool invocation goes through the server class

**Explorer integration path:**
```
packages/explorer/src/engine.ts
  → imports { MobileE2EMcpServer, MobileE2EMcpToolName } from the mcp-server package (`packages/mcp-server/src/index.ts` / `packages/mcp-server/src/server.ts`)
  → calls server.invoke(TOOL_NAMES.inspectUi, {})
  → receives ToolResult<InspectUiData>
  → unwraps: result.status === 'success' ? result.data : handle failure
```

**Why not HTTP/RPC:** The monorepo does not expose MCP tools over HTTP. The `mcp-server` package is a library, not a standalone server. The `packages/cli` binary spawns the dev process and pipes stdio.

**Why not `ask_user_question`:** That is an AI-agent orchestration tool, not an MCP tool.

### 0.2 Create MCP adapter interface (ToolResult-aware — R5-A)

Create `packages/explorer/src/mcp-adapter.ts`:

```typescript
// This adapter bridges the engine's type-safe interface with the actual MCP tool calls.
// ALL tools return ToolResult<TData> — the adapter unwraps them.
import type { ToolResult } from '@mobile-e2e-mcp/contracts';
import type {
  InspectUiData, TapElementData, NavigateBackData,
  WaitForUiStableData, ScreenshotData, LaunchAppData,
  RecoverToKnownStateData, ResetAppStateData,
  RequestManualHandoffData,
} from '@mobile-e2e-mcp/contracts';

/**
 * Adapter that wraps MobileE2EMcpServer.invoke() and unwraps ToolResult<TData>
 * into engine-friendly return types. This is the ONLY place where ToolResult
 * is consumed — the rest of the engine works with plain types.
 */
export interface McpToolInterface {
  launchApp(args: { appId: string }): Promise<ToolResult<LaunchAppData>>;
  waitForUiStable(args: { timeoutMs: number }): Promise<ToolResult<WaitForUiStableData>>;
  inspectUi(): Promise<ToolResult<InspectUiData>>;
  tapElement(args: { selector: unknown }): Promise<ToolResult<TapElementData>>;
  navigateBack(): Promise<ToolResult<NavigateBackData>>;
  takeScreenshot(): Promise<ToolResult<ScreenshotData>>;
  recoverToKnownState(): Promise<ToolResult<RecoverToKnownStateData>>;
  resetAppState(args: { appId: string }): Promise<ToolResult<ResetAppStateData>>;
  requestManualHandoff(): Promise<ToolResult<RequestManualHandoffData>>;
}

/**
 * Create an adapter bound to the given server instance.
 * In CLI mode: server = new MobileE2EMcpServer(registry).
 * In test mode: server = mock implementation.
 */
export function createMcpAdapter(server: {
  invoke: <TName extends string>(name: TName, input: unknown) => Promise<ToolResult<unknown>>;
}): McpToolInterface {
  const invoke = server.invoke.bind(server);
  return {
    launchApp: (args) => invoke('launch_app', args) as Promise<ToolResult<LaunchAppData>>,
    waitForUiStable: (args) => invoke('wait_for_ui_stable', args) as Promise<ToolResult<WaitForUiStableData>>,
    inspectUi: () => invoke('inspect_ui', {}) as Promise<ToolResult<InspectUiData>>,
    tapElement: (args) => invoke('tap_element', args) as Promise<ToolResult<TapElementData>>,
    navigateBack: () => invoke('navigate_back', {}) as Promise<ToolResult<NavigateBackData>>,
    takeScreenshot: () => invoke('take_screenshot', {}) as Promise<ToolResult<ScreenshotData>>,
    recoverToKnownState: () => invoke('recover_to_known_state', {}) as Promise<ToolResult<RecoverToKnownStateData>>,
    resetAppState: (args) => invoke('reset_app_state', args) as Promise<ToolResult<ResetAppStateData>>,
    requestManualHandoff: () => invoke('request_manual_handoff', {}) as Promise<ToolResult<RequestManualHandoffData>>,
  };
}

/**
 * Helper: unwrap a ToolResult into either the data or an Error.
 * Use this at adapter boundaries — do NOT check ToolResult fields elsewhere in the engine.
 */
export function unwrapResult<T>(result: ToolResult<T>): T {
  if (result.status === 'success' || result.status === 'partial') {
    return result.data as T;
  }
  const err = new Error(`ToolResult: ${result.status} (${result.reasonCode}): ${result.nextSuggestions?.join('; ')}`);
  (err as any).reasonCode = result.reasonCode;
  (err as any).suggestions = result.nextSuggestions;
  throw err;
}
```

### 0.3 How the engine consumes ToolResult

Every MCP call in the engine follows this pattern:

```typescript
// Good: unwrap at the boundary, work with plain data inside
const uiTree = unwrapResult(await mcp.inspectUi());
const elements = findClickableElements(uiTree, config);

// Good: check status for control flow
const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
if (stableResult.status !== 'success') {
  return { success: false, error: new Error('TIMEOUT: UI did not stabilize') };
}

// Bad: do NOT do this — unwrap at the boundary instead
// const uiTree = await mcp.inspectUi(); // wrong — mcp.inspectUi returns ToolResult
```

### 0.4 Deliverables

- [ ] `packages/explorer/src/mcp-adapter.ts` — adapter interface + `unwrapResult` helper
- [ ] All engine MCP calls go through `McpToolInterface` (Step 0.2), never raw `ToolResult` inspection
- [ ] Document the single call path in `mcp-adapter.ts` header comment: "MobileE2EMcpServer.invoke() → ToolResult → unwrapResult → engine plain types"

---

## Step 1: Package Setup

### 1.1 Create package structure

```
packages/explorer/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── engine.ts             # Main explore() function
│   ├── snapshot.ts           # captureSnapshot(), tapAndWait()
│   ├── dedup.ts              # PageRegistry, L1/L2/L3 dedup
│   ├── elements.ts           # findClickableElements, prioritizeElements, classification
│   ├── backtrack.ts          # navigateBack with verification
│   └── report.ts             # generateReport() stub (real impl in 25-02)
└── tests/
    ├── dedup.test.ts
    ├── elements.test.ts
    └── backtrack.test.ts
```

### 1.2 `package.json`

```json
{
  "name": "@mobile-e2e-mcp/explorer",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pixelmatch": "^6.0.0",
    "sharp": "^0.33.0",
    "@mobile-e2e-mcp/contracts": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@types/pixelmatch": "^5.2.0"
  }
}
```

> **R5-E note:** This package does NOT define a `bin` entry. The CLI entry point is wired through the existing `packages/cli` → `packages/mcp-server` chain.

### 1.3 `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  external: ['sharp'],  // sharp has native bindings, keep external
});
```

### 1.4 `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

> **⚠️ Verify:** Before creating this file, check that `../../tsconfig.base.json` exists and has compatible settings. If not, create a standalone `tsconfig.json` without `extends`.

### 1.5 Root workspace

The root `pnpm-workspace.yaml` already uses `packages/*`, so `packages/explorer` is auto-included. No manual workspace registration needed — just verify the glob exists.

---

## Step 2: Types (`src/types.ts`)

### 2.1 Define all interfaces from spec

> **⚠️ Important:** `UiHierarchy` shape is marked as `unknown` until 25-00 returns actual MCP output. All code in Steps 3-7 that accesses `UiHierarchy` properties should be treated as tentative stubs that must be updated after 25-00 results.

```typescript
// §3.1 Configuration Schema — includes all fields from SPEC v3.0
export interface ExplorerConfig {
  mode: 'smoke' | 'scoped' | 'full';
  scope?: {
    type: 'screen-title' | 'element-text' | 'tab-index' | 'module-name';
    value: string | number;
  };
  auth:
    | { type: 'already-logged-in' }
    | { type: 'skip-auth' }
    | { type: 'handoff' }
    | { type: 'auto-login'; credentials: TestCredentials };
  failureStrategy: 'retry-3' | 'skip' | 'handoff';
  maxDepth: number;
  maxPages: number;
  timeoutMs: number;
  compareWith: string | null;
  platform: 'ios-simulator' | 'ios-device' | 'android-emulator' | 'android-device';
  destructiveActionPolicy: 'skip' | 'confirm' | 'allow';  // SPEC §3.1, R1-#1
  appId: string;
  reportDir: string;
}

export interface TestCredentials {
  identifierField: string;
  passwordField: string;
  submitAction: string;
  identifier: string;
  passwordEnv: string;
}

// §4.2 PageSnapshot
export interface PageSnapshot {
  screenId: string;
  screenTitle?: string;
  routeName?: string;
  uiTree: UiHierarchy;
  clickableElements: ClickableTarget[];
  screenshotPath: string;
  capturedAt: string;
  arrivedFrom: string | null;
  viaElement: string | null;
  depth: number;
  loadTimeMs: number;
  stabilityScore: number;
}

// Element types
export interface ClickableTarget {
  label: string;
  selector: ElementSelector;
  elementType: string;
  priority?: number;
}

export interface ElementSelector {
  accessibilityId?: string;
  resourceId?: string;
  text?: string;
  elementType?: string;
  position?: { x: number; y: number };
}

// Dedup types
export interface DedupResult {
  alreadyVisited: boolean;
  matchedId?: string;
  confidence?: 'text' | 'structure' | 'visual';
  warning?: string;
}

// Engine types — CORRECTED for per-element immediate exploration DFS (SPEC §4.1 v3.0)
export interface Frame {
  state: PageState;
  depth: number;
  path: string[];
  elementIndex: number;           // mutable cursor: next element to explore
  elements: ClickableTarget[];    // pre-computed clickable elements on this page
}

export interface PageState {
  // Opaque state passed to captureSnapshot
  // Implementation may be empty — state is tracked via PageRegistry
}

export interface ExplorationResult {
  visited: PageRegistry;
  failed: FailureLog;
  aborted?: boolean;
  abortReason?: string;
}

// Failure types
export interface FailureEntry {
  pageScreenId: string;
  elementLabel: string;
  failureType: 'TAP_FAILED' | 'TIMEOUT' | 'CRASH' | 'BACKTRACK_MISMATCH' | 'INTERRUPTED';
  retryCount: number;
  errorMessage: string;
  depth: number;
  path: string[];
}

// Report types
export interface PageEntry {
  id: string;
  screenId: string;
  screenTitle?: string;
  depth: number;
  path: string[];
  arrivedFrom: string | null;
  viaElement: string | null;
  loadTimeMs: number;
  clickableCount: number;
  hasFailure: boolean;
}

export type Action = 'abort' | 'retry' | 'skip' | 'handoff';

// UiHierarchy — this is the raw output from inspect_ui MCP tool
// ⚠️ MARK AS UNKNOWN until 25-00 returns actual shape
// After 25-00: update this interface with actual property names
// The `children` property below is a placeholder — actual property may differ
export type UiHierarchy = unknown & {
  elementType: string;
  label?: string;
  accessibilityLabel?: string;
  accessibilityTraits?: string[];
  visibleTexts?: string[];
  children?: UiHierarchy[];  // PLACEHOLDER: verify actual child property name from 25-00
  frame?: { x: number; y: number; width: number; height: number };
  resourceId?: string;
};
```

### 2.2 Acceptance criteria

- [ ] All types compile without errors
- [ ] `UiHierarchy` shape matches actual `inspect_ui` output from 25-00 (update after spike)

---

## Step 3: Element Filtering (`src/elements.ts`)

### 3.1 Implement `findClickableElements()`

> **⚠️ Warning:** `flattenTree` assumes `UiHierarchy` has a `children` array property. The actual `inspect_ui` output may use a different structure. Update `flattenTree` after 25-00 results.

```typescript
import { UiHierarchy, ClickableTarget, ExplorerConfig } from './types';

// After 25-00: update flattenTree to match actual UiHierarchy shape
// Note: requires config for destructive element filtering (SPEC §4.4, R1-#1)
export function findClickableElements(uiTree: UiHierarchy, config: ExplorerConfig): ClickableTarget[] {
  const allElements = flattenTree(uiTree);
  return allElements
    .filter(el =>
      isInteractive(el)
      && !isToggle(el)
      && !isTextInput(el)
      && !isNonInteractive(el)
      && !isDestructive(el, config.destructiveActionPolicy)  // SPEC §4.4, R1-#1
    )
    .map(el => toClickableTarget(el));
}

// SPEC §4.4, R1-#1: filter destructive operations (Delete Account, Reset Settings, etc.)
function isDestructive(el: UiHierarchy, policy: 'skip' | 'confirm' | 'allow'): boolean {
  if (policy === 'allow') return false;
  const label = (el.label || el.accessibilityLabel || el.visibleTexts?.[0] || '').toLowerCase();
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

function flattenTree(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  result.push(node);
  if ((node as any).children) {
    (node as any).children.forEach((child: UiHierarchy) => flattenTree(child, result));
  }
  return result;
}
```

### 3.2 Implement classification functions

**These MUST be updated based on 25-00 spike results.** Initial stubs:

```typescript
// Update elementType values after 25-00 spike
const INTERACTIVE_TYPES = new Set(['Button', 'Cell', 'ListItem', 'Link', 'StaticText', 'Image']);
const TOGGLE_TYPES = new Set(['Switch', 'Toggle']);
const TEXT_INPUT_TYPES = new Set(['TextField', 'SecureTextField', 'TextView']);
const NON_INTERACTIVE_TYPES = new Set(['StaticText', 'Image', 'Separator', 'ActivityIndicator', 'ProgressBar', 'ScrollView', 'Group']);

export function isInteractive(el: UiHierarchy): boolean {
  if (INTERACTIVE_TYPES.has(el.elementType)) return true;
  if (el.accessibilityTraits?.some(t => t === 'button' || t === 'link')) return true;
  return false;
}

export function isToggle(el: UiHierarchy): boolean {
  // UPDATE after 25-00: use actual toggle detection from spike
  if (TOGGLE_TYPES.has(el.elementType)) return true;
  if (el.accessibilityTraits?.includes('toggleButton')) return true;
  if (el.accessibilityTraits?.includes('switch')) return true;
  return false;
}

export function isTextInput(el: UiHierarchy): boolean {
  if (TEXT_INPUT_TYPES.has(el.elementType)) return true;
  if (el.accessibilityTraits?.includes('allowsDirectInteraction')) return true;
  return false;
}

export function isNonInteractive(el: UiHierarchy): boolean {
  if (el.elementType === 'StaticText' && !el.accessibilityTraits?.includes('link')) return true;
  if (el.elementType === 'Image' && !el.accessibilityTraits?.includes('button')) return true;
  if (NON_INTERACTIVE_TYPES.has(el.elementType)) return true;
  return false;
}
```

### 3.3 Implement `toClickableTarget()`

```typescript
import { UiHierarchy, ClickableTarget, ElementSelector } from './types';

export function toClickableTarget(el: UiHierarchy): ClickableTarget {
  return {
    label: el.label || el.accessibilityLabel || el.visibleTexts?.[0] || el.elementType,
    selector: buildSelector(el),
    elementType: el.elementType,
  };
}

export function buildSelector(el: UiHierarchy): ElementSelector {
  if (el.accessibilityLabel) return { accessibilityId: el.accessibilityLabel };
  if (el.resourceId) return { resourceId: el.resourceId };
  if (el.label || el.visibleTexts?.[0]) {
    return { text: el.label || el.visibleTexts![0], elementType: el.elementType };
  }
  if (el.frame) {
    return { position: { x: el.frame.x, y: el.frame.y } };
  }
  // Fallback: use elementType as text (will likely fail resolve, but won't crash)
  return { text: el.elementType };
}
```

### 3.4 Implement `prioritizeElements()`

```typescript
import { ClickableTarget } from './types';

export function prioritizeElements(elements: ClickableTarget[]): ClickableTarget[] {
  return [...elements].sort((a, b) => (b.priority || 10) - (a.priority || 10));
}

export function priorityScore(el: ClickableTarget): number {
  // TODO: implement proper priority detection based on element properties
  // This requires access to the full UiHierarchy node, not just ClickableTarget
  // Refactor: pass UiHierarchy node or attach priority during toClickableTarget()
  return 10;
}
```

### 3.5 Tests

`tests/elements.test.ts`:
- [ ] `findClickableElements` filters out toggles, text inputs, non-interactive
- [ ] `isToggle` correctly identifies toggle elements (use 25-00 spike data)
- [ ] `buildSelector` prioritizes accessibilityId > resourceId > text > position
- [ ] `toClickableTarget` extracts label from correct fallback chain

---

## Step 4: Dedup Engine (`src/dedup.ts`)

### 4.1 L1: Text hash

```typescript
import { createHash } from 'crypto';  // Node built-in (no new dependency)
import { UiHierarchy } from './types';

export function hashVisibleTexts(uiTree: UiHierarchy): string {
  const texts = collectVisibleTexts(uiTree)
    .sort()
    .join('-')
    .slice(0, 120);
  return shortHash(texts);
}

function collectVisibleTexts(node: UiHierarchy, result: string[] = []): string[] {
  if (node.visibleTexts) result.push(...node.visibleTexts);
  if (node.label && !isDecorative(node)) result.push(node.label);
  node.children?.forEach(child => collectVisibleTexts(child, result));
  return result;
}

function isDecorative(node: UiHierarchy): boolean {
  // Exclude system bars, status indicators, separators
  return false; // TODO: refine after 25-00
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
```

### 4.2 L2: Structure hash

```typescript
export function hashUiStructure(uiTree: UiHierarchy): string {
  const structure = buildStructureSignature(uiTree);
  return shortHash(structure);
}

function buildStructureSignature(node: UiHierarchy, depth = 0): string {
  const childSigs = node.children
    ?.map(child => buildStructureSignature(child, depth + 1))
    .join(',') || '';
  return `${node.elementType}:${node.children?.length || 0}:${childSigs}`;
}
```

### 4.3 L3: pixelmatch comparison

```typescript
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import { createReadStream } from 'fs';
import { PageSnapshot } from './types';

const PIXELMATCH_THRESHOLD = 0.05;
const NORMALIZED_SIZE = 1080; // normalize to 1080px width

export async function compareScreenshotsPixelmatch(
  pathA: string,
  pathB: string,
  options: { threshold?: number } = {}
): Promise<number> {
  const threshold = options.threshold ?? PIXELMATCH_THRESHOLD;

  const [imgA, imgB] = await Promise.all([
    normalizeImage(pathA),
    normalizeImage(pathB),
  ]);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    // Shouldn't happen after normalization, but handle gracefully
    return 1.0; // completely different
  }

  const totalPixels = imgA.width * imgA.height;
  const diff = pixelmatch(imgA.data, imgB.data, null, imgA.width, imgA.height, {
    threshold: 0.1, // pixelmatch internal threshold
  });

  return diff / totalPixels;
}

async function normalizeImage(path: string): Promise<{ data: Buffer; width: number; height: number }> {
  // Use sharp for image normalization
  // FALLBACK: If sharp fails to install (native binding issues), use pngjs:
  //   const { PNG } = require('pngjs');
  //   const png = PNG.sync.read(readFileSync(path));
  //   // Manual resize or pass as-is if already same size
  return sharp(path)
    .resize(NORMALIZED_SIZE, undefined, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ data, width: info.width, height: info.height }));
}
```

### 4.4 PageRegistry

> **Note:** `generatePageId()` is scoped inside `PageRegistry` to avoid module-level mutable state. This ensures each registry instance has its own counter.

```typescript
import { PageSnapshot, DedupResult, PageEntry } from './types';
import { hashVisibleTexts, hashUiStructure, compareScreenshotsPixelmatch } from './dedup';

let globalPageCounter = 0;
function generatePageId(): string {
  globalPageCounter++;
  return `page-${String(globalPageCounter).padStart(3, '0')}`;
}

export class PageRegistry {
  private entries: PageEntry[] = [];
  private byTextHash = new Map<string, PageEntry>();
  private byStructureHash = new Map<string, PageEntry[]>();

  async dedup(snapshot: PageSnapshot): Promise<DedupResult> {
    const textHash = hashVisibleTexts(snapshot.uiTree);
    if (this.byTextHash.has(textHash)) {
      return { alreadyVisited: true, matchedId: this.byTextHash.get(textHash)!.id, confidence: 'text' };
    }

    const structHash = hashUiStructure(snapshot.uiTree);
    const structCandidates = this.byStructureHash.get(structHash) || [];
    if (structCandidates.length > 0) {
      for (const candidate of structCandidates) {
        const mismatchRatio = await compareScreenshotsPixelmatch(
          snapshot.screenshotPath,
          candidate.snapshot.screenshotPath,
        );
        if (mismatchRatio < 0.05) {
          return { alreadyVisited: true, matchedId: candidate.id, confidence: 'visual' };
        }
      }
      return { alreadyVisited: false, warning: 'structurally-similar-but-visually-different' };
    }

    return { alreadyVisited: false };
  }

  register(result: DedupResult, snapshot: PageSnapshot, path: string[]) {
    if (result.alreadyVisited) return;
    const entry: PageEntry = { id: generatePageId(), snapshot, path };
    this.entries.push(entry);

    const textHash = hashVisibleTexts(snapshot.uiTree);
    const structHash = hashUiStructure(snapshot.uiTree);
    this.byTextHash.set(textHash, entry);
    this.byStructureHash.set(structHash, [...(this.byStructureHash.get(structHash) || []), entry]);
  }

  getEntries(): PageEntry[] {
    return [...this.entries];
  }

  get count(): number {
    return this.entries.length;
  }
}
```

### 4.5 Tests

`tests/dedup.test.ts`:
- [ ] L1: identical text content → alreadyVisited
- [ ] L1: different text content → not alreadyVisited
- [ ] L2: same structure → triggers L3
- [ ] L3: identical screenshots → alreadyVisited (mismatchRatio = 0)
- [ ] L3: different screenshots → not alreadyVisited
- [ ] PageRegistry: register then dedup finds the registered page
- [ ] PageRegistry: count increments correctly
- [ ] `normalizeImage` returns Buffer that can be used as Uint8ClampedArray for pixelmatch

---

## Step 5: Snapshot Collection (`src/snapshot.ts`)

### 5.1 Implement `captureSnapshot()`

> **R5-A fix:** `createSnapshotter` now takes `McpToolInterface` (ToolResult-aware), not a raw `MCPTools` object. All MCP calls return `ToolResult<TData>` which must be unwrapped.

```typescript
import { PageSnapshot, UiHierarchy, ExplorerConfig, McpToolInterface } from './types';
import { findClickableElements } from './elements';
import { hashVisibleTexts } from './dedup';
import { unwrapResult } from './mcp-adapter';

export function createSnapshotter(mcp: McpToolInterface) {
  return {
    // Note: config is needed for destructive element filtering in findClickableElements (R1-#1)
    async captureSnapshot(config: ExplorerConfig): Promise<PageSnapshot> {
      // Unwrap ToolResult at the boundary
      const inspectResult = await mcp.inspectUi();
      const uiTree = unwrapResult(inspectResult) as unknown as UiHierarchy;
      const screenshotResult = await mcp.takeScreenshot();
      const screenshotPath = unwrapResult(screenshotResult).outputPath;

      return {
        screenId: generateScreenId(uiTree),
        screenTitle: extractScreenTitle(uiTree),
        uiTree,
        clickableElements: findClickableElements(uiTree, config),  // pass config (R1-#1, R2-B)
        screenshotPath,
        capturedAt: new Date().toISOString(),
        arrivedFrom: null,
        viaElement: null,
        depth: 0,
        loadTimeMs: 0,
        stabilityScore: 1.0,
      };
    },

    // Expose mcp for isOnExpectedPage check in engine
    mcp,
  };
}

function generateScreenId(uiTree: UiHierarchy): string {
  return hashVisibleTexts(uiTree);
}

function extractScreenTitle(uiTree: UiHierarchy): string | undefined {
  // TODO: implement nav bar title detection
  // Priority: NavigationBarTitle > first prominent text > first 3 words
  return undefined; // stub
}
```

### 5.2 Implement `tapAndWait()`

> **R5-A + R5-B fix:** `tapAndWait` now takes `McpToolInterface` (not a local `MCPTools` interface). All returns go through `ToolResult` unwrapping. The return type matches what Step 7 consumes: `{ success: true; loadTimeMs: number } | { success: false; error: Error }` — no `nextState` field (that was the old broken contract).

```typescript
import { McpToolInterface, ClickableTarget } from './types';
import { unwrapResult } from './mcp-adapter';

export function createTapExecutor(mcp: McpToolInterface) {
  return {
    async tapAndWait(
      element: ClickableTarget,
      overallTimeoutMs: number
    ): Promise<{ success: true; loadTimeMs: number } | { success: false; error: Error }> {
      const tapStart = Date.now();

      try {
        const tapResult = await mcp.tapElement({ selector: element.selector });
        if (tapResult.status !== 'success') {
          return { success: false, error: new Error(`TAP_FAILED: ${tapResult.reasonCode}: ${element.label}`) };
        }

        const settleTimeoutMs = Math.min(10000, overallTimeoutMs - (Date.now() - tapStart));
        const stableResult = await mcp.waitForUiStable({ timeoutMs: settleTimeoutMs });
        if (stableResult.status !== 'success') {
          return { success: false, error: new Error(`TIMEOUT: UI did not stabilize after tapping ${element.label}`) };
        }

        return { success: true, loadTimeMs: Date.now() - tapStart };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  };
}
```

### 5.3 Tests

`tests/snapshot.test.ts`:
- [ ] `captureSnapshot` calls mcp.inspectUi and mcp.takeScreenshot, unwraps ToolResult
- [ ] `tapAndWait` returns success when all MCP tools return status='success'
- [ ] `tapAndWait` returns TAP_FAILED when tapElement returns status='failed'
- [ ] `tapAndWait` returns TIMEOUT when waitForUiStable returns status='failed'

---

## Step 6: Backtracking (`src/backtrack.ts`)

### 6.1 Implement backtrack with verification

> **R5-B fix:** Uses `McpToolInterface` (ToolResult-aware), NOT a local `MCPTools` interface with `Promise<boolean>`. All MCP calls return `ToolResult<TData>`.

```typescript
import { McpToolInterface } from './types';

export function createBacktracker(mcp: McpToolInterface) {
  return {
    async navigateBack(): Promise<boolean> {
      const result = await mcp.navigateBack();
      if (result.status !== 'success') return false;
      // Wait for UI to settle — caller handles snapshot comparison
      await mcp.waitForUiStable({ timeoutMs: 5000 });
      return true;
    },
  };
}
```

### 6.2 Tests

`tests/backtrack.test.ts`:
- [ ] `navigateBack` calls mcp.navigateBack, checks ToolResult status
- [ ] Verification logic compares screenId (mock)

---

## Step 7: Main Engine (`src/engine.ts`)

### 7.1 Implement `explore()` — CORRECTED iterative DFS (SPEC §4.1 v3.0, R2-A, R5-A, R5-B)

> **⚠️ CRITICAL:** This is the **corrected** algorithm. Do NOT use `pop() + for` loop — that pattern was broken (R2-A: siblings tapped on wrong pages). Use `peek + elementIndex cursor + per-element immediate exploration`.
>
> **R5-A fix:** All MCP calls go through `McpToolInterface` which returns `ToolResult<TData>`. The adapter (`createSnapshotter`, `createTapExecutor`) handles unwrapping. The engine only checks `result.status` on MCP calls that need control-flow branching.
>
> **R5-B fix:** `tapAndWait` returns `{ success: true; loadTimeMs: number }` — NOT `{ success: true; nextState: PageState }`. After a successful tap, the engine captures a **new snapshot** to get `nextState`. This matches the real MCP contract where tools return `ToolResult<TData>`, not page state.

```typescript
import { ExplorerConfig, McpToolInterface, ExplorationResult, FailureEntry, Frame } from './types';
import { PageRegistry } from './dedup';
import { createSnapshotter, createTapExecutor } from './snapshot';
import { prioritizeElements } from './elements';
import { generateReport } from './report'; // stub in 25-01, real impl in 25-02
import { unwrapResult } from './mcp-adapter';

export class FailureLog {
  private entries: FailureEntry[] = [];
  record(entry: FailureEntry) { this.entries.push(entry); }
  getEntries(): FailureEntry[] { return [...this.entries]; }
}

export async function explore(
  config: ExplorerConfig,
  mcp: McpToolInterface,
): Promise<ExplorationResult> {
  const visited = new PageRegistry();
  const failed = new FailureLog();
  // CORRECTED: peek-based stack with elementIndex cursor (SPEC §4.1 v3.0, R2-A)
  const stack: Frame[] = [{ state: {} as Frame['state'], depth: 0, path: [], elementIndex: 0, elements: [] }];
  let consecutiveFailedPages = 0;  // per-page counter (R1-#4)
  let pageHadAnySuccess = false;   // tracks whether current page had any successful nav

  const snapshotter = createSnapshotter(mcp);
  const tapper = createTapExecutor(mcp);

  // App launch — unwrap ToolResult at boundary
  const launchResult = await mcp.launchApp({ appId: config.appId });
  if (launchResult.status !== 'success') {
    failed.record({
      pageScreenId: 'app-launch',
      elementLabel: config.appId,
      failureType: 'CRASH',
      retryCount: 0,
      errorMessage: `launch_app failed: ${launchResult.reasonCode}`,
      depth: 0,
      path: [],
    });
    return { visited, failed, aborted: true, abortReason: 'App launch failed' };
  }
  const stableResult = await mcp.waitForUiStable({ timeoutMs: 10000 });
  if (stableResult.status !== 'success') {
    failed.record({
      pageScreenId: 'post-launch',
      elementLabel: 'wait_for_ui_stable',
      failureType: 'TIMEOUT',
      retryCount: 0,
      errorMessage: 'UI did not stabilize after app launch',
      depth: 0,
      path: [],
    });
    return { visited, failed, aborted: true, abortReason: 'UI did not stabilize after launch' };
  }

  // Initial snapshot
  const initialSnapshot = await snapshotter.captureSnapshot(config);
  visited.register({ alreadyVisited: false }, initialSnapshot, []);
  // Store screenId in frame state for isOnExpectedPage checks
  stack[0].state = { screenId: initialSnapshot.screenId } as Frame['state'];

  const startTime = Date.now();

  while (stack.length > 0 && visited.count < config.maxPages && !hasTimedOut(config.timeoutMs, startTime)) {
    const frame = stack[stack.length - 1];  // PEEK (don't pop)

    // Step 0: Navigate to this frame's page if needed (R2-A: backtrack recovery)
    if (frame.depth > 0 && !(await isOnExpectedPage(frame, snapshotter))) {
      const navBackResult = await mcp.navigateBack();
      if (navBackResult.status === 'success') {
        await mcp.waitForUiStable({ timeoutMs: 5000 });
      }
      if (!(await isOnExpectedPage(frame, snapshotter))) {
        failed.record({
          pageScreenId: 'unknown',
          elementLabel: 'backtrack',
          failureType: 'BACKTRACK_MISMATCH',
          retryCount: 0,
          errorMessage: 'backtrack-recovery-failed: cannot reach expected parent page',
          depth: frame.depth,
          path: frame.path,
        });
        stack.pop();
        continue;
      }
    }

    // Step 1: Snapshot (only on first visit, elementIndex === 0)
    if (frame.elementIndex === 0) {
      const snapshot = await snapshotter.captureSnapshot(config);
      const dedupResult = await visited.dedup(snapshot);
      if (dedupResult.alreadyVisited) {
        stack.pop();
        if (frame.depth > 0) {
          await mcp.navigateBack();
          await mcp.waitForUiStable({ timeoutMs: 5000 });
        }
        continue;
      }
      visited.register(dedupResult, snapshot, frame.path);
      frame.elements = prioritizeElements(snapshot.clickableElements);
      frame.state = { screenId: snapshot.screenId } as Frame['state'];
      pageHadAnySuccess = false;  // reset per-page success tracker
    }

    // Step 2: Visit next unexplored element
    if (frame.elementIndex >= frame.elements.length) {
      // All elements explored — pop and backtrack
      stack.pop();
      if (!pageHadAnySuccess && frame.elements.length > 0) {
        consecutiveFailedPages++;  // this page had zero successful navigations
      }
      if (frame.depth > 0) {
        await mcp.navigateBack();
        await mcp.waitForUiStable({ timeoutMs: 5000 });
      }
      continue;
    }

    const element = frame.elements[frame.elementIndex];
    frame.elementIndex++;  // advance cursor (even if this one fails)

    // Retry loop for this element
    let elementRetries = 0;
    let elementResult = await tapper.tapAndWait(element, config.timeoutMs);
    while (!elementResult.success) {
      failed.record({
        pageScreenId: frame.state.screenId ?? 'unknown',
        elementLabel: element.label,
        failureType: elementResult.error.message.includes('TIMEOUT') ? 'TIMEOUT' : 'TAP_FAILED',
        retryCount: elementRetries,
        errorMessage: elementResult.error.message,
        depth: frame.depth,
        path: frame.path,
      });

      const action = handleFailure(elementResult.error, config.failureStrategy, elementRetries);
      if (action === 'abort') break;
      if (action === 'retry') {
        elementRetries++;
        elementResult = await tapper.tapAndWait(element, config.timeoutMs);
        continue;
      }
      if (action === 'handoff') {
        await mcp.requestManualHandoff();
        elementResult = await tapper.tapAndWait(element, config.timeoutMs);
        if (elementResult.success) break;
        continue;
      }
      break; // skip
    }

    if (elementResult.success) {
      // R5-B fix: tapAndWait does NOT return nextState. Capture a new snapshot instead.
      const nextStateSnapshot = await snapshotter.captureSnapshot(config);

      // Validate navigation — ensure the tap actually changed the page (R1-#2, R3-G)
      const navValidation = validateNavigation(nextStateSnapshot, frame.state);
      if (!navValidation.navigated) {
        console.log(`[NO-NAV] ${navValidation.reason}`);
        continue;  // element didn't lead anywhere — try next sibling
      }

      pageHadAnySuccess = true;
      consecutiveFailedPages = 0;  // reset — we had a successful navigation

      // Push child frame for immediate exploration in next iteration
      stack.push({
        state: { screenId: nextStateSnapshot.screenId } as Frame['state'],
        depth: frame.depth + 1,
        path: [...frame.path, element.label],
        elementIndex: 0,
        elements: [],
      });
      // Don't backtrack here — the child will backtrack when it's done.
    }
    // If element failed, continue the while loop to try next sibling.
    // No backtrack needed — we're still on the parent page (failed tap didn't navigate).
  }

  const result: ExplorationResult = {
    visited,
    failed,
    aborted: consecutiveFailedPages >= 5,
    abortReason: consecutiveFailedPages >= 5 ? '5 consecutive pages with no successful navigation' : undefined,
  };

  // generateReport is a stub in 25-01, real impl in 25-02
  await generateReport(
    visited.getEntries(),
    failed.getEntries(),
    config,
    { partial: result.aborted || false, abortReason: result.abortReason, durationMs: Date.now() - startTime },
  );

  return result;
}

// R1-#2: validateNavigation — ensures a tap led to a real page change
// R5-B fix: takes PageSnapshot (not opaque nextState with .screenId)
function validateNavigation(
  nextSnapshot: { screenId: string; uiTree: unknown },
  prevState: { screenId: string },
): { navigated: true } | { navigated: false; reason: string } {
  // Check 1: screenId changed — page content is different
  if (nextSnapshot.screenId === prevState.screenId) {
    return { navigated: false, reason: 'screenId unchanged — element had no navigation effect' };
  }

  // Check 2: detect system dialogs (R2-E: improved with structural check)
  if (isSystemDialog(nextSnapshot)) {
    // handleSystemDialog is async — return false and let the loop retry
    // In practice, the engine will call handleSystemDialog separately after this check
    return { navigated: false, reason: 'system dialog detected — will dismiss and retry' };
  }

  return { navigated: true };
}

// R2-E: isSystemDialog — structural check first, keyword fallback
function isSystemDialog(snapshot: { uiTree: unknown }): boolean {
  const uiTree = snapshot.uiTree as any;
  // Structural check (primary): look for alert/modal role
  const hasAlertRole = uiTree.elements?.some((el: any) =>
    el.accessibilityRole === 'alert'
    || el.accessibilityRole === 'SystemAlert'
    || el.elementType === 'Alert'
    || el.elementType === 'Sheet'
  );
  if (hasAlertRole) return true;

  // Keyword fallback (raised from 2 to 3 to reduce false positives)
  const texts = uiTree.elements?.map((el: any) => el.label || '').join(' ') || '';
  const dialogKeywords = ['Would Like to Send', 'Allow', "Don't Allow", 'Update Available', 'Not Now', 'Sign in to iCloud'];
  const matched = dialogKeywords.filter(kw => texts.includes(kw));
  return matched.length >= 3;
}

async function handleSystemDialog(mcp: McpToolInterface) {
  // Dismiss system dialog — tap "Allow" / "OK" / "Not Now" / etc.
  // Implementation depends on actual dialog structure from 25-00 spike
}

async function isOnExpectedPage(frame: Frame, snapshotter: ReturnType<typeof createSnapshotter>): Promise<boolean> {
  const inspectResult = await snapshotter.mcp.inspectUi();
  if (inspectResult.status !== 'success') return false;
  const uiTree = unwrapResult(inspectResult) as unknown as { elements?: any[] };
  const currentScreenId = hashVisibleTexts(uiTree);  // same logic as generateScreenId
  return currentScreenId === (frame.state as any).screenId;
}

function hasTimedOut(timeoutMs: number, startTime: number): boolean {
  return Date.now() - startTime >= timeoutMs;
}

function handleFailure(err: Error, strategy: ExplorerConfig['failureStrategy'], retries: number): 'abort' | 'retry' | 'skip' | 'handoff' {
  switch (strategy) {
    case 'retry-3':
      if (retries < 3) return 'retry';
      return 'skip';
    case 'skip':
      return 'skip';
    case 'handoff':
      return 'handoff';
  }
}
```

### 7.2 Tests

- [ ] Engine explores at least 1 page without errors
- [ ] Dedup prevents re-visiting same page
- [ ] Circuit breaker triggers after 5 failures (mock)
- [ ] Backtracking is called after visiting child pages
- [ ] `handleFailure` returns correct action for each strategy
- [ ] `FailureLog.record` and `getEntries` work correctly

---

## Step 8: Report Entry Point Stub (`src/report.ts`)

### 8.1 Stub `generateReport()`

```typescript
// packages/explorer/src/report.ts — stub for 25-01, real implementation in 25-02
import { PageEntry, FailureEntry, ExplorerConfig } from './types';

export async function generateReport(
  pages: PageEntry[],
  failures: FailureEntry[],
  config: ExplorerConfig,
  opts: { partial: boolean; abortReason?: string; durationMs: number }
): Promise<void> {
  // TODO: full implementation in 25-02
  // For now, write a minimal summary so 25-04 can proceed
  console.log(`[REPORT] partial=${opts.partial}, pages=${pages.length}, failures=${failures.length}, duration=${opts.durationMs}ms`);
  if (opts.abortReason) {
    console.log(`[REPORT] aborted: ${opts.abortReason}`);
  }
}
```

---

## Step 9: Test Fixtures from 25-00

### 9.1 Copy spike data into test fixtures

```bash
mkdir -p packages/explorer/tests/fixtures

# Copy from 25-00 spike output
cp docs/spike/inspect-ui-sample.json packages/explorer/tests/fixtures/settings-home.json
cp docs/spike/toggle-cell-example.json packages/explorer/tests/fixtures/settings-toggle.json
```

### 9.2 Create test fixture types

```typescript
// packages/explorer/tests/fixtures/types.ts
export interface FixtureData {
  name: string;
  description: string;
  source: string; // e.g., "iOS 17.4 Settings home screen"
  data: any; // raw inspect_ui output
}
```

### 9.3 Create fixture loader

```typescript
// packages/explorer/tests/fixtures/loader.ts
import { readFileSync } from 'fs';
import { join } from 'path';

export function loadFixture(name: string): any {
  const path = join(__dirname, 'fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}
```

### 9.4 Update existing tests to use fixtures

```typescript
// Example: tests/elements.test.ts
import { loadFixture } from '../tests/fixtures/loader';
import { findClickableElements, isToggle } from '../src/elements';

const settingsHome = loadFixture('settings-home');
const settingsToggle = loadFixture('settings-toggle');

test('findClickableElements filters out toggles', () => {
  const elements = findClickableElements(settingsToggle.data);
  expect(elements).not.toContainEqual(expect.objectContaining({ label: 'Cellular Data' }));
});
```

### 9.5 Deliverables

- [ ] `packages/explorer/tests/fixtures/settings-home.json`
- [ ] `packages/explorer/tests/fixtures/settings-toggle.json`
- [ ] `packages/explorer/tests/fixtures/loader.ts`
- [ ] At least 2 tests use fixture data instead of inline mocks

---

## Acceptance Criteria

- [ ] `packages/explorer/` compiles without errors
- [ ] All unit tests pass
- [ ] Engine can run on iOS Settings simulator for ≥5 pages without crashing
- [ ] `isToggle` correctly excludes toggle cells (validated against 25-00 data)
- [ ] L3 dedup with pixelmatch works on two different screenshots
- [ ] Circuit breaker prevents infinite loops (mock test)
- [ ] Element classification rules match 25-00 spike findings
- [ ] **All MCP calls go through `McpToolInterface` returning `ToolResult<TData>` (R5-A)**
- [ ] **`tapAndWait` does NOT return `nextState` — engine captures snapshot after tap (R5-B)**
- [ ] **`Frame` type includes `elementIndex` + `elements` (R3-A, R3-D)**
- [ ] **`ExplorerConfig` includes `destructiveActionPolicy` (R3-C)**
- [ ] **No `@noble/hashes` dependency — uses Node `crypto.createHash` (R3-D)**

---

## Dependencies on 25-00 Spike Results

| Spec Element | 25-00 Input | Action if Different |
|-------------|------------|-------------------|
| `INTERACTIVE_TYPES` set | Actual elementType values | Update set |
| `TOGGLE_TYPES` set | How toggles appear in hierarchy | Update detection logic |
| `buildSelector` priority | Whether accessibilityId is available | Adjust priority order |
| `extractScreenTitle` | Nav bar title element type | Implement proper detection |
| `collectVisibleTexts` | How text is structured in UI tree | Update text collection |
| pixelmatch threshold | Whether 0.05 works on Settings screenshots | Adjust threshold |
