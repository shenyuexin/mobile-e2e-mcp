# Phase 24 Implementation Checklist

**Date:** 2026-04-11
**Source:** 24-DESIGN.md (revised after design review)
**Status:** Ready for implementation after contract clarification

---

## P24-A: wait_for_ui_stable（核心交付，优先级最高）

### Contracts 层
- [ ] `packages/contracts/src/types.ts`
  - 新增 `WaitForUiStableInput` 接口
  - 新增 `WaitForUiStableData` 接口
  - **注意：** 这些类型只被 wait_for_ui_stable 工具使用，不影响 StateSummary 或其他工具的 contract

- [ ] `packages/contracts/src/tool-contracts.ts`（如适用）
  - 如果 MCP server 需要 tool contract 定义，在此添加

- [ ] `packages/contracts/src/reason-codes.ts`
  - 新增 `stabilityTimeout: "STABLE_TIMEOUT"`（如尚未存在）
  - **注意：** 不要修改已有的 reason codes

- [ ] `packages/contracts/src/action-types.ts`（如适用）
  - 新增 `waitForUiStable: "wait_for_ui_stable"`（如需要）

### Adapter 层
- [ ] `packages/adapter-maestro/src/ui-stability.ts`（新文件）
  - 实现 `hashUiTree(snapshot)` 函数
  - 实现 `waitForUiStableWithMaestro(input)` 函数
  - 实现 `flattenNodes(snapshot)` 辅助函数
  - **注意：** hashUiTree 只被本文件使用；如果需要被 session-state.ts 复用，应通过显式 import 而非全局暴露

- [ ] `packages/adapter-maestro/src/ui-tools.ts`
  - 导出 `waitForUiStableWithMaestro`

- [ ] `packages/adapter-maestro/src/index.ts`
  - 导出 `waitForUiStableWithMaestro` 为公共 API

### MCP Server 层
- [ ] `packages/mcp-server/src/server.ts`
  - TOOL_CONTRACTS 中新增 `wait_for_ui_stable` 合约

- [ ] `packages/mcp-server/src/index.ts`
  - 新增 TOOL_NAMES 枚举（如使用枚举定义工具名）
  - 注册 `wait_for_ui_stable` 工具到 tool registry
  - 映射到 adapter 的 `waitForUiStableWithMaestro`

### Capability / Docs 层
- [ ] `packages/adapter-maestro/src/capability-model.ts`
  - 在 capability profile 中标记 `wait_for_ui_stable` 的支持级别（full/partial/none）

- [ ] `README.md` / `docs/engineering/`（如适用）
  - 更新 tool catalog，添加 `wait_for_ui_stable` 条目

- [ ] `docs/guides/ui-stabilization-timing.md`
  - 添加 `wait_for_ui_stable` 的使用说明
  - 更新现有 stabilize(ms) 示例，推荐使用 wait_for_ui_stable

### Probe 脚本迁移
- [ ] `scripts/dev/ios-simulator-tool-probe.ts`
  - 替换所有 `await stabilize(ms)` 为 `await invoke("wait_for_ui_stable", ...)`
  - **注意：** 只替换影响页面转场的 stabilize，不影响 tryTextSelector 中的 500ms 尝试间隔

- [ ] `scripts/dev/ios-tool-probe.ts`
  - 同上

- [ ] `scripts/dev/android-tool-probe.ts`
  - 同上（如果 Android 也需要）

### Tests
- [ ] `packages/adapter-maestro/src/__tests__/ui-stability.test.ts`（新文件）
  - 测试 hashUiTree 对相同输入产生相同 hash
  - 测试 hashUiTree 对不同输入产生不同 hash
  - 测试 waitForUiStable 在稳定页面上快速返回
  - 测试 waitForUiStable 在动态页面上返回 STABLE_TIMEOUT

---

## P24-B: StateSummary pageIdentity 增强

### ⚠️ 前置约束（必须先明确）
1. **pageIdentity.stableFingerprint 来源**
   - 它是单次 snapshot 的 fingerprint（来自 inspectUi 的 sampleNodes hash）
   - 不是 wait_for_ui_stable 的 poll 产物（那个是 temporal stable）
   - **这两个 fingerprint 语义不同，不能混用字段**

2. **pageIdentity 是附加信号**
   - 不会默认改变 `screenId`、`screenTitle`、`stateChanged` 的计算
   - 不会改变 `action-orchestrator.ts` 的 JSON 比较逻辑
   - 不会改变 `recovery-tools.ts` 的 replay/drift 逻辑
   - **除非你同步引入新的 comparison helper（明确排除 pageIdentity 的比较）**

### Contracts 层
- [ ] `packages/contracts/src/types.ts`
  - 新增 `PageIdentity` 接口（可选字段，不影响现有 StateSummary 的必需字段）
  - 增强 `StateSummary` 接口，添加 `pageIdentity?: PageIdentity`（可选，向后兼容）
  - **关键：** pageIdentity 必须是 optional (`?`)，这样现有比较逻辑如果不主动检查它，就不会受影响

```typescript
interface PageIdentity {
  // 通用信号（所有 App 有效）
  treeHash?: string;             // 单次 snapshot 的 UI tree hash（不是 stable poll 产物）
  visibleElementCount?: number;  // 可见元素数量
  hasBackAffordance?: boolean;   // 是否有返回手势

  // 语义信号（标准 App 更有效）
  primaryHeading?: string;       // 页面标题 Heading
  backAffordanceLabel?: string;  // 返回按钮文本
  identitySource?: "heading" | "tree-heuristic" | "unknown";
  identityConfidence?: number;   // 0.0 - 1.0
  isTopLevel?: boolean;          // 是否顶级页面
}
```

### Adapter 层
- [ ] `packages/adapter-maestro/src/session-state.ts`
  - 新增 `derivePageIdentity(nodes: InspectUiNode[]): PageIdentity` 函数
  - 在 `buildStateSummaryFromSignals()` 中调用 derivePageIdentity，附加到返回结果
  - **关键：** derivePageIdentity 只从 `params.uiSummary?.sampleNodes` 推导，不依赖 wait_for_ui_stable
  - **关键：** treeHash 是单次 snapshot hash，不是 wait_for_ui_stable 的 stableFingerprint

- [ ] `packages/adapter-maestro/src/ui-stability.ts`（复用 hash 逻辑）
  - 如果 session-state.ts 需要 hashUiTree，显式 import：`import { hashUiTree } from './ui-stability.js';`
  - 或者：如果不想耦合，session-state.ts 可以有自己的简化版 hash 函数

### 影响审计（必须检查）
- [ ] `packages/adapter-maestro/src/action-orchestrator.ts`
  - **检查：** perform_action_with_evidence 是否直接比较整个 StateSummary JSON
  - **如果是：** 确认 pageIdentity 作为 optional 字段不会意外触发 stateChanged=true
  - **如果需要修复：** 引入 StateSummary 比较 helper，明确排除 pageIdentity 字段

- [ ] `packages/adapter-maestro/src/recovery-tools.ts`
  - **检查：** replay_last_stable_path / recover_to_known_state 是否比较 StateSummary
  - **如果是：** 确认不受 pageIdentity 影响

- [ ] `packages/adapter-maestro/src/interruption-tools.ts`
  - **检查：** interruption drift detection 是否比较 StateSummary
  - **如果是：** 确认不受 pageIdentity 影响

- [ ] `packages/core/src/`（如适用）
  - **检查：** checkpoint comparison / action record comparison 是否受影响

### Tests
- [ ] `packages/adapter-maestro/src/__tests__/session-state-page-identity.test.ts`（新文件）
  - 测试 derivePageIdentity 对 Settings 页面返回合理结果
  - 测试 derivePageIdentity 对无 Heading 页面返回降级结果（treeHash 仍可用）
  - 测试 pageIdentity 为 optional，不影响 StateSummary 的 JSON 序列化/反序列化

---

## P24-C: navigate_back post-back verification 增强

### Contracts 层
- [ ] `packages/contracts/src/types.ts`
  - 增强 `NavigateBackInput`（添加可选字段）：
    - `postBackWaitForStable?: boolean`（默认 true）
    - `verificationTimeoutMs?: number`（默认 5000）
  - 增强 `NavigateBackData`（添加可选字段）：
    - `postBackVerified?: boolean`
    - `postBackStableAfterMs?: number`
    - `alreadyAtTopLevel?: boolean`（**注意：** 这个字段只表示"回退没有改变页面"，不表示"一定在顶级页面"）
  - **关键：** 所有新增字段都是 optional，向后兼容

### Adapter 层
- [ ] `packages/adapter-maestro/src/ui-action-tools.ts`
  - 修改 `navigateBackWithMaestroTool`：
    1. 记录返回前 UI tree hash（调用 hashUiTree 或等价函数）
    2. 执行现有返回逻辑（navigateBackRaw）
    3. 如果 `postBackWaitForStable !== false`：
       - 调用 wait_for_ui_stable
       - 比较前后 hash
       - 填充 postBackVerified / postBackStableAfterMs / alreadyAtTopLevel
  - **关键：** alreadyAtTopLevel 的判断是 `postBackHash === preBackHash`，表示回退没有改变页面
  - **关键：** 不要假设"没变化 = 在顶级页面"；在某些 App 中可能是返回按钮无效
  - **改进方案：** 返回 `postBackScreenSummary?: StateSummary`，让上层自己做判断，而不是返回 alreadyAtTopLevel 这种可能误导的布尔值

### 影响审计
- [ ] `packages/adapter-maestro/src/ui-action-tools.ts` 的其他工具
  - 确认新增字段不影响其他 navigate_back 调用者

### Tests
- [ ] `packages/adapter-maestro/src/__tests__/navigate-back-post-verification.test.ts`（新文件）
  - 测试 navigate_back 在子页面返回后 postBackVerified=true
  - 测试 navigate_back 在顶级页面 alreadyAtTopLevel=true
  - 测试 postBackWaitForStable=false 跳过稳定性检查

---

## 文档层

- [ ] `docs/guides/ui-stabilization-timing.md`
  - 添加 wait_for_ui_stable 的使用章节
  - 更新 stabilize(ms) 示例，推荐 wait_for_ui_stable

- [ ] `README.md`（如适用）
  - 更新 tool catalog 表格

- [ ] `.planning/phases/24-ui-stability-and-page-state/`
  - 更新 IMPLEMENTATION-DETAILS.md（如果需要）
  - 添加 IMPLEMENTATION-LOG.md（记录实现决策）

---

## 不需要的修改（明确排除）

以下文件/组件 **不应** 在 Phase 24 中修改：

| 文件/组件 | 为什么不改 |
|----------|-----------|
| `action-orchestrator.ts` 核心逻辑 | 自动稳定包装器是 future slice |
| `assert_on_page` / `ensure_page_identity` | 降级为 future candidate |
| 任何现有 reason code 的语义 | 只新增，不修改 |
| 任何现有 state comparison 逻辑 | pageIdentity 是 optional，不影响 |
| `get_session_state` 的返回结构 | 只增加 pageIdentity 字段，不改变已有字段 |
| `recover_to_known_state` / `replay_last_stable_path` | 它们会自动受益于增强的 StateSummary，不需要修改 |

---

## 实施顺序（必须遵守）

1. **P24-A 先做**（wait_for_ui_stable）
   - 最小闭环，不影响现有逻辑
   - 可以在不改 StateSummary 的情况下独立验证

2. **P24-B 后做**（StateSummary pageIdentity）
   - 依赖 P24-A 的 hashUiTree 函数（或等价实现）
   - 需要完整的影响审计（action-orchestrator / recovery / interruption）

3. **P24-C 最后做**（navigate_back 增强）
   - 依赖 P24-A 的 wait_for_ui_stable
   - 依赖 P24-B 的 pageIdentity（可选，用于 postBackScreenSummary）

4. **Probe 迁移伴随每个 phase**
   - P24-A 完成后立刻迁移 probe 中的 stabilize()
   - P24-B 完成后验证 get_session_state 返回 pageIdentity
   - P24-C 完成后验证 navigate_back 返回 postBackVerified

---

## 风险检查点（实施前必须确认）

- [ ] P24-B 的 pageIdentity 不会影响 stateChanged 判断
  - **验证方式：** 在 action-orchestrator.ts 中运行测试，确保添加 pageIdentity 后 pre/post state comparison 结果不变

- [ ] P24-B 的 pageIdentity 不会影响 replay/drift 逻辑
  - **验证方式：** 运行 replay_last_stable_path 测试

- [ ] P24-B 的 pageIdentity 不会影响 checkpoint comparison
  - **验证方式：** 检查 core 层的 checkpoint 比较逻辑

- [ ] navigate_back 的 alreadyAtTopLevel / postBackVerified 不会误导调用者
  - **验证方式：** 在至少 2 个不同 App（Settings + 第三方 App）上测试
