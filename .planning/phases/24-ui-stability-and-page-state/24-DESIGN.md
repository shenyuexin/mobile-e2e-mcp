# UI 稳定性与页面状态管理 — Phase 24 设计

**Date:** 2026-04-11
**Status:** Revised after design review
**Source:** iOS probe 16 次迭代经验 + 现有代码深度调研 + capability boundary audit

## 0. Review 后的核心变更总结

| 原始设计问题 | 修改方案 |
|------------|---------|
| `get_current_page` 过拟合 Settings (Heading + "Settings" 按钮) | 改用 **UI Tree Hash** 作为通用方案，语义提取作为可选增强 |
| `assert_on_page` 混合断言 + 恢复副作用 | 拆为只读 `check_page_identity` + 有副作用的 `ensure_page_identity`（后者未来再做） |
| `navigate_back` 当作新能力设计 | 改为对**现有** navigate_back 的增量增强（承接 Phase 22） |
| 自动稳定包装器切入底层 UI tool | 改为只从 **orchestration 层**接入，避免双重等待 |
| `wait_for_ui_stable` 只返回 success/partial | 返回结构化结果：`stabilityStatus`, `stableFingerprint`, `polls`, `confidence` |

## 1. 问题定义（未变，确认准确）

### 1.1 动画/转场时序问题
- `tap_element` 后页面跳转动画未完成就执行下一个操作
- `scroll_only` 后惯性滚动未停止就捕获 UI 层级
- 硬编码 `stabilize(ms)` 在不同设备/系统版本下表现不一致

### 1.2 页面状态未知问题
- 不知道当前在哪个页面（首页 vs 子页面）
- `replay_last_stable_path` 改变了页面但后续步骤不知道
- `resume_interrupted_action` 在错误页面上等待不存在的元素 → TIMEOUT

### 1.3 现有能力的缺口

| 现有能力 | 能做什么 | 不能做什么 |
|----------|---------|-----------|
| `wait_for_ui` | 等待**已知目标**可见 | 不知道目标时无法判断 UI 是否稳定 |
| `stabilize(ms)` | 固定等待 | 不同设备/页面耗时不同，无法验证是否真稳定 |
| `get_session_state` | 返回 readiness (ready/loading/blocked) | 无法区分"在哪个页面"，粒度太粗 |
| `navigate_back` (Phase 22) | 执行返回动作 | 返回后不知道是否真的到了预期页面 |

**缺口：** 没有"不知道目标是什么，但需要确认 UI 已经不再变化"的能力。

## 2. 收敛后的 Phase 24 结构

```
Phase 24 主线（3 个 deliverable）:
  P24-A: wait_for_ui_stable（新增工具）          ← 优先级最高，最小闭环
  P24-B: StateSummary page identity 增强         ← 增强现有，不新造 API
  P24-C: navigate_back post-back verification    ← 增量增强现有能力

Future slice（2 个候选，Phase 24 不做）:
  P24-D: ensure_page_identity（有副作用的导航）  ← 等 page identity 模型稳定后
  P24-E: orchestration-layer auto-stabilize      ← 只从 orchestrator 接入，不改底层 tool
```

## 3. P24-A: `wait_for_ui_stable` — 通用 UI 稳定性检测

### 3.1 为什么优先做

- **最小闭环**：纯新增工具，不影响现有逻辑
- **直接替换 stabilize(ms)**：probe 脚本中可以立刻用
- **不依赖 app-specific page model**：对任何 App 有效
- **风险最低**：不碰 orchestration、不碰 navigation、不碰 state summary

### 3.2 核心原理

轮询捕获 UI 层级，连续 N 次 snapshot 一致即认为稳定：

```
t=0ms     t=300ms   t=600ms   t=900ms
 ┌───┐     ┌───┐     ┌───┐     ┌───┐
 │ A │     │ B │     │ C │     │ C │ ← 连续两次一致！
 └───┘     └───┘     └───┘     └───┘
 旧页面    转场中    新页面    新页面（稳定）
 hash≠prev hash≠prev hash=prev ✓ 返回
```

### 3.3 Hash 算法设计

```typescript
function hashUiTree(snapshot: UiSnapshot): string {
  const signatures = flattenNodes(snapshot)
    .filter(n => n.isVisible && n.text)  // 只关心可见、有文本的节点
    .map(n => `${n.type}|${n.text.slice(0, 60)}|${n.bounds}`);
    // 示例: "Button|General|[20,334][410,378]"

  return sha256(signatures.join('\n')).slice(0, 16);
}
```

**设计选择：**

| 选择 | 原因 |
|------|------|
| 只 hash 可见节点 | 屏幕外的节点不影响"当前页面是否稳定" |
| 只取 text 前 60 字符 | 大多数 UI 元素的 label 前 60 字符足以区分 |
| 包含 bounds | 同一元素在不同位置 = 不同状态（如弹窗出现） |
| 包含 type | "Button\|General" 和 "Heading\|General" 是不同的 |

### 3.4 Contract

```typescript
// 新工具: wait_for_ui_stable
interface WaitForUiStableInput {
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  deviceId?: string;
  appId?: string;
  timeoutMs?: number;           // 默认 5000
  intervalMs?: number;          // 默认 300
  consecutiveStable?: number;   // 连续几次一致才算稳定，默认 2
}

interface WaitForUiStableData {
  stable: boolean;
  polls: number;
  stableAfterMs: number;        // 实际等待时间（而非硬编码 timeout）
  stableFingerprint: string;    // 稳定时的 UI tree hash
  lastDiffSignals?: string[];   // 如果不稳定，哪些信号在变化
  confidence: number;           // 0.0 - 1.0
  stabilityBasis: "visible-tree" | "semantic-subset" | "full-structure";
}
```

### 3.5 返回值结构化

```typescript
// 成功
{
  status: "success",
  reasonCode: "OK",
  data: {
    stable: true,
    polls: 3,
    stableAfterMs: 600,         // 实际只等了 600ms
    stableFingerprint: "a1b2c3d4e5f67890",
    confidence: 0.95,
    stabilityBasis: "visible-tree",
  }
}

// 超时（页面一直在变化，如视频播放）
{
  status: "partial",
  reasonCode: "STABLE_TIMEOUT",
  data: {
    stable: false,
    polls: 16,
    stableAfterMs: 5000,
    lastDiffSignals: ["bounds-changed", "text-changed"],
    confidence: 0.2,
    stabilityBasis: "visible-tree",
  }
}
```

### 3.6 为什么 `consecutiveStable: 2`

- iOS/Android 页面转场通常只需要 1 次轮询间隔 (300-500ms) 就能完成
- 2 次一致 = 至少间隔了 1 个 polling period，足以证明动画已结束
- 3+ 在无动画的简单页面上浪费 1-2 次多余轮询

### 3.7 使用方式（Probe 脚本迁移）

```typescript
// 替换前：
await stabilize(2000);  // 硬编码

// 替换后：
await invoke("wait_for_ui_stable", {
  sessionId, platform, runnerProfile, deviceId,
  timeoutMs: 5000, intervalMs: 300, consecutiveStable: 2,
});
// 实际可能只等 600ms 就返回，比固定 2000ms 快 3x
```

### 3.8 文件变更

| 文件 | 变更类型 |
|------|---------|
| `packages/adapter-maestro/src/ui-stability.ts` | 新增 |
| `packages/adapter-maestro/src/ui-tools.ts` | 导出新工具 |
| `packages/adapter-maestro/src/index.ts` | 暴露 MCP 工具 |
| `packages/contracts/src/types.ts` | 新增 WaitForUiStableInput/Data |

### 3.9 准确性分析

| 场景 | 是否准确 | 说明 |
|------|---------|------|
| 页面转场动画进行中 | ✅ 准确 | 动画期间 UI 树持续变化，hash 每次不同 |
| 滚动惯性未停止 | ✅ 准确 | 滚动中节点 bounds 持续变化 |
| 简单页面（无动画） | ✅ 准确 | 第 1、2 次 poll hash 就一致，快速返回 |
| 动态内容（视频播放） | ⚠️ 超时 | 进度条持续变化 → STABLE_TIMEOUT（这是正确的行为） |
| 加载骨架屏 | ⚠️ 可能误判 | 骨架屏动画让 hash 变化，但 timeout 内会稳定 |

### 3.10 局限性（明确声明）

`wait_for_ui_stable` 回答的是 **"UI 不再变化"**，不是 **"我已经到了正确页面"**。

- 一个错误页面也可能非常稳定
- 稳定性检测 ≠ 正确性验证
- 需要和 page identity 配合使用（P24-B）

## 4. P24-B: 增强 StateSummary 的页面身份粒度

### 4.0 前置约束（必须在实现前明确）

**Review 发现的关键耦合问题：**

1. **pageIdentity.stableFingerprint 的来源语义不能混**
   - `wait_for_ui_stable` 返回的 `stableFingerprint` 是 **temporal stable poll 产物**（连续 N 次一致的 hash）
   - `StateSummary.pageIdentity.treeHash` 是 **单次 snapshot 产物**（一次 captureUiHierarchy 的 hash）
   - **这两个语义不同，不能混用字段。** wait_for_ui_stable 的 stableFingerprint 用于判断"UI 不再变化"，pageIdentity.treeHash 用于标识"当前在哪个页面"。

2. **pageIdentity 是附加信号，不会默认改变现有比较逻辑**
   - 当前 `perform_action_with_evidence` 对整个 StateSummary 做 JSON 比较来判断 stateChanged
   - 当前 `replay_last_stable_path` / `recover_to_known_state` / `interruption-drift-detection` 都依赖 StateSummary 比较
   - **如果直接往 StateSummary 加 pageIdentity，可能意外放大 stateChanged、drift、checkpoint 比较**
   - **缓解方案：** pageIdentity 必须是 optional 字段 (`pageIdentity?: PageIdentity`)，这样现有比较逻辑如果不主动检查它，就不会受影响
   - **如果现有比较逻辑是全量 JSON diff：** 需要引入 comparison helper，明确排除 pageIdentity 字段

3. **navigate_back alreadyAtTopLevel 不能只靠 hash 没变来判断**
   - hash 没变可能是返回按钮无效，不一定是"在顶级页面"
   - **缓解方案：** 返回 `postBackScreenSummary?: StateSummary` 而不是 alreadyAtTopLevel 布尔值，让上层自己做判断

4. **文件计划必须完整**
   - 除了 adapter 和 contracts，还要同步修改：
     - `packages/mcp-server/src/server.ts`（TOOL_CONTRACTS）
     - `packages/mcp-server/src/index.ts`（tool registry）
     - `packages/adapter-maestro/src/capability-model.ts`（capability profile）
     - `README.md` / tool catalog（文档）

当前 `get_session_state` 已经在 `session-state.ts` 中返回 `StateSummary`，包含：
- `screenId`
- `screenTitle`
- `readiness`
- `blockingSignals`
- `protectedPage`
- `manualHandoff`

新建独立 API 会导致：
- 新旧 page-state 语义并存
- action-orchestrator / recovery-tools 已经依赖 StateSummary，不会用新 API
- 两套 page identity 系统并行

**正确做法：增强现有 StateSummary。**

### 4.2 增强方案

```typescript
// session-state.ts 中 StateSummary 增强
interface StateSummary {
  // 已有字段
  appPhase: string;
  readiness: string;
  blockingSignals: string[];
  screenId?: string;
  screenTitle?: string;

  // 新增字段（P24-B，必须是 optional，不影响现有比较逻辑）
  pageIdentity?: PageIdentity;
}

interface PageIdentity {
  // 通用信号（所有 App 有效）
  treeHash?: string;             // 单次 snapshot 的 UI tree hash（不是 wait_for_ui_stable 的 stable poll 产物）
  visibleElementCount?: number;  // 可见元素数量
  hasBackAffordance?: boolean;   // 是否有返回手势（按钮或边缘滑动）

  // 语义信号（标准 App 更有效）
  primaryHeading?: string;       // 页面标题 Heading
  backAffordanceLabel?: string;  // 返回按钮文本（如果检测到）
  identitySource?: "heading" | "tree-heuristic" | "unknown";
  identityConfidence?: number;   // 0.0 - 1.0

  // 导航上下文
  isTopLevel?: boolean;          // 是否顶级页面
  probableParentScreenId?: string;  // 可能的父页面标识
}
```

**关键字段说明：**

| 字段 | 来源 | 语义 | 为什么是 optional |
|------|------|------|-----------------|
| `treeHash` | 单次 captureUiHierarchy | 当前页面的 UI 树标识 | 不是 stable poll 产物，只是一次 snapshot 的 hash |
| `primaryHeading` | sampleNodes 中 type=Heading | 页面标题 | 不是所有 App 都有 Heading（如自定义导航栏） |
| `isTopLevel` | !hasBackAffordance | 是否顶级页面 | 基于启发式推断，非绝对准确 |
| `identityConfidence` | 综合信号质量 | 页面身份的可信度 | 0.0-1.0，调用方可据此决定是否依赖语义信号 |

### 4.3 PageIdentity 提取策略

**策略 A: UI Tree Hash（通用，所有 App）**

```typescript
// 每个页面的稳定 UI 树 hash 就是该页面的唯一标识
function derivePageIdentity(nodes: InspectUiNode[]): PageIdentity {
  return {
    treeHash: hashUiTree({ nodes }),
    visibleElementCount: nodes.filter(n => n.isVisible).length,
    hasBackAffordance: detectBackButton(nodes) || detectEdgeSwipeBack(nodes),
    identityConfidence: 0.6,  // hash 本身置信度高，但不提供语义
    identitySource: "tree-heuristic",
    isTopLevel: !detectBackButton(nodes),
  };
}
```

**策略 B: 语义提取（Settings 等标准 App 增强）**

```typescript
// 仅当检测到 Heading + 返回按钮时启用
function enrichWithSemantic(nodes: InspectUiNode[], base: PageIdentity): PageIdentity {
  const headings = nodes.filter(n => n.type === 'Heading' || n.className === 'Heading');
  if (headings.length === 0) return base;

  const backButton = detectBackButton(nodes);

  return {
    ...base,
    primaryHeading: headings[0].text,
    backAffordanceLabel: backButton?.text,
    identitySource: "heading",
    identityConfidence: 0.9,  // Heading + back button = 高置信度
    isTopLevel: !backButton,
    probableParentScreenId: backButton ? "app-main" : undefined,
  };
}
```

### 4.4 影响审计（必须在实现前检查）

**P24-B 可能影响的现有组件：**

| 组件 | 是否比较 StateSummary | 风险 | 缓解方案 |
|------|---------------------|------|---------|
| `action-orchestrator.ts` (perform_action_with_evidence) | ✅ 直接比较 | 高 | pageIdentity 是 optional，默认不参与比较；如需修改，引入 comparison helper |
| `recovery-tools.ts` (replay/recover) | ✅ 可能比较 | 中 | 同上 |
| `interruption-tools.ts` (drift detection) | ✅ 可能比较 | 中 | 同上 |
| `session-state.ts` (persistSessionState) | ✅ 序列化 | 低 | optional 字段不影响 JSON 序列化 |
| `capability-model.ts` | ❌ 不比较 StateSummary | 无 | 不需要修改 |

**缓解方案：**
- pageIdentity 必须是 optional (`?`)，这样现有代码如果不主动检查它，就不会受影响
- 如果现有比较逻辑是全量 JSON diff：引入 comparison helper，明确排除 pageIdentity 字段
- **验证方式：** 在修改 StateSummary 后运行所有现有测试，确保 stateChanged/drift/replay 结果不变

### 4.5 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/contracts/src/types.ts` | 修改 | 新增 PageIdentity 接口，StateSummary 增加 pageIdentity?: PageIdentity |
| `packages/adapter-maestro/src/session-state.ts` | 修改 | buildStateSummaryFromSignals 增加 pageIdentity 推导 |
| `packages/adapter-maestro/src/ui-stability.ts` | 新增（P24-A） | hashUiTree 函数，可被 session-state.ts 复用 |
| `packages/adapter-maestro/src/__tests__/session-state-page-identity.test.ts` | 新增 | 测试 pageIdentity 不影响现有 StateSummary 比较 |

### 4.5 使用示例

```typescript
// 获取增强的页面状态
const state = await invoke("get_session_state", { sessionId });
console.log(state.data.state.pageIdentity.stableFingerprint);  // "a1b2c3d4..."
console.log(state.data.state.pageIdentity.isTopLevel);         // false (在子页面)
console.log(state.data.state.pageIdentity.primaryHeading);     // "General" (如果检测到)
```

## 5. P24-C: 增强 navigate_back 的 post-back verification

### 5.1 现状确认

`navigate_back` 已在 Phase 22 实现：
- Android: deterministic KEYEVENT_BACK
- iOS: selector-based app back（navigate_back with target: 'app'）
- 明确有 iOS system back 不支持的边界

当前实现在 `packages/adapter-maestro/src/ui-action-tools.ts`。

### 5.2 增强方向

**不是新造 goback，而是增强现有 navigate_back：**

```typescript
// navigate_back 输入增强
interface NavigateBackInput {
  // 已有字段
  sessionId: string;
  platform: Platform;
  runnerProfile?: RunnerProfile;
  deviceId?: string;
  target?: "system" | "app";
  selector?: { text?: string; /* ... */ };

  // 新增字段（P24-C）
  postBackWaitForStable?: boolean;    // 返回后是否等待 UI 稳定，默认 true
  verificationTimeoutMs?: number;     // post-back 验证超时，默认 5000
}

// navigate_back 返回增强
interface NavigateBackData {
  // 已有字段
  stateChanged: boolean | "unknown";
  // ...

  // 新增字段（P24-C）
  postBackVerified?: boolean;         // 是否验证了返回后的页面
  postBackStableAfterMs?: number;     // 返回后等待稳定的实际时间
  postBackScreenSummary?: StateSummary;  // 返回后到达的页面状态（让上层自己判断）
}
```

### 5.3 实现伪码

```typescript
async function navigateBack(input): Promise<ToolResult> {
  // 1. 记录返回前的页面状态
  const preBackSummary = await getScreenSummary(input);

  // 2. 执行现有的返回逻辑
  const result = await navigateBackRaw(input);

  if (result.status !== "success") return result;

  // 3. Post-back stabilization（新增）
  if (input.postBackWaitForStable !== false) {
    const stable = await waitForUiStable({
      ...input,
      timeoutMs: input.verificationTimeoutMs ?? 5000,
    });

    const postBackSummary = await getScreenSummary(input);

    return {
      ...result,
      data: {
        ...result.data,
        postBackVerified: stable.status === "success",
        postBackStableAfterMs: stable.data.stableAfterMs,
        postBackScreenSummary: postBackSummary.data.screenSummary,
      }
    };
  }

  return result;
}
```

**关键设计决策：**

| 决策 | 原因 |
|------|------|
| 返回 `postBackScreenSummary` 而不是 `alreadyAtTopLevel` | alreadyAtTopLevel 是误导性布尔值（hash 没变可能是返回按钮无效）；返回完整 summary 让上层自己判断 |
| postBackVerified 基于 wait_for_ui_stable 结果 | 确保返回后 UI 已稳定，而不只是"返回动作执行了" |
| 通过 `postBackWaitForStable: false` 可关闭 | 需要最小延迟的场景可以跳过验证 |

### 5.4 文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `packages/contracts/src/types.ts` | 修改 | NavigateBackInput/Data 增加可选字段 |
| `packages/adapter-maestro/src/ui-action-tools.ts` | 修改 | navigateBackWithMaestroTool 增加 post-back verification |
| `packages/adapter-maestro/src/__tests__/navigate-back-post-verification.test.ts` | 新增 | 测试 post-back verification 逻辑 |

## 6. 未来候选（Phase 24 不做）

### 6.1 P24-D: `ensure_page_identity`

**当前不做的理由：**
- 混合了只读判断 + 恢复副作用，名字和行为不一致
- 会把 assert 和 recovery 绑在一起，更难审计
- 需要等 page identity 模型稳定后再做

**未来如果要做，拆开：**
- `check_page_identity` — 只读，对比当前页面和期望页面
- `ensure_page_identity` — 有副作用，bounded navigation/recovery primitive

### 6.2 P24-E: Orchestration-layer auto-stabilize

**当前不做的理由：**
- `action-orchestrator.ts` 已有 pre/post state sampling / stateChanged / postconditionStatus
- 在底层 UI tool 包装会导致双重等待、语义冲突
- 风险高，影响所有 action

**未来如果要做，只从 orchestration 层接入：**

```typescript
// action-orchestrator.ts 内部增强
async function performActionWithEvidence(input): Promise<ToolResult> {
  // ... existing pre-state sampling ...

  const lowLevelResult = await executeLowLevelAction(input);

  // 新增：post-action stabilize（在判断 stateChanged 之前）
  if (input.postActionWaitForStable) {
    await waitForUiStableBounded(input);  // bounded 版本，timeout 更短
  }

  // ... existing post-state sampling ...
  // ... existing stateChanged / postcondition logic ...
}
```

## 7. 预期效果

### 当前状态 (probe run 16)
```
Total: 23 | Success: 19 | Partial: 1 | Failed: 3
```
- 19 个 success 中 12 个依赖硬编码 `stabilize(ms)`
- 所有 3 个 failed 是预期的（JS debug 无 Metro，故意失败探针）

### P24-A 完成后
- **消除 probe 脚本中的硬编码 stabilize()** — 替换为 `wait_for_ui_stable`
- **等待时间减少 ~60%** — 从固定 2000ms 变为实际 600ms
- **跨设备兼容** — 不再依赖 "等 2 秒就够了" 的假设
- **可观测性提升** — 每次稳定性检测返回 polls/stableAfterMs/confidence

### P24-A + P24-B + P24-C 完成后
- **消除所有页面状态导致的失败** — page identity + post-back verification
- **navigate_back 返回 postBackVerified / alreadyAtTopLevel** — 明确回退结果
- **StateSummary 包含 pageIdentity** — 所有依赖 StateSummary 的组件自动受益

## 8. 验收标准

| # | 标准 | 验证方式 |
|---|------|----------|
| AC1 | `wait_for_ui_stable` 在 iOS 模拟器上能检测页面转场完成 | tap_element 后调用，返回 success，stableAfterMs < 2000 |
| AC2 | `wait_for_ui_stable` 在 Android 上能检测滚动惯性停止 | scroll_only 后调用，返回 success |
| AC3 | `wait_for_ui_stable` 返回结构化结果 | data 包含 stableFingerprint, polls, confidence, stabilityBasis |
| AC4 | 同一页面多次调用 `get_session_state`，pageIdentity.treeHash 一致 | 连续调用 3 次，hash 相同 |
| AC5 | 不同页面调用 `get_session_state`，pageIdentity.treeHash 不同 | tap 进入子页面后，hash 变化 |
| AC6 | **pageIdentity 不影响 stateChanged** | 在 action-orchestrator.ts 中运行测试，添加 pageIdentity 后 pre/post state comparison 结果不变 |
| AC7 | **pageIdentity 不影响 replay/drift** | 运行 replay_last_stable_path 测试 |
| AC8 | `navigate_back` 返回 postBackVerified / postBackScreenSummary | 检查返回 data 字段 |
| AC9 | iOS probe 脚本中 0 处硬编码 stabilize() | 代码搜索 `await stabilize(` 结果为 0 |
| AC10 | iOS probe 成功率不低于 19/23 | 运行 ios-simulator-tool-probe.ts 验证 |
| AC11 | Android probe 成功率不低于之前基线 | 运行 android-tool-probe.ts 验证 |
| AC12 | 非 Settings App 也能检测页面变化（pageIdentity.treeHash 变化） | 在第三方 App 上验证 |

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| UI hash 计算开销大 | 每次轮询都要 serialize + hash 整个树 | 只 hash 可见节点的精简标识（text+type+bounds 前 50 字符）；sha256 只取前 16 位 |
| 某些页面动画极长（如加载骨架屏） | wait_for_ui_stable 超时 | timeout 默认 5000ms，可配置；超时返回 partial 而非 failed |
| `wait_for_ui_stable` 在动态内容页面永远超时 | 视频/直播/游戏页面 | 这是正确的行为；probe 脚本可以对这类页面 skip 或使用更长 timeout |
| Page identity 的 identityConfidence 在第三方 App 中偏低 | screenId/screenTitle 可能为空 | 明确标注 identitySource 和 identityConfidence；UI Tree Hash 始终可用 |
| navigate_back 的 post-back verification 增加延迟 | 每次返回额外等 300-600ms | 可通过 `postBackWaitForStable: false` 关闭；默认开启因为验证价值 > 延迟成本 |

## 10. 实施顺序

### Phase 24A（最先做，最小风险）
1. **`wait_for_ui_stable` 工具**
   - 文件: `packages/adapter-maestro/src/ui-stability.ts`（新）
   - 合约: `@mobile-e2e-mcp/contracts` 新增 `WaitForUiStableInput` / `WaitForUiStableData`
   - 验证: iOS probe + Android probe 替换 stabilize()

### Phase 24B（和 A 并行或紧接着做）
2. **StateSummary pageIdentity 增强**
   - 修改 `packages/contracts/src/types.ts` 增加 `PageIdentity` 接口
   - 修改 `packages/adapter-maestro/src/session-state.ts` 的 `buildStateSummaryFromSignals`
   - 复用 `hashUiTree` 函数

### Phase 24C（最后做，依赖 A+B）
3. **navigate_back post-back verification 增强**
   - 修改 `packages/adapter-maestro/src/ui-action-tools.ts` 的 `navigateBackWithMaestroTool`
   - 增加输入/返回字段

### Probe 迁移（伴随每个 phase）
4. **Probe 脚本迁移**
   - `ios-simulator-tool-probe.ts`：所有 `await stabilize(ms)` → `wait_for_ui_stable`
   - `ios-tool-probe.ts`：同上
   - `android-tool-probe.ts`：同上

## 11. 与现有系统的关系

```
现有:
  wait_for_ui(text="General")        → 等待特定元素可见（知道要找什么）
  stabilize(ms)                      → 硬编码等待（猜时间）
  get_session_state()                → 返回粗粒度 StateSummary

新增 P24-A:
  wait_for_ui_stable()               → 等待 UI 不再变化（不知道要找什么，只知道要稳定）

增强 P24-B:
  StateSummary.pageIdentity          → 更细粒度的页面身份（增强现有，不新造 API）

增强 P24-C:
  navigate_back(postBackWaitForStable) → 返回后验证（增强现有能力）

互补关系:
  tap_element("General")
  → wait_for_ui_stable()             // 等新页面渲染完成
  → get_session_state()              // 读取增强的 pageIdentity
  → if (!pageIdentity.isTopLevel) {  // 确认确实在子页面
      navigate_back(postBackWaitForStable: true)  // 回退并验证
    }
```

## 12. 为什么不采用原设计的某些方案

### 为什么不做独立 `get_current_page` API
- 当前 `get_session_state` 已经在返回 `StateSummary`，包含 `screenId` / `screenTitle`
- 新建独立 API 会导致新旧 page-state 语义并存
- action-orchestrator / recovery-tools 已经依赖 StateSummary，不会用新 API
- **增强现有 > 新造平行系统**

### 为什么不做 `assert_on_page` 工具
- 设计稿里"如果不在首页，自动 goback 直到首页"混合了断言 + 恢复
- 名字和行为不一致（assert 听起来是只读，实际有副作用）
- 当前仓库风格：只读和恢复是分开的（get_session_state vs recover_to_known_state）
- **未来如果要做，拆成 check_page_identity（只读）+ ensure_page_identity（有副作用）**

### 为什么不做自动稳定包装器（包所有 UI tool）
- `action-orchestrator.ts` 已有 pre/post state sampling / stateChanged / postconditionStatus
- 在底层 UI tool 包装会导致双重等待、语义冲突、timeout 不一致
- **未来如果要做，只从 orchestration 层接入，不改底层 tool**

## 13. 实施估算

| 阶段 | 工作量 | 风险 |
|------|--------|------|
| P24-A: wait_for_ui_stable | 1-2 天 | 低（纯新增） |
| P24-B: StateSummary 增强 | 1 天 | 低（增量修改） |
| P24-C: navigate_back 增强 | 0.5-1 天 | 中（修改现有工具） |
| Probe 迁移 | 0.5 天 | 低 |
| 测试验证 | 1 天 | 低 |
| **总计** | **4-5.5 天** | |
