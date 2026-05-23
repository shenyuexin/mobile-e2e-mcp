# Explorer Tree 可读性优化方案 v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 Explorer 遍历报告（tree.txt）中页面节点的可读命名，让 hash 值、alias 节点、外部 app 页面和 ruleFamily 都显示为人类可理解的文本。

**Architecture:** 主要改动集中在 report 渲染层（`ascii.ts:formatPageLabel`），通过增强 label 生成逻辑实现可读性提升；仅在 engine 层补全外部链接的 metadata 标记（不扩类型表面）。

**Tech Stack:** TypeScript, pnpm monorepo (`packages/explorer`)

---

## 背景与问题定义

当前 iOS Explorer 已能遍历 172 个页面，但 `tree.txt` 中存在以下可读性问题：

1. **Hash 值作为页面名**：`e3b0c44298fc1c14`（空内容的 SHA256 前16位）完全不可读
2. **Alias 节点命名冗余**：`e3b0c44298fc1c14:alias:128` 既保留了不可读的 hash，又暴露了内部序号
3. **外部 App 未正确标记**：`6b9933e86c301931` 实际是 Safari 页面，但没显示 `[External App]` 或 bundle ID
4. **ruleFamily 显示不友好**：`dedup_alias`、`foreign_app_boundary` 等是代码内部标识符

### 预期效果（After）

```
Before:
├── e3b0c44298fc1c14:alias:128  [reached, not expanded: dedup_alias]
├── 6b9933e86c301931

After:
├── [Already Visited]  [reached, not expanded: Already Visited]
├── Safari (com.apple.mobilesafari)  [External App]
```

---

## 文件改动总览

| 文件 | 动作 | 职责 |
|------|------|------|
| `packages/explorer/src/report/ascii.ts` | 修改 | 核心：`formatPageLabel` 增加可读名生成、ruleFamily 映射、alias 识别、external app 显示 |
| `packages/explorer/src/engine.ts` | 修改 | external link 路径：补全 `ruleFamily` / `explorationStatus`（仅当确认 `isExternalApp === true`） |
| `packages/explorer/tests/report/ascii.test.ts` | 修改 | 新增 fixtures：hash-only page、alias page、external app、unknown ruleFamily |

---

## Task 1: 改进 formatPageLabel — 核心可读性逻辑

**Files:**
- Modify: `packages/explorer/src/report/ascii.ts`

**分析：**
- `formatPageLabel` 是 tree 渲染时生成每行标签的唯一集中点
- 需要增强：
  1. **Alias 识别**：通过 `ruleFamily === "dedup_alias"` 或 screenId 含 `:alias:` 识别 alias 节点
  2. **Hash 降级命名**：当 `screenTitle` 为空且 `screenId` 是 hash 时，生成可读名
  3. **External App 显示**：独立处理，追加 bundle ID，不依赖 hash fallback
  4. **ruleFamily 映射**：代码标识符 → 人类可读文本
  5. **兜底去重**：多个 hash 页面用短 hash 区分，避免 `[Unnamed Page]` 重复

**关键设计决策（优先级从高到低）：**

| 优先级 | 条件 | 显示策略 |
|--------|------|---------|
| 1 | `ruleFamily === "dedup_alias"` | `[Already Visited]`（不暴露原页面名，避免 tree 中跨分支引用混乱） |
| 2 | `snapshot.isExternalApp === true` | `{screenTitle \|\| appIdShort} ({appId})` |
| 3 | `screenTitle` 非空 | 直接使用 `screenTitle` |
| 4 | `screenId` 不是 hash | 直接使用 `screenId` |
| 5 | `snapshot.appId` 存在且非目标 app | `{appIdShort} ({appId})` |
| 6 | `pageContext?.type` 存在 | `[{pageContext.type}]` |
| 7 | 兜底 | `[Unnamed Page: {shortHash}]`（保留前8位 hash 用于区分） |

- [ ] **Step 1: 在 `formatPageLabel` 上方添加辅助函数**

在 `ascii.ts` 中，于 `formatPageLabel` 函数定义之前添加：

```typescript
/** Detect whether a value looks like a 16-char hex hash. */
function isHashLike(value: string | undefined): boolean {
  if (!value) return false;
  return /^[a-f0-9]{16}$/i.test(value);
}

/** Extract short hash (first 8 chars) for disambiguation. */
function shortHash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 8);
}

/** Map internal ruleFamily identifiers to human-readable labels. */
function displayNameForRuleFamily(ruleFamily: string | undefined): string | undefined {
  if (!ruleFamily) return undefined;
  const map: Record<string, string> = {
    dedup_alias: 'Already Visited',
    foreign_app_boundary: 'External App',
    stateful_form_entry: 'Form Entry',
    owner_package_gate: 'Blocked Package',
    heuristic_low_value_content: 'Low-Value Content',
    page_context_gate: 'Gated Page',
  };
  return map[ruleFamily] ?? ruleFamily;
}
```

- [ ] **Step 2: 重写 `formatPageLabel` 函数**

将现有 `formatPageLabel` 替换为：

```typescript
function formatPageLabel(
  page: PageEntry,
  samplingDetail?: SamplingPageDetail,
): string {
  // Determine the base display title
  let title: string;

  // Priority 1: alias node — always show "Already Visited", regardless of screenTitle
  if (page.ruleFamily === 'dedup_alias' || page.screenId?.includes(':alias:')) {
    title = '[Already Visited]';
  } else if (page.snapshot?.isExternalApp && page.snapshot?.appId) {
    // Priority 2: external app — show appId alongside title
    const appId = page.snapshot.appId;
    const appIdShort = appId.split('.').pop() || appId;
    const displayTitle = page.screenTitle || appIdShort;
    title = `${displayTitle} (${appId})`;
  } else if (page.screenTitle) {
    // Priority 3: normal page with human-readable title
    title = page.screenTitle;
  } else if (page.screenId && !isHashLike(page.screenId)) {
    // Priority 4: screenId itself is human-readable
    title = page.screenId;
  } else if (
    page.snapshot?.appId &&
    page.snapshot.appId !== '(target-app)' &&
    !page.snapshot.appId.startsWith('external:')
  ) {
    // Priority 5: non-target app without isExternalApp flag
    // Guard against fake fallback appIds like "external:SomeLabel"
    const appId = page.snapshot.appId;
    const appIdShort = appId.split('.').pop() || appId;
    title = `${appIdShort} (${appId})`;
  } else if (page.pageContext?.type) {
    // Priority 6: page context type available
    title = `[${page.pageContext.type}]`;
  } else {
    // Priority 7: fallback — use short hash for disambiguation
    const hash = shortHash(page.screenId);
    title = hash ? `[Unnamed Page: ${hash}]` : '[Unnamed Page]';
  }

  let base = page.viaElement ? `${title}  [via: ${page.viaElement}]` : title;

  // Append [reached, not expanded] with friendly ruleFamily name
  if (page.explorationStatus === 'reached-not-expanded' && page.ruleFamily) {
    const friendlyFamily = displayNameForRuleFamily(page.ruleFamily);
    base = `${base}  [reached, not expanded: ${friendlyFamily}]`;
  }

  // Append external app indicator (only if not already part of title)
  if (page.snapshot?.isExternalApp && !title.includes('External')) {
    base = `${base}  [External App]`;
  }

  // Append sampling info
  if (samplingDetail && samplingDetail.totalChildren > 0) {
    base = `${base}  [sampling: ${samplingDetail.exploredChildren}/${samplingDetail.totalChildren}]`;
  }

  return base;
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm --filter @mobile-e2e-mcp/explorer typecheck`
Expected: PASS

---

## Task 2: Engine 层 — 修复 External Link 未标记 foreign_app_boundary

**Files:**
- Modify: `packages/explorer/src/engine.ts`

**分析：**
- 在 `engine.ts` 的 `isExternalLink` 处理路径（约第 967-1060 行），当检测到外部链接后：
  - 如果 `isAppSwitched` 为 true，则 `nextStateSnapshot.isExternalApp = true`
  - 但此时 `ruleFamily` / `explorationStatus` 未被设置，导致 tree 中只显示 hash
- **Reviewer 反馈**：不能无条件设置 `foreign_app_boundary`，因为存在 "external link 但未切 app" 的路径
- **修正**：只在 `isExternalApp === true` 时才设置 metadata

- [ ] **Step 1: 定位 external link 处理代码**

在 `engine.ts` 中找到以下代码块（约第 1020-1035 行）：

```typescript
                // Mark as external app if we're not in target app
                const isExternalApp =
                  nextStateSnapshot.appId !== undefined &&
                  nextStateSnapshot.appId !== targetAppId;
                nextStateSnapshot.isExternalApp = isExternalApp;
                nextStateSnapshot.appId =
                  nextStateSnapshot.appId ?? `external:${element.label}`;

                console.log(
                  `[EXTERNAL-LINK] External link detected. Returning immediately...`,
                );

                // Record this external link visit in the report
                visited.register({ alreadyVisited: false }, nextStateSnapshot, [
                  ...frame.path,
                  element.label,
                ]);
```

- [ ] **Step 2: 修改标记逻辑**

在上述代码块中，在 `visited.register` 调用之前，增加条件标记：

```typescript
                // Mark as external app if we're not in target app
                const isExternalApp =
                  nextStateSnapshot.appId !== undefined &&
                  nextStateSnapshot.appId !== targetAppId;
                nextStateSnapshot.isExternalApp = isExternalApp;
                nextStateSnapshot.appId =
                  nextStateSnapshot.appId ?? `external:${element.label}`;

                // Only mark metadata when we actually switched to an external app
                if (isExternalApp) {
                  nextStateSnapshot.explorationStatus = 'reached-not-expanded';
                  nextStateSnapshot.stoppedByPolicy = 'externalLinkPolicy:skip';
                  nextStateSnapshot.ruleFamily = 'foreign_app_boundary';
                  nextStateSnapshot.recoveryMethod = 'launch-app-return';
                }

                console.log(
                  `[EXTERNAL-LINK] External link detected. Returning immediately...`,
                );

                // Record this external link visit in the report
                visited.register({ alreadyVisited: false }, nextStateSnapshot, [
                  ...frame.path,
                  element.label,
                ]);
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm --filter @mobile-e2e-mcp/explorer typecheck`
Expected: PASS

---

## Task 3: 补充单元测试

**Files:**
- Modify: `packages/explorer/tests/report/ascii.test.ts`（或新建测试文件）

**分析：**
- 需要验证 `formatPageLabel` 的新行为
- 如果 `ascii.test.ts` 不存在或测试的是 `generateAsciiTree` 整体，则直接在该文件中新增 `formatPageLabel` 的测试
- 如果不方便在现有文件中添加，可新建 `packages/explorer/tests/report/ascii-label.test.ts`

- [ ] **Step 1: 确认现有测试文件位置**

Run:
```bash
find /Users/linan/Documents/mobile-e2e-mcp/packages/explorer/tests -name "*.test.ts" -o -name "*.spec.ts"
```
或
```bash
glob "packages/explorer/tests/**/*.test.ts"
```

- [ ] **Step 2: 编写单元测试**

在合适的测试文件中添加以下测试用例（如果文件不存在则创建）：

```typescript
import { describe, it, expect } from 'vitest';
import type { PageEntry } from '../../src/types.js';

// We need to test formatPageLabel, but it's not exported.
// Two options:
// A) Export it from ascii.ts for testing
// B) Test via generateAsciiTree with controlled fixtures
//
// Option A is preferred for unit-level validation.
```

**测试策略：** `formatPageLabel` 是 `ascii.ts` 的私有函数，不导出。通过 `generateAsciiTree` 的端到端输出验证 label 生成逻辑。在现有 `ascii.test.ts` 中新增测试用例。

在 `ascii.test.ts` 中新增以下测试：

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PageEntry } from '../../src/types.js';
import { generateAsciiTree } from '../../src/report/index.js';

function makePage(
  id: string,
  screenId: string,
  depth: number,
  path: string[],
  arrivedFrom: string | null = null,
  viaElement: string | null = null,
  screenTitle?: string,
  extra?: Partial<PageEntry>,
): PageEntry {
  return {
    id,
    screenId,
    screenTitle: screenTitle || id,
    depth,
    path,
    arrivedFrom,
    viaElement,
    loadTimeMs: 100,
    clickableCount: 1,
    hasFailure: false,
    explorationStatus: 'expanded',
    snapshot: undefined as never,
    ...extra,
  };
}

// ... existing tests ...

describe('generateAsciiTree — readable labels', () => {
  it('shows [Already Visited] for alias pages', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('alias1', 'settings:alias:1', 1, ['General'], 'settings', 'General', 'Settings', {
        ruleFamily: 'dedup_alias',
        explorationStatus: 'reached-not-expanded',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[Already Visited]'), `tree should show [Already Visited], got:\n${tree}`);
    assert.ok(!tree.includes('settings:alias:1'), `tree should not show raw alias screenId, got:\n${tree}`);
  });

  it('shows [Already Visited] for dedup_alias ruleFamily even without alias in screenId', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('alias1', 'settings-screen', 1, ['General'], 'settings', 'General', 'Settings', {
        ruleFamily: 'dedup_alias',
        explorationStatus: 'reached-not-expanded',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[Already Visited]'), `tree should show [Already Visited], got:\n${tree}`);
  });

  it('shows appId for external app with screenTitle', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('safari', 'safari-page', 1, ['Certificate Trust Settings'], 'settings', 'Certificate Trust Settings', 'Safari', {
        snapshot: {
          isExternalApp: true,
          appId: 'com.apple.mobilesafari',
        } as never,
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('Safari (com.apple.mobilesafari)'), `tree should show appId, got:\n${tree}`);
  });

  it('does not expose raw 16-char hash for hash-only screenId', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('hashpage', 'e3b0c44298fc1c14', 1, ['General'], 'settings', 'General', ''),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(!tree.includes('e3b0c44298fc1c14'), `tree should not show raw hash, got:\n${tree}`);
    assert.ok(tree.includes('Unnamed Page'), `tree should show [Unnamed Page], got:\n${tree}`);
  });

  it('disambiguates multiple hash-only pages with short hash', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('hash1', 'e3b0c44298fc1c14', 1, ['A'], 'settings', 'A', ''),
      makePage('hash2', '6b9933e86c301931', 1, ['B'], 'settings', 'B', ''),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('e3b0c442'), `tree should show short hash for first, got:\n${tree}`);
    assert.ok(tree.includes('6b9933e8'), `tree should show short hash for second, got:\n${tree}`);
  });

  it('maps ruleFamily to friendly name in reached-not-expanded suffix', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('form', 'form-page', 1, ['Add Address'], 'settings', 'Add Address', 'Add Address', {
        explorationStatus: 'reached-not-expanded',
        ruleFamily: 'stateful_form_entry',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[reached, not expanded: Form Entry]'), `tree should show friendly ruleFamily, got:\n${tree}`);
  });

  it('preserves original ruleFamily when unknown', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('custom', 'custom-page', 1, ['X'], 'settings', 'X', 'X', {
        explorationStatus: 'reached-not-expanded',
        ruleFamily: 'custom_rule_xyz',
      }),
    ];
    const tree = generateAsciiTree(pages);
    assert.ok(tree.includes('[reached, not expanded: custom_rule_xyz]'), `tree should preserve unknown ruleFamily, got:\n${tree}`);
  });

  it('does not mislabel non-external fallback appId as external app', () => {
    const pages = [
      makePage('root', 'settings', 0, [], null, null, 'Settings'),
      makePage('nonext', 'some-page', 1, ['Link'], 'settings', 'Link', '', {
        snapshot: {
          appId: 'external:SomeLabel',
        } as never,
      }),
    ];
    const tree = generateAsciiTree(pages);
    // Should NOT show "external:SomeLabel" as a displayed app name
    assert.ok(!tree.includes('external:SomeLabel'), `tree should not show fake external appId, got:\n${tree}`);
  });
});
```

- [ ] **Step 3: 运行新增测试**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm --filter @mobile-e2e-mcp/explorer test`
Expected: PASS（如果现有测试因输出格式变化而失败，同步更新预期输出）

---

## Task 4: 端到端验证

**Files:**
- 无文件改动，纯验证

- [ ] **Step 1: 全量类型检查**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm typecheck`
Expected: PASS

- [ ] **Step 2: 全量构建**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm build`
Expected: PASS

- [ ] **Step 3: 运行 explorer 相关测试**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm --filter @mobile-e2e-mcp/explorer test`
Expected: PASS

- [ ] **Step 4: 运行全量测试**

Run: `cd /Users/linan/Documents/mobile-e2e-mcp && pnpm test:ci`
Expected: PASS

---

## 风险与回滚

| 风险 | 缓解措施 |
|------|---------|
| `formatPageLabel` 改动影响现有测试的断言文本 | 运行全部 explorer 测试，更新预期输出 |
| 外部 app 的 `appId.split('.').pop()` 生成短名不够友好 | 不影响功能，仅影响显示；可后续维护 appId → 显示名映射表 |
| 多个 `[Unnamed Page: {shortHash}]` 仍可能不够直观 | 比原 hash 已大幅改善；如有需要可后续从 screenshot/pageContext 推断更多语义 |
| engine external-link 标记增加条件判断 | 仅影响 `isExternalApp === true` 的情况，不影响正常 in-app 流转 |

**回滚策略：**
- **Report 层问题**：单独回滚 `ascii.ts` 的改动（`formatPageLabel` 恢复旧实现），不影响遍历逻辑
- **Engine metadata 问题**：如果外部链接误标记导致行为异常，回滚 `engine.ts` 中新增的 `if (isExternalApp)` 条件标记块
- 两层可独立回滚，互不影响

---

## 附录：RuleFamily 映射表（当前）

| 代码值 | 显示值 | 触发场景 |
|--------|--------|---------|
| `dedup_alias` | `Already Visited` | 同一页面从不同路径重复访问 |
| `foreign_app_boundary` | `External App` | 跳转到外部 app（Safari、设置等） |
| `stateful_form_entry` | `Form Entry` | 表单填写页面（地址、支付等） |
| `owner_package_gate` | `Blocked Package` | ownerPackage 匹配 blockedOwnerPackages |
| `heuristic_low_value_content` | `Low-Value Content` | UI tree 启发式判断的低价值深度页面 |
| `page_context_gate` | `Gated Page` | pageContext 路由决定不展开 |

---

## 附录：命名降级策略

`formatPageLabel` 的标题生成优先级（从高到低）：

| 优先级 | 条件 | 输出示例 |
|--------|------|---------|
| 1 | `ruleFamily === "dedup_alias"` 或 `screenId` 含 `:alias:` | `[Already Visited]`（继续走公共后缀，可附加 `[reached, not expanded]`） |
| 2 | `snapshot.isExternalApp === true` | `Safari (com.apple.mobilesafari)` |
| 3 | `screenTitle` 非空 | `About` |
| 4 | `screenId` 不是 hash | `General` |
| 5 | `snapshot.appId` 存在且非目标 app、非 `external:` 前缀 | `mobilesafari (com.apple.mobilesafari)` |
| 6 | `pageContext?.type` 存在 | `[system]` |
| 7 | 兜底 | `[Unnamed Page: e3b0c442]` |

---

## Changelog from v1

基于 v1 review 反馈的修订：

1. **删除了 Task 1（类型扩展）和 Task 4（Registry 透传）**：YAGNI — alias 可通过 `ruleFamily === "dedup_alias"` 和 `screenId` 中的 `:alias:` 模式识别，无需跨层新增字段
2. **重写了 `formatPageLabel` 优先级**：alias 检测优先于 `screenTitle`，确保 alias 节点始终显示 `[Already Visited]`
3. **External app 显示独立化**：不再只在 hash+无标题时处理，而是作为独立优先级（Priority 2）
4. **修正 external link 标记**：只在 `isExternalApp === true` 时才设置 `foreign_app_boundary`，避免误报
5. **修正 pnpm 命令**：`pnpm --filter @mobile-e2e-mcp/explorer typecheck/test`
6. **兜底命名去重**：`[Unnamed Page: {shortHash}]` 避免多个未命名页面不可区分
7. **删除 `hierarchy.ts` 修改**：未证明必要性
8. **增加单元测试任务**：用 fixture 覆盖 hash、alias、external app、unknown ruleFamily
9. **更新回滚策略**：区分 report-only rollback 和 engine metadata rollback

---

## Changelog from v2 (post-review fixes)

基于 v2 review 反馈的局部修正：

1. **Alias 分支不设 early return**：改为 `title = '[Already Visited]'` 后继续走公共后缀逻辑，确保 `[reached, not expanded]` 和 sampling 后缀正常附加
2. **统一 external app 后缀为 `[External App]`**：消除文档/代码/测试中的措辞不一致
3. **Priority 5 排除 fake appId**：增加 `!page.snapshot.appId.startsWith('external:')` guard，防止 `external:${element.label}` fallback 被误显示
4. **测试改用现有框架**：使用 `node:test` + `assert`（匹配现有 `ascii.test.ts`），通过 `generateAsciiTree` 端到端测试，不导出 `formatPageLabel`
5. **新增 non-external fallback 测试**：验证 fake `external:SomeLabel` appId 不会被显示

---

*Plan version: 3.0*
*Date: 2026-05-04*
