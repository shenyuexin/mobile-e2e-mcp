# Record -> Replay 产品化设计方案（Android-first）

## 1. 背景与目标

当前 `mobile-e2e-mcp` 已具备：

- 基于 action records 的 Flow 导出：`export_session_flow`
- 任务型导出封装：`record_task_flow`
- Flow 回放：`run_flow`

但当前体验仍偏工程化：需要逐步调用 MCP 工具生成 records，难以面向普通测试/业务同学落地。

本方案目标是把流程升级为：

1. `start_record_session`
2. 用户在手机/模拟器上手工操作 App
3. `end_record_session` 自动产出可回放 Flow（并给出质量报告）

---

## 2. 范围（Scope）

### 2.1 In Scope（本期）

- Android-first 录制闭环
- 被动采集用户操作事件（点击、输入、返回、前后台切换）
- 事件语义化映射到既有动作模型（`tap_element/type_into_element/wait_for_ui/launch_app`）
- 自动导出 YAML 到 `flows/samples/generated/`
- 导出后自动 dry-run 冒烟回放并返回结构化报告

### 2.2 Out of Scope（本期不做）

- 纯自然语言全自动探索流程（零锚点）
- iOS 真机被动录制
- 复杂手势（多指、长按拖拽）高精度还原

---

## 3. 对外工具设计（MCP Surface）

新增前门工具（以用户视角最少操作为原则）：

### 3.1 `start_record_session`

用途：开始被动录制会话

输入（草案）：

```json
{
  "sessionId": "record-login-001",
  "platform": "android",
  "deviceId": "emulator-5554",
  "appId": "com.example.app",
  "recordingProfile": "default"
}
```

输出（草案）：

```json
{
  "status": "success",
  "reasonCode": "OK",
  "data": {
    "recordSessionId": "rec-...",
    "startedAt": "2026-03-18T...Z",
    "captureChannels": ["input_events", "ui_snapshots", "app_context"]
  }
}
```

### 3.2 `get_record_session_status`

用途：查询录制状态、事件计数、告警

### 3.3 `end_record_session`

用途：停止录制 + 语义映射 + 自动导出 + 冒烟回放

输入（草案）：

```json
{
  "recordSessionId": "rec-...",
  "autoExport": true,
  "outputPath": "flows/samples/generated/login-smoke.yaml",
  "runReplayDryRun": true
}
```

输出（草案）：

```json
{
  "status": "success",
  "reasonCode": "OK",
  "data": {
    "flowPath": "flows/samples/generated/login-smoke.yaml",
    "stepCount": 12,
    "warnings": ["step-5 selector low confidence"],
    "confidenceSummary": {"high": 8, "medium": 3, "low": 1},
    "replayDryRun": {"status": "partial", "reasonCode": "UNSUPPORTED_OPERATION"},
    "reviewRequired": true
  }
}
```

### 3.4 `cancel_record_session`

用途：中止录制并按策略保留/丢弃中间数据

### 3.5 可选增强（建议后续）

- `review_recorded_steps`
- `update_recorded_step`

用于录制后低置信度步骤修正。

---

## 4. 核心架构设计

### 4.1 三层流水线

1. **Capture Layer（采集层）**
   - 采集用户真实操作事件 + UI快照 + 上下文
2. **Semantic Mapping Layer（语义映射层）**
   - 原始事件 -> 标准动作步骤（可解释）
3. **Export & Replay Layer（导出回放层）**
   - YAML 生成 + dry-run 验证 + 质量报告

### 4.2 Android 采集策略（MVP）

采集通道：

- 输入事件：`adb shell getevent`（必要时结合 `input`/`logcat`）
- UI 层次：关键点触发前后 `uiautomator dump`
- 应用上下文：前台包名、Activity、键盘/系统弹窗信号

输出事件模型：

```ts
type RawRecordedEvent = {
  eventId: string;
  timestamp: string;
  eventType: "tap" | "type" | "swipe" | "back" | "home" | "app_switch";
  x?: number;
  y?: number;
  textDelta?: string;
  foregroundApp?: string;
  uiSnapshotRef?: string;
};
```

### 4.3 语义映射规则

1. Tap：坐标+UI树命中节点 -> `tap_element`；命不中降级 `tap`
2. Type：焦点节点+文本变化 -> `type_into_element`
3. Wait：页面转换后自动插入 `wait_for_ui`
4. Launch：前台切换映射 `launch_app`
5. 去噪：抖动点击、无效输入、重复步骤压缩
6. 置信度：`high/medium/low` + 选择原因 + 候选

### 4.4 数据存储

新增 artifact 组织（示意）：

- `artifacts/record-sessions/<recordSessionId>.json`
- `artifacts/record-events/<recordSessionId>.jsonl`
- `artifacts/recorded-steps/<recordSessionId>.json`
- `flows/samples/generated/<recordSessionId>-<timestamp>.yaml`
- `flows/samples/generated/<recordSessionId>-<timestamp>.meta.json`

---

## 5. 接口草案（Contracts）

建议新增类型：

- `StartRecordSessionInput`, `StartRecordSessionData`
- `GetRecordSessionStatusInput`, `GetRecordSessionStatusData`
- `EndRecordSessionInput`, `EndRecordSessionData`
- `CancelRecordSessionInput`, `CancelRecordSessionData`
- `RawRecordedEvent`, `RecordedStep`, `RecordedStepConfidence`
- `ReplayDryRunSummary`, `FlowGenerationReport`

并统一沿用 `ToolResult<T>` envelope。

---

## 6. 仓库改动清单（按文件/模块）

### 6.1 `packages/contracts`

- `packages/contracts/src/types.ts`
  - 新增录制会话输入输出类型、事件/步骤模型、报告模型
- `packages/contracts/src/index.ts`
  - 导出新增类型

### 6.2 `packages/core`

- `packages/core/src/session-store.ts`
  - 新增 record session 持久化读写 API
- 新增（建议）`packages/core/src/record-store.ts`
  - `persistRawRecordedEvent`
  - `listRawRecordedEvents`
  - `persistRecordedSteps`
  - `loadRecordedSteps`

### 6.3 `packages/adapter-maestro`

- 新增（建议）`packages/adapter-maestro/src/recording-runtime.ts`
  - Android 被动录制启动/停止与进程管理
  - getevent + ui dump 采集编排
- 新增（建议）`packages/adapter-maestro/src/recording-mapper.ts`
  - Raw event -> RecordedStep 映射与置信度计算
- `packages/adapter-maestro/src/index.ts`
  - 导出 `startRecordSessionWithMaestro`/`endRecordSessionWithMaestro` 等入口

### 6.4 `packages/mcp-server`

- `packages/mcp-server/src/tools/`
  - 新增：`start-record-session.ts`
  - 新增：`get-record-session-status.ts`
  - 新增：`end-record-session.ts`
  - 新增：`cancel-record-session.ts`
- `packages/mcp-server/src/server.ts`
  - registry + invoke overload + dispatch
- `packages/mcp-server/src/index.ts`
  - withPolicy / withSessionExecution wiring
- `packages/mcp-server/src/stdio-server.ts`
  - tool list 描述补齐

### 6.5 测试

- `packages/mcp-server/test/server.test.ts`
  - start -> end -> export -> run_flow 闭环
  - 失败路径：无设备、无事件、低置信度、策略拒绝
- `packages/mcp-server/test/stdio-server.test.ts`
  - tools/list + tools/call alias 覆盖
- `packages/adapter-maestro/test/*.test.ts`
  - 映射规则单测（tap/type/wait/launch/降级）

### 6.6 文档与展示

- 新增：`docs/guides/record-session-quickstart.md`
- 更新：`docs/guides/flow-generation.md`（增加新前门）
- 新增：`docs/showcase/record-session-demo.md`
- 更新：`docs/showcase/README.md` 增加入口

---

## 7. 验收标准（DoD）

1. 用户仅需两次调用：`start_record_session` 和 `end_record_session`
2. `end_record_session` 返回可用 `flowPath`
3. `run_flow(dryRun=true, flowPath=...)` 能消费导出路径
4. 返回 `confidenceSummary + warnings + reviewRequired`
5. `pnpm typecheck && pnpm test && pnpm build` 全通过

---

## 8. 里程碑建议

### Milestone A（Android MVP）

- 录制会话前门工具
- tap/type/wait/launch 四类映射
- 导出 + dry-run 闭环

### Milestone B（可修正与稳定）

- review/update step 能力
- 低置信度步骤修正流程
- 更健壮的去噪/压缩

### Milestone C（平台扩展）

- iOS simulator partial 录制
- 更完整 showcase 证据

---

## 9. 风险与缓解

- **风险：事件无法稳定映射到 selector**
  - 缓解：坐标降级 + 置信度标注 + review/update
- **风险：系统噪声导致步骤冗余**
  - 缓解：事件压缩与去抖阈值
- **风险：跨设备差异导致回放不稳**
  - 缓解：导出后自动 dry-run 报告 + 标记高风险步骤
