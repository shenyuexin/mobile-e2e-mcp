# React Native Adapter Design

本设计文档补齐 RN 方向在“执行面 + 观测面 + 治理面”的完整边界，避免把 RN 能力误判为仅有 debugger snapshot。

---

## 1. 目标

- 明确 RN 的双通道模型：Automation lane + Debug lane。
- 定义 RN 在本仓库中的可执行边界（基于平台 adapter）。
- 规范 Metro inspector 相关能力的风险分级与策略门禁。

---

## 2. 代码边界

- `packages/adapter-maestro/src/js-debug.ts`
- `packages/adapter-maestro/src/device-runtime.ts`
- `packages/adapter-maestro/src/index.ts`
- `packages/mcp-server/src/tools/list-js-debug-targets.ts`
- `packages/mcp-server/src/tools/capture-js-console-logs.ts`
- `packages/mcp-server/src/tools/capture-js-network-events.ts`

关联文档：

- `docs/architecture/rn-debugger-sequence.md`
- `docs/architecture/framework-coverage.md`

---

## 3. 架构模型

```text
RN Session
  |
  +--> Automation Lane (Android/iOS adapter execution)
  |
  +--> Debug Lane (Metro inspector snapshots)
         |
         +--> console/network/runtime exception evidence

Merged in session timeline + evidence packet
```

---

## 4. 能力分层

### 4.1 Automation Lane（主路径）

- app lifecycle
- inspect/query/resolve
- tap/type/wait/run_flow
- interruption handling

### 4.2 Debug Lane（补充路径）

- list targets
- capture one-shot console snapshot
- capture one-shot network snapshot
- merge to debug evidence packet

---

## 5. 平台实现方案

### Android RN

- 执行基于 Android adapter。
- Metro 连接失效时，不影响基础执行路径；仅 debug 证据降级。

### iOS RN

- 执行基于 iOS adapter（当前 idb 基线能力）。
- inspector snapshot 与 iOS native logs 在 session 时间线合并。

---

## 6. 策略与安全

- debug lane 默认 read scope。
- 未来若引入 `Runtime.evaluate`，需升级为高风险 scope。
- 所有 debug 抓取都需要审计记录与脱敏策略。

---

## 7. 验收指标

- RN 执行 lane 与 debug lane 的职责边界清晰且无混用。
- debug snapshot 失败不导致执行 lane 错误判定。
- 关键调试事件可在 session timeline 追踪。
