# `mobile-e2e-mcp` 可用性增强实施方案（doctor 指引 / 会话上下文别名 / preset 命令层）

## 1. 目标

本方案聚焦你提出的 3 个高优先级可用性改进，目标是把“能力强但命令长、前置复杂”的现状，收敛为“用户可快速上手、可评审、可持续演进”的体验：

1. `doctor` 在环境缺失时返回可执行修复指引（尤其 IDB）；
2. 降低重复参数成本（`platform/deviceId/appId/sessionId`）并支持会话上下文自动继承；
3. 提供 preset 命令层（面向常见场景的一键动作模板）。

---

## 2. 背景与当前痛点

结合当前代码与验证文档，核心痛点如下：

- MCP 工具调用参数偏长，用户需反复填写相同上下文；
- 多数工具依赖会话上下文，缺失时容易出现 `CONFIGURATION_ERROR`；
- 失败分析类工具需前置动作链（action/baseline/signature），学习门槛较高；
- 当前已有 `dev-cli` 参数解析和工具分发能力，但缺“上层任务语义封装”。

> 结论：当前是“专业工具箱形态”，下一步应补齐“产品化交互层”。

---

## 3. 范围与非目标

## 3.1 本次范围（In Scope）

- A. `doctor` 输出增强：安装命令、验证命令、环境变量兜底；
- B. 会话上下文别名：减少重复参数输入，支持当前会话上下文注入；
- C. preset 命令层：将高频场景映射为简短命令与固定动作链。

## 3.2 非目标（Out of Scope）

- 不重写 MCP 协议层；
- 不改变核心工具契约（`ToolResult` 字段结构保持兼容）；
- 不在本轮引入破坏性 CLI 参数变更（优先向后兼容）。
- **Preset V1 不新增 MCP tool name**（仅在 `dev-cli` 暴露 preset 入口，MCP 侧继续复用原子工具）。

---

## 4. 方案总览（Architecture）

```text
User Prompt / CLI
    │
    ├─ Preset Layer (new)
    │   ├─ quick_debug_ios
    │   ├─ quick_e2e_android
    │   └─ crash_triage_android
    │
    ├─ Context Alias Layer (new)
    │   ├─ resolve current session defaults
    │   └─ auto-fill platform/deviceId/appId/policy
    │
    └─ Existing Tool Invocation Layer
        ├─ server.invoke(toolName, input)
        └─ adapter-maestro tool executors
```

设计原则：

1. **兼容优先**：保留现有命令与输入结构；
2. **显式可追踪**：自动补全字段必须在输出中可见（便于审计）；
3. **失败可行动**：每个失败都给出直接可执行的下一步。

## 4.1 用户视角命令长度改进（示例）

改进前（典型长调用）：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server dev-cli \
  --tap-element \
  --platform ios \
  --session-id ses-123 \
  --runner-profile phase1 \
  --device-id ADA078B9-3C6B-4875-8B85-A7789F368816 \
  --content-desc "Login" \
  --dry-run
```

改进后（Context Alias + Preset）：

```bash
pnpm --filter @mobile-e2e-mcp/mcp-server dev-cli --preset-name quick_debug_ios
```

> 说明：preset 展开后仍调用原工具，只是由系统自动补齐上下文与参数。

---

## 5. 详细实施方案

## A. `doctor` 可执行修复指引增强

### A.1 目标

当 `doctor` 发现关键依赖缺失（例如 `idb` / `idb_companion`）时，不仅报错，还要给出“可复制执行”的修复路径。

### A.2 当前基线

- 已存在 `runDoctor()` 与 `checks/nextSuggestions` 输出；
- 已完成 IDB 缺失场景的建议增强（`pipx install fb-idb`、`brew install idb-companion`、`IDB_*_PATH` 提示）。

### A.3 下一步扩展

1. 将同样策略扩展到 `adb/xcrun/maestro/trace_processor`；
2. 每个依赖统一输出三段式建议：
   - 安装命令；
   - 自检命令；
   - 非标准路径环境变量提示；
3. 按平台聚合输出“最短修复路径”（Android/iOS 分开）。

### A.3.1 输出结构约束（避免文案漂移）

`nextSuggestions` 保持用户可读文本；同时在 `data` 增加结构化字段：

```ts
interface DoctorGuidanceItem {
  dependency: string;
  status: "pass" | "warn" | "fail";
  platformScope: "android" | "ios" | "cross";
  installCommands: string[];
  verifyCommands: string[];
  envHints: string[];
}
```

要求：`nextSuggestions` 由 `data.guidance[]` 派生，保证可测试性与一致性。

### A.4 建议实现点

- `packages/adapter-maestro/src/doctor-guidance.ts`：规则表驱动（dependency -> install/verify/hints）；
- `packages/adapter-maestro/src/index.ts`：`runDoctor` 汇总建议；
- `packages/adapter-maestro/test/*`：按依赖缺失场景补单测。

### A.5 验收标准

- `adb/xcrun/maestro/trace_processor/idb/idb_companion` 六类缺失场景各至少 1 条单测；
- 每类缺失输出均包含 install/verify/envHints 三段建议；
- `warn` 类场景（如 target 可见性）与“二进制缺失”分开，不输出误导性安装建议；
- 输出语义稳定（不破坏现有 `ToolResult`）。

---

## B. 会话上下文别名（Context Alias）

### B.1 目标

让用户在一次 `start_session` 后，后续工具调用默认继承 `platform/deviceId/appId/runnerProfile/policyProfile`，显著缩短命令。

### B.2 设计

新增“上下文解析器”：

- 输入：显式参数 + `sessionId` + 当前会话记录；
- 解析优先级：
  1. `flag`（用户显式参数）
  2. `alias`（活动会话上下文）
  3. `preset`（preset 默认平台）
  4. `default`（CLI/工具默认值）
- 输出：完整 tool input + `resolvedFrom` 元信息（用于审计/调试）。

### B.2.1 会话选择与失败规则（必须写死）

1. 传入 `sessionId`：只允许从该 session 解析上下文；
2. 未传 `sessionId`：仅当“同平台范围内恰好 1 个活动 session”时允许自动继承；
3. 多个候选 session：返回 `CONFIGURATION_ERROR`（建议新增 `AMBIGUOUS_SESSION_CONTEXT`）；
4. 禁止从“任意可用设备列表”自动猜 `deviceId`；
5. 显式参数永远覆盖 alias/session/harness 推断值。

### B.3 建议实现点

- `packages/mcp-server/src/dev-cli.ts`：新增统一 `resolveCliToolContext()`；
- `packages/mcp-server/src/tools/*`：会话型工具入口复用解析器；
- `packages/core`：复用 `loadSessionRecord`，保持持久化来源一致。

### B.4 兼容策略

- 不移除旧参数；
- 新行为默认开启，但支持 `--no-context-alias` 关闭（便于定位问题）；
- 在输出 `data` 中追加 `resolvedContext`（不影响旧字段）。
- `useContextAlias=false` 时不返回 `resolvedContext`；
- CLI 与 MCP 工具入口共用同一 resolver 逻辑，禁止双实现分叉。

### B.5 验收标准

- 固定样本命令：`launch_app`、`tap_element`、`get_logs`；
- 统计口径：只计算业务参数 flag（不含 `pnpm --filter ... dev-cli` 前缀）；
- 目标：样本命令参数个数中位数下降 >= 40%；
- 负向用例必须覆盖：alias 关闭、多活动 session 歧义、session 不存在、partial session 缺少 `appId`、显式参数覆盖 session 值。

### B.6 最小接口草案

新增（或扩展）入参（向后兼容）：

```ts
interface ContextAliasInput {
  sessionId?: string;
  useContextAlias?: boolean;      // default: true
  contextSource?: "session" | "harness" | "explicit";
}
```

新增输出元信息（`data` 内）：

```ts
interface ResolvedContextMeta {
  sessionId: "flag" | "alias" | "preset" | "default";
  platform: "flag" | "alias" | "preset" | "default";
  deviceId: "flag" | "alias" | "preset" | "default";
  appId: "flag" | "alias" | "preset" | "default";
  runnerProfile: "flag" | "alias" | "preset" | "default";
}
```

目的：评审时可以直接判断“字段由哪里补齐”，避免隐式行为不可解释。

### B.7 契约边界说明

- 若 `ContextAliasInput` 进入 MCP 工具输入合同，必须同步更新：
  - `packages/contracts` 类型与 schema；
  - `packages/mcp-server/src/server.ts` 注册与校验。
- 若仅 `dev-cli` 消费，则在实现与文档中明确“该字段不进入 MCP tool contract”。

---

## C. Preset 命令层（Task-Oriented Commands）

### C.1 目标

把“多工具串联动作”抽象为用户可记忆的短命令，降低认知负担与误用率。

### C.2 首批 Preset（建议）

1. `quick_debug_ios`
   - `start_session -> get_screen_summary -> get_logs -> get_crash_signals -> collect_debug_evidence`
2. `quick_e2e_android`
   - `start_session -> launch_app -> inspect_ui/query_ui -> tap_element/type_into_element -> wait_for_ui -> take_screenshot`
3. `crash_triage_android`
   - `get_crash_signals -> explain_last_failure -> rank_failure_candidates -> suggest_known_remediation`

### C.3 输入输出设计

- 输入：`--preset-name` + 少量必要参数（如 `sessionId`、`platform` 可选）；
- 输出：
  - 每个 step 的 `status/reasonCode`；
  - 汇总 `overallStatus`；
  - 证据路径聚合（artifacts list）；
  - 建议下一步（失败时）。

### C.3.1 执行语义（必须固定）

- 默认：`stopOnFailure=true`；step 可覆盖 `onFailure: stop | continue`；
- preset 首 step 若是 `start_session`：生成的 `sessionId` 自动注入后续 steps；
- 若用户显式传 `sessionId` 且 preset 同时要求 `start_session`：
  - 方案一：跳过 `start_session`；
  - 方案二：返回配置冲突（需在实现阶段二选一并文档写死）；
- 输出中固定提供 `data.presetReport`：`presetName`、`overallStatus`、`steps[]`、`artifacts[]`、`resolvedContext`。

### C.4 建议实现点

- `packages/mcp-server/src/dev-cli.ts`：新增 preset 参数分支；
- `packages/mcp-server/src/presets/`：每个 preset 一个执行器；
- `packages/mcp-server/test/dev-cli.test.ts`：新增 preset 解析与执行链路测试。

### C.5 验收标准

- CI（no-device）：每个 preset 至少 1 条 `dev-cli.test.ts` dry-run 断言 + 1 条脚本 dry-run 断言；
- 手工/设备回归：`quick_e2e_android` 在 Android 验证、`quick_debug_ios` 在 iOS 验证；
- 失败链路要求：中间 step 失败时 `overallStatus=fail`，失败 step 有 `reasonCode`，前序 artifacts 不丢失；
- 无 preset 情况下原流程保持兼容。

### C.6 Preset 配置草案

建议新增配置文件：`configs/presets/mobile-ux-presets.yaml`

```yaml
version: 1
presets:
  quick_debug_ios:
    description: "iOS 快速诊断链路"
    stopOnFailure: true
    platform: ios
    steps:
      - tool: start_session
      - tool: get_screen_summary
      - tool: get_logs
      - tool: get_crash_signals
      - tool: collect_debug_evidence
  quick_e2e_android:
    description: "Android 快速 E2E 闭环"
    stopOnFailure: true
    platform: android
    steps:
      - tool: start_session
      - tool: launch_app
      - tool: query_ui
      - tool: tap_element
      - tool: wait_for_ui
      - tool: take_screenshot
```

加载校验要求：preset 名唯一、tool 名在 allowlist、每 step 必需输入可由“显式参数 / alias / preset 默认值”之一满足。

---

## 5.1 对外最佳实践对齐（用于评审）

本方案与通用 MCP/CLI 设计原则对齐点：

1. **结构化输出优先**：继续保持 `ToolResult` 机器可消费；
2. **会话化上下文**：减少 LLM/Agent token 浪费与重复输入；
3. **错误可恢复**：失败返回可执行修复与下一探针建议；
4. **高频任务模板化**：把“原子工具链”封装为可复用场景命令。

评审时应重点看：

- 是否真正降低了调用复杂度（而不是仅改文案）；
- 是否保持协议/契约兼容；
- 是否把失败从“死胡同”变成“可执行下一步”。

---

## 6. 里程碑与排期（建议）

## M1（1 周）：doctor 全依赖可执行指引

- 交付：规则表 + 单测 + 文档示例
- Gate：`adapter-maestro` tests 通过，doctor 输出可直接复制执行

## M2（1~1.5 周）：会话上下文别名

- 交付：上下文解析器 + CLI/工具接入 + 回归测试
- Gate：高频路径参数减少 >= 40%，无兼容回归

## M3（1~1.5 周）：preset 层

- 交付：3 个 preset + step 汇总报告 + 文档
- Gate：M2 resolver 契约稳定后再进入；preset dry-run 与 mcp-server tests 全通过

## 6.1 建议 PR 拆分（便于 review）

1. PR-1：doctor guidance 规则化（仅 `adapter-maestro`）
2. PR-2：context alias 解析器与 CLI 接入（`mcp-server` + tests）
3. PR-3：preset 执行器与配置文件（`mcp-server` + docs）
4. PR-4：回归与文档补齐（checklist、执行记录、README 导航）

### 每个 PR 必备评审材料

1. 1 条改进前命令 + 1 条改进后命令；
2. 1 段输出 JSON 样例（含新增字段）；
3. 新增/修改测试命令与结果摘要；
4. 本 PR 对兼容性的影响说明（无/有，若有给迁移策略）。

---

## 7. 风险与应对

1. **风险：自动补全导致“隐式行为不可见”**
   - 应对：输出 `resolvedContext` 与来源优先级；
2. **风险：preset 失去灵活性**
   - 应对：preset 支持参数覆盖与 step 级中断；
3. **风险：文档与实现漂移**
   - 应对：将示例命令纳入 CI dry-run 验证脚本。

---

## 8. 评审清单（Review Checklist）

- [ ] 三项改进是否都保持向后兼容？
- [ ] 是否有明确文件落点与测试落点？
- [ ] 是否定义了可量化验收指标（参数下降、通过率、错误率）？
- [ ] 是否给出失败场景与恢复路径？
- [ ] 文档是否可直接指导下一轮实施？

---

## 9. 建议评审流程

1. 架构评审（接口与兼容性）
2. 工程评审（代码改动点与测试策略）
3. 交付评审（验收指标与里程碑）
4. 用户视角复核（命令长度、学习成本、故障恢复）

---

## 10. 参考实现基线（仓库内）

- `packages/mcp-server/src/dev-cli.ts`
- `packages/mcp-server/src/tools/start-session.ts`
- `packages/adapter-maestro/src/index.ts`
- `packages/adapter-maestro/src/doctor-guidance.ts`
- `docs/delivery/cli-mcp-tool-validation-plan.zh-CN.md`
- `docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`

---

## 11. 本轮实现落地状态（2026-03-16）

已完成：

1. **doctor 可执行修复指引增强**
   - 新增结构化 guidance 生成器与规则：
     - `packages/adapter-maestro/src/doctor-guidance.ts`
   - `runDoctor` 返回中新增 `data.guidance`（在保持兼容的前提下扩展）：
     - `packages/adapter-maestro/src/index.ts`

2. **context alias（CLI 层）**
   - 新增 `--no-context-alias` 开关；
   - 在 `dev-cli` 中实现会话上下文补全（session -> platform/deviceId/appId/runnerProfile）：
     - `packages/mcp-server/src/dev-cli.ts`

3. **preset 命令层（V1）**
   - 新增 `--preset-name`：
     - `quick_debug_ios`
     - `quick_e2e_android`
     - `crash_triage_android`
   - 在 `dev-cli` 中实现 step 编排、状态汇总与 artifacts 聚合：
     - `packages/mcp-server/src/dev-cli.ts`

4. **测试补齐**
   - doctor guidance 单测扩展：
     - `packages/adapter-maestro/test/doctor-guidance.test.ts`
   - preset/context-alias CLI 测试新增：
     - `packages/mcp-server/test/dev-cli.test.ts`

说明：

- Preset 配置文件化（`configs/presets/*.yaml`）在 V1 中暂未启用，当前采用**代码内注册表**，优先保证可用性与回归稳定；
- V2 可将 preset 注册表外置为 YAML 配置，并加入配置 schema 校验。

## 12. 本轮增量落地状态（2026-03-16，第二批）

已完成：

1. **默认值统一来源（deviceId/appId）**
   - 在 `adapter-maestro` 统一定义并导出默认值与构建函数：
     - `DEFAULT_ANDROID_DEVICE_ID`
     - `DEFAULT_IOS_SIMULATOR_UDID`
     - `DEFAULT_ANDROID_APP_ID`
     - `DEFAULT_IOS_APP_ID`
     - `buildDefaultDeviceId(platform)`
     - `buildDefaultAppId(platform)`
   - 相关落点：
     - `packages/adapter-maestro/src/harness-config.ts`
     - `packages/adapter-maestro/src/index.ts`
     - `packages/adapter-maestro/src/device-runtime.ts`
     - `packages/mcp-server/src/tools/start-session.ts`

2. **上下文优先级规则固化**
   - 在 CLI 层统一为：`flag > alias > preset > default`；
   - alias 与 preset 平台冲突时返回 `CONFIGURATION_ERROR`，并给出可执行建议；
   - preset 包含 `start_session` 时，alias 推断出的 `sessionId` 不再当作显式参数复用。
   - 相关落点：
     - `packages/mcp-server/src/cli/context-resolver.ts`
     - `packages/mcp-server/src/cli/preset-runner.ts`

3. **回归测试补充（优先级/来源可解释性）**
   - 新增 alias-vs-preset 平台优先级测试；
   - 新增 preset 注入平台来源标记（`resolvedContext.platform = "preset"`）断言。
   - 相关落点：
     - `packages/mcp-server/test/dev-cli.test.ts`
