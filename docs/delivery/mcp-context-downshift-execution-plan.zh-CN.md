# MCP 工具层 Context Downshift 继续实施计划（sessionId-only）

## 1. 目标

在已完成 `launch_app/install_app/reset_app_state/terminate_app` 下沉的基础上，继续把“重复上下文参数（platform/deviceId/appId/runnerProfile）”从 MCP 调用面移除，让更多工具支持 **sessionId-only** 或最小参数调用，并保持可审计、可回滚、可验证。

---

## 2. 当前基线（2026-03-16）

已落地：

1. MCP 层（`packages/mcp-server/src/index.ts`）对 4 个生命周期工具启用会话上下文继承；
2. 合同层（`packages/contracts/src/types.ts`）放宽对应输入 `platform` 为可选；
3. 适配器层（`packages/adapter-maestro/src/index.ts`）补齐缺失上下文的结构化失败；
4. 测试层（`packages/mcp-server/test/stdio-server.test.ts`）覆盖正向继承与 missing/closed/mismatch 负向场景；
5. 文档层（`docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`）已同步这 4 个工具简写示例。

### 2.1 Preflight 工具差异矩阵（执行前必须先更新）

> 目的：避免重复改造“已在 MCP 层接近最小调用”的工具。每次进入新 Wave 前，先更新该矩阵并以此裁剪范围。

| 工具 | 当前示例参数（基线） | 目标参数（下沉后） | 剩余代码差异 | 证据来源 |
|---|---|---|---|---|
| launch_app | `{sessionId}` | `{sessionId}` | 已完成（Wave 0） | checklist + stdio test |
| install_app | `{sessionId,artifactPath}` | `{sessionId,artifactPath}` | 已完成（Wave 0） | checklist + stdio test |
| reset_app_state | `{sessionId,strategy}` | `{sessionId,strategy}` | 已完成（Wave 0） | checklist + stdio test |
| terminate_app | `{sessionId}` | `{sessionId}` | 已完成（Wave 0） | checklist + stdio test |
| query_ui | `{sessionId,selector/...}` | `{sessionId,selector/...}` | 待核对（可能仅需补负向测试） | checklist |
| resolve_ui_target | `{sessionId,contentDesc}` | `{sessionId,contentDesc}` | 待核对（可能仅需补一致性校验） | checklist |
| wait_for_ui | `{sessionId,selector,timeoutMs}` | `{sessionId,selector,timeoutMs}` | 待核对 | checklist |
| tap_element | `{sessionId,contentDesc/...}` | `{sessionId,contentDesc/...}` | 待核对 | checklist |
| type_into_element | `{sessionId,selector,text}` | `{sessionId,selector,text}` | 待核对 | checklist |
| scroll_and_resolve_ui_target | `{sessionId,selector}` | `{sessionId,selector}` | 待核对 | checklist |
| scroll_and_tap_element | `{sessionId,selector}` | `{sessionId,selector}` | 待核对 | checklist |

> 执行规则：差异矩阵标记为“已完成”的工具不得重复进入开发范围，除非出现缺陷修复需求。

---

## 3. 范围与非目标

### 3.1 In Scope

- 将 Context Downshift 扩展到更多 MCP 工具（按风险分批）；
- 为每一批补齐：合同、MCP 路由、适配器兜底、回归测试、文档示例；
- 输出统一验收证据（测试、参数缩短统计、负向场景覆盖）。

### 3.2 Out of Scope

- 不重写 MCP 协议层；
- 不改变 `ToolResult` 顶层结构；
- 不在本轮引入破坏性参数删除（保留显式参数兼容）；
- 不做跨 session 自动猜测（仍禁止“无 sessionId 猜设备/平台”）。

---

## 4. 设计原则（继续执行）

1. **显式优先**：用户显式参数 > 会话继承；
2. **会话一致性**：`platform/deviceId/appId/runnerProfile` 冲突即 `CONFIGURATION_ERROR`；
3. **无活跃会话不猜测**：sessionId-only 必须能解析到 active session；
4. **失败可行动**：缺上下文错误必须带 nextSuggestions；
5. **每批都可独立回滚**：按工具簇提交，避免大爆炸。

---

## 5. 分批下沉计划（按风险与收益排序）

## Wave 0（已完成）

- `launch_app` / `install_app` / `reset_app_state` / `terminate_app`

验收状态：✅ 已完成。

## Wave 1A（只读感知链，低风险）

目标工具：

- `inspect_ui`
- `query_ui`
- `resolve_ui_target`
- `wait_for_ui`

目标效果：

- 读取类工具统一到 `sessionId + 查询条件`，优先消除“读取工具参数口径不一致”。

## Wave 1B（变更型 UI 动作链，中风险）

目标工具：

- `tap_element`
- `type_into_element`
- `scroll_and_resolve_ui_target`
- `scroll_and_tap_element`

目标效果：

- 调用从 `sessionId + platform + deviceId (+ runnerProfile)` 收敛为 `sessionId + 业务选择器`。

## Wave 2（设备原子动作与证据）

目标工具：

- `tap`
- `type_text`
- `take_screenshot`
- `record_screen`
- `get_logs`
- `get_crash_signals`
- `collect_diagnostics`

目标效果：

- 坐标/文本/输出路径仍显式传入；环境上下文由 session 继承。

## Wave 3（诊断与性能）

目标工具：

- `collect_debug_evidence`
- `get_screen_summary`
- `get_session_state`
- `measure_android_performance`
- `measure_ios_performance`

目标效果：

- 保留业务参数（duration/template 等），移除重复平台上下文。

## Wave 4（编排与恢复链路）

目标工具：

- `perform_action_with_evidence`
- `recover_to_known_state`
- `replay_last_stable_path`
- `resolve_interruption`
- `resume_interrupted_action`
- `run_flow`

目标效果：

- 统一 session-bound 语义，避免“部分工具继承、部分工具强制显式”的体验割裂。

---

## 6. 每个 Wave 的固定执行模板（按此模板循环）

1. **合同层**：将目标工具输入中可继承上下文字段改为 optional（仅限可由 session 推断字段）；
2. **MCP 层**：
   - 使用统一会话包装器注入上下文；
   - 校验冲突字段并返回结构化错误；
   - 对 sessionId-only 且无 active session 返回 `CONFIGURATION_ERROR`；
3. **适配器层**：保留缺字段兜底错误，避免透传运行时异常；
4. **测试层**（每个工具至少 6 类）：
   - sessionId-only 正向继承；
   - missing session；
   - closed session；
   - 显式参数与 session 冲突；
   - session 存在但关键继承字段缺失（例如 app-dependent 工具缺 appId）；
   - policy denied / 设备不可用时的结构化失败语义保持稳定；
5. **文档层**：更新 checklist 工具示例为简写形式；
6. **验证层**：`pnpm test:mcp-server`、`pnpm build`、`pnpm typecheck` 必须全绿。

### 6.1 每个 Wave 的交付证据模板（固定）

每个 Wave 的执行记录文档必须包含：

1. 变更文件清单（按 package 分组）；
2. 新增/修改测试用例清单（含 6 类覆盖映射）；
3. 1 个 dry-run 调用样例（输入与结构化输出）；
4. 1 个 real-run 调用样例（若该 Wave 含状态变更工具）；
5. 2 个典型错误样例（missing session + mismatch/policy denied）；
6. 回滚演练结果（回滚后测试命令与状态）。
7. 参数缩短统计（必填）：
   - 改造前参数个数；
   - 改造后参数个数；
   - 统计口径说明（与 §7.2 保持一致）；
   - Wave 内中位数降幅（%）。

---

## 7. 验收标准（量化）

### 7.1 功能验收

- Wave 内所有目标工具：sessionId-only（或最小参数）路径可用；
- 负向场景全部返回结构化 `ToolResult`（不抛未捕获错误）。

### 7.2 体验验收（命令长度）

- 口径：只统计 MCP 调用体内业务参数（不统计工具名和外层客户端命令）；
- 目标：
  - Wave 1/2 工具的参数个数中位数下降 ≥ 40%；
  - 全量下沉完成后，目标工具集参数个数中位数下降 ≥ 55%。

### 7.3 稳定性验收

- `pnpm test:mcp-server` 全通过；
- `pnpm build` 全通过；
- `pnpm typecheck` 全通过；
- 每个 Wave 至少 1 次 dry-run 端到端样例记录到交付文档。

### 7.4 平台归属与冲突语义（性能工具强制）

- `measure_android_performance`：
  - session 解析到非 android 平台时，必须返回结构化非适用语义（禁止静默改写）；
- `measure_ios_performance`：
  - session 解析到非 ios 平台时，必须返回结构化非适用语义；
- 若显式 `platform` 与 session 平台冲突：统一 `CONFIGURATION_ERROR`。

### 7.5 Wave 4 额外验收门槛（必须 real-run）

- Wave 4 目标工具除 dry-run 外，至少各有 1 条 real-run 证据；
- 若受 CI 设备条件限制，需补充“受限原因 + 本地真实设备证据 + 重放脚本”。

---

## 8. 风险与对策

1. **风险：会话歧义导致误操作**
   - 对策：仅支持显式 `sessionId` 继承；不做“自动选 session”。

2. **风险：行为变更影响旧调用方**
   - 对策：保持显式参数兼容，冲突时明确报错而非静默覆盖。

3. **风险：工具下沉范围扩大后测试爆炸**
   - 对策：按 Wave 增量推进；每个 Wave 只处理一个工具簇并当场验收。

4. **风险：MCP 层与适配器层语义漂移**
   - 对策：保留适配器层缺字段防护，并在 MCP 层集中定义冲突规则。

---

## 9. 回滚策略

每个 Wave 独立回滚，回滚粒度：

1. 先回滚 MCP 路由包装（恢复显式参数依赖）；
2. 若必要，再回滚对应合同 optional 字段变更；
3. 文档示例回退到显式参数版本；
4. 回滚后必须重新执行：`pnpm test:mcp-server && pnpm build && pnpm typecheck`。

---

## 10. 里程碑

- M1：Wave 1A 完成并验收（只读感知链）
- M2：Wave 1B 完成并验收（变更型 UI 动作链）
- M3：Wave 2 完成并验收（设备动作 + 证据）
- M4：Wave 3 完成并验收（诊断 + 性能）
- M5：Wave 4 完成并验收（编排 + 恢复）
- M6：汇总文档与参数缩短统计闭环

> 执行约束：每个里程碑完成后才进入下一 Wave，不跨 Wave 并发改造。

---

## 11. 后续执行入口（唯一基线）

后续继续下沉时，以本文为执行基线，按 **Wave -> 模板步骤 -> 验收标准** 顺序推进；每完成一个 Wave，更新：

- `docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`（命令示例）
- 新增对应执行记录文档（含测试证据与参数统计）
- `docs/delivery/execution-index.md`（证据索引）
