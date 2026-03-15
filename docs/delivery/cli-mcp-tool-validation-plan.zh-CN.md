# OpenCode CLI 下 `mobile-e2e-mcp` 可用性与稳定性验证方案清单

## 1. 目标

本方案用于从**用户视角**验证：在 OpenCode CLI 里通过 MCP 调用 `mobile-e2e-mcp` 时，工具是否

1. 可发现（discoverable）
2. 可调用（callable）
3. 结果结构稳定（schema-stable）
4. 连续运行稳定（run-stable）

---

## 2. 前置条件

- OpenCode CLI 已可列出并连接 `mobile-e2e-mcp`
- 设备/模拟器已就绪（Android/iOS 至少一端）
- 当前仓库可执行：`pnpm build && pnpm typecheck`

快速检查：

```bash
opencode mcp list
```

期望：`mobile-e2e-mcp` 状态为 `connected`。

---

## 3. 分层验证策略（建议按顺序执行）

## L0：连通性层（MCP 注册与握手）

### 方案 L0-1：服务连通

- 命令：`opencode mcp list`
- 通过标准：`mobile-e2e-mcp` 为 `connected`
- 失败分级：P0（后续所有验证阻塞）

### 方案 L0-2：用户视角最小调用

- 命令示例：

```bash
opencode run "Use mobile-e2e-mcp MCP and return the first 3 tool names only." --agent dev
```

- 通过标准：返回工具名列表（非空）

---

## L1：目录与契约层（工具列表与输出结构）

### 方案 L1-1：工具清单覆盖核对

- 目标：确认核心工具组都可见
- 重点组：
  - Session/App：`start_session`, `end_session`, `install_app`, `launch_app`
  - UI：`inspect_ui`, `query_ui`, `tap_element`, `type_into_element`, `wait_for_ui`
  - 证据：`take_screenshot`, `get_logs`, `get_crash_signals`, `collect_diagnostics`
  - 诊断：`perform_action_with_evidence`, `explain_last_failure`, `rank_failure_candidates`

### 方案 L1-2：结构化输出稳定性

- 抽样调用 5~10 个工具，检查响应是否包含稳定字段：
  - `status`
  - `reasonCode`
  - `sessionId`（若有会话）
  - `artifacts`（数组）
  - `data`（对象）

- 通过标准：抽样工具 100% 返回结构化对象，无“纯文本不可解析”结果

---

## L2：功能冒烟层（高频路径）

### 方案 L2-1：Session + App 生命周期

1. `start_session`
2. `install_app`（可选，已安装可跳过）
3. `launch_app`
4. `terminate_app`
5. `end_session`

通过标准：链路全部 `status=success`。

### 方案 L2-2：UI 基础动作

1. `inspect_ui` / `query_ui`
2. `resolve_ui_target`
3. `tap_element` 或 `type_into_element`
4. `wait_for_ui`

通过标准：至少 1 条 UI 动作闭环成功（解析 -> 操作 -> 等待）。

### 方案 L2-3：证据链完整性

1. `take_screenshot`
2. `get_logs`
3. `get_crash_signals`

通过标准：`artifacts` 与输出文件路径可定位，文件存在且可读。

---

## L3：韧性层（失败解释与恢复）

### 方案 L3-1：受控失败 + 解释

- 使用一个必失败动作（如不存在的 selector）触发失败
- 依次调用：
  - `perform_action_with_evidence`
  - `explain_last_failure`
  - `rank_failure_candidates`

通过标准：失败可归因，返回可执行 nextSuggestions/候选原因。

### 方案 L3-2：恢复链路

- 对失败会话调用：
  - `recover_to_known_state`
  - `replay_last_stable_path`（如有稳定路径）

通过标准：至少一个恢复动作成功且有证据输出。

---

## L4：稳定性层（重复运行与波动监控）

### 方案 L4-1：固定动作重复 10 次

- 选择 1 个确定性动作（建议 launch + screenshot）
- 重复执行 10 次
- 记录：
  - pass rate
  - 平均耗时 / p95
  - reasonCode 分布

通过门槛（建议）：

- pass rate >= 95%
- 同一失败原因占比可解释（非随机散点）

### 方案 L4-2：并发与租约冲突

- 复用 `validate:concurrent-smoke` 或等价并发方案
- 目标：验证 lease 冲突可被正确拒绝且可恢复

通过标准：冲突可预测、可解释、不会导致会话泄漏。

---

## 4. 建议执行命令清单（仓库内）

```bash
pnpm build
pnpm typecheck
pnpm test:smoke
pnpm validate:concurrent-smoke
opencode mcp list
opencode run "Use mobile-e2e-mcp MCP and return the first 3 tool names only." --agent dev
```

需要真实设备回归时，叠加：

```bash
pnpm validate:phase3-real-run
pnpm validate:bounded-auto-remediation-real-run
```

---

## 5. 结果记录模板（每轮必填）

## A. 基本信息

- 日期：
- 执行人：
- 设备/平台：
- OpenCode 版本：

## B. 分层结果

| 层级 | 用例数 | 通过数 | 通过率 | 结论 |
|---|---:|---:|---:|---|
| L0 |  |  |  |  |
| L1 |  |  |  |  |
| L2 |  |  |  |  |
| L3 |  |  |  |  |
| L4 |  |  |  |  |

## C. 失败汇总

- Top reasonCode：
- 是否可复现：
- 是否有修复建议：

## D. 证据路径

- reports:
- artifacts:
- sessions/audit:

---

## 6. Go / Conditional / No-Go 判定

- **Go**：L0~L3 全通过，L4 达阈值；
- **Conditional**：L0~L2 通过，但 L3/L4 存在可收敛问题；
- **No-Go**：L0/L1 失败，或出现不可解释的高频随机失败。

---

## 7. 当前建议（结合本仓库现状）

1. 先以 Android 路径完成 L0~L4 的连续两轮复测；
2. 将 WordPress / RNTester / Flutter demo 作为三类样本持续回归；
3. 每轮将 `reasonCode` 与 artifacts 做 trend 对比，避免“单次通过错觉”。
