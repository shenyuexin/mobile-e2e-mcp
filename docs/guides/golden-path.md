# Golden Path（Front-door）

> **Canonical invocation notice**: Authoritative invocation rules and sequencing live in [AI Agent Invocation Guide](./ai-agent-invocation.zh-CN.md). This document covers only the front-door first-run path.

本指南用于让新用户在不理解全部 54 个工具的情况下，按一条固定链路完成一次可观测闭环。

## 前门工具链（7 步）

`doctor -> describe_capabilities -> start_session -> perform_action_with_evidence -> explain_last_failure -> suggest_known_remediation -> end_session`

## 最小执行步骤

1. `doctor`
   - 目标：确认本机与设备基础可用。

2. `describe_capabilities`
   - 目标：确认目标平台能力边界（建议先 Android）。

3. `start_session`
   - 目标：创建可审计会话，后续动作绑定到同一 session。

4. `perform_action_with_evidence`
   - 目标：执行一个关键动作并产出结构化证据。

5. `explain_last_failure`
   - 目标：当动作失败时，给出归因解释。

6. `suggest_known_remediation`
   - 目标：给出可执行修复建议。

7. `end_session`
   - 目标：收口会话并固化执行元数据。

## 可复制闭环示例（dry-run，适合新用户首跑）

下面示例把 `doctor` 作为前置检查；从 `start_session` 到 `end_session` 使用同一个 `sessionId` 串联闭环。你可以在任意 MCP 客户端逐步调用。

### Step 1: doctor

```json
{
  "name": "doctor",
  "arguments": {
    "includeUnavailable": false
  }
}
```

### Step 2: describe_capabilities

```json
{
  "name": "describe_capabilities",
  "arguments": {
    "platform": "android"
  }
}
```

### Step 3: start_session

```json
{
  "name": "start_session",
  "arguments": {
    "sessionId": "golden-path-demo",
    "platform": "android",
    "deviceId": "emulator-5554",
    "appId": "com.epam.mobitru"
  }
}
```

### Step 4: perform_action_with_evidence

```json
{
  "name": "perform_action_with_evidence",
  "arguments": {
    "sessionId": "golden-path-demo",
    "platform": "android",
    "action": {
      "actionType": "wait_for_ui",
      "resourceId": "login_email",
      "timeoutMs": 5000
    },
    "dryRun": true
  }
}
```

### Step 5: explain_last_failure

```json
{
  "name": "explain_last_failure",
  "arguments": {
    "sessionId": "golden-path-demo"
  }
}
```

### Step 6: suggest_known_remediation

```json
{
  "name": "suggest_known_remediation",
  "arguments": {
    "sessionId": "golden-path-demo"
  }
}
```

### Step 7: end_session

```json
{
  "name": "end_session",
  "arguments": {
    "sessionId": "golden-path-demo"
  }
}
```

### 成功判定

- 7 个调用全部返回结构化 `status` / `reasonCode`。
- `start_session` 与 `end_session` 都返回同一 `sessionId`。
- `perform_action_with_evidence` 返回 `data.outcome` 与证据字段（dry-run 预览也可）。

## Escape Hatch（保留低层能力）

当高层链路不足以表达目标时，可直接使用低层工具：

- `tap_element`
- `type_into_element`
- `wait_for_ui`

以上低层能力不被替换，仅作为黄金路径之外的补充入口。
