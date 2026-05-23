# Policy Profile 使用指南

Policy profile 是 Agent 驱动移动端动作时的控制平面边界。它决定某次工具调用应该执行、以 `POLICY_DENIED` fail closed，还是提示 Agent 换一种策略。

当前真相源是：

```text
configs/policies/access-profiles.yaml
```

## Profile 列表

| Profile | 适用场景 | 允许 | 拒绝 |
|---|---|---|---|
| `read-only` | 审批前的观察、取证、调试 | inspect、screenshot、logs、performance、中断检测/分类 | tap、type、install、uninstall、高风险中断动作 |
| `interactive` | 已允许普通交互，但不允许破坏性设备/App 变更 | inspect、screenshot、logs、performance、tap、type、swipe、有边界中断处理 | uninstall、高风险中断动作 |
| `full-control` | 本地/dev 自动化，明确允许安装、卸载、清数据等操作 | inspect、screenshot、logs、performance、tap、type、swipe、install、uninstall、clear-data、高风险中断处理 | 当前 profile 无 deny |
| `sample-harness-default` | 向后兼容的 sample/dev 默认配置 | 较宽的 sample 自动化 scope | 当前 profile 无 deny |

当 Agent 只应该观察和报告时，用 `read-only`。当 tap/type/swipe 是预期行为但不应做破坏性操作时，用 `interactive`。只有在明确接受 install/uninstall/clear-data 等副作用时，才使用 `full-control`。

## 运行时行为

用显式 profile 启动受治理 session：

```json
{
  "sessionId": "agent-review-001",
  "platform": "android",
  "deviceId": "emulator-5554",
  "profile": "phase1",
  "policyProfile": "read-only"
}
```

如果 Agent 调用了 profile 不允许的动作，工具会返回结构化拒绝：

```json
{
  "status": "failed",
  "reasonCode": "POLICY_DENIED",
  "data": {
    "toolName": "perform_action_with_evidence",
    "policyProfile": "read-only"
  }
}
```

拒绝后，可以用相同 `sessionId` 调用 `suggest_known_remediation`。对于非默认 policy profile，它会返回治理类下一步建议，例如继续使用 inspect/query 工具、请求审批，或用更明确的权限 profile 重启 session。

## Agent 推荐模式

未知或高风险任务：

1. 从 `read-only` 开始。
2. 使用 `describe_capabilities`、`inspect_ui`、`query_ui`、截图、日志或摘要。
3. 如果必须交互，先解释原因并请求审批，或用 `interactive` 重启 session。
4. 只有在 setup/reset 流程明确需要破坏性操作时，才升级到 `full-control`。

已批准的普通交互任务：

1. 从 `interactive` 开始。
2. 优先使用确定性 selector。
3. 把 `POLICY_DENIED` 当成治理结果，而不是 UI flaky。
4. 重试或切换 profile 前，先调用 `suggest_known_remediation`。

## 边界

- Profile 约束的是 MCP 工具类别；它不能替代 AUT 自身鉴权、OS sandbox 或人工 review。
- 默认 profile 是为了 sample 兼容。新的 Agent 工作流应该显式选择 profile。
- Policy denial 不代表目标 UI 不存在；它只说明请求动作超出了当前控制边界。
- 本文描述 YAML-backed 当前基线。如果文档和 YAML 不一致，以 `configs/policies/access-profiles.yaml` 为准。
