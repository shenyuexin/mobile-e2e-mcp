# 并发调度逐文件改造清单（按包执行）

> 用法：开发时按本清单逐项打勾，避免漏改。此文档与 07a/07b/07c 阶段清单交叉使用。

## 1) `packages/core`

## 1.1 新增文件

- [x] `src/device-lease-store.ts`
  - [x] 定义 lease 数据结构
  - [x] 实现 load/persist/remove
  - [x] 原子写

- [x] `src/execution-coordinator.ts`
  - [x] `acquireLease`
  - [x] `releaseLease`
  - [x] `markBusy` / `markIdle`
  - [x] `recoverStaleLeases`

- [x] `src/session-scheduler.ts`
  - [x] `runExclusive`
  - [x] 异常路径 finally 恢复

## 1.2 修改文件

- [x] `src/session-store.ts`
  - [x] 增加 scheduler/lease 事件追加方法
  - [x] 保证不污染 `latestStateSummary` 的 UI 语义

- [x] `src/index.ts`
  - [x] 导出新增 coordinator / scheduler API

- [x] `src/governance.ts`（Phase C）
  - [x] 扩展可选调度指标字段

---

## 2) `packages/mcp-server`

## 2.1 修改工具入口

- [x] `src/tools/start-session.ts`
  - [x] acquire lease 后再 persistStartedSession
  - [x] acquire 冲突时返回结构化 ToolResult

- [x] `src/tools/end-session.ts`
  - [x] release lease
  - [x] 保持 end idempotent

- [ ] `src/tools/run-flow.ts`
  - [ ] load session + 参数补齐 + runExclusive

## 2.2 修改 server 组合层

- [x] `src/index.ts`
  - [x] 新增 `withSessionExecution` 包装器
  - [x] 与 `withPolicy` / `withPolicyAndAudit` 正确串联
  - [x] 仅给 session-bound 工具接入

## 2.3 可选（如需）

- [ ] `src/policy-guard.ts`
  - [ ] 如需要，增加调度前置检查结果的 reasonCode 映射

---

## 3) `packages/adapter-maestro`

原则：不新增调度职责，只保持执行器角色。

- [x] `src/index.ts`
  - [x] 确认不加入 queue/lease 状态逻辑
  - [x] 保持 runFlow / action 执行接口兼容

- [ ] `src/harness-config.ts`
  - [ ] 如 session 传入 `deviceId`，确保优先级一致（session > config 默认）

---

## 4) `packages/contracts`

原则：Phase A/B 尽量不改外部 contract；Phase C 仅增可选字段。

- [x] `src/types.ts`
  - [x] 若扩展调度可观测字段，保持 optional
  - [x] 不破坏 `Session` / `ToolResult` 现有消费方

- [ ] `session.schema.json` / `tool-result.schema.json`
  - [ ] 若字段入 schema，保持向后兼容

---

## 5) 配置与报告

- [ ] `configs/policies/session-audit-schema.yaml`
  - [ ] 如果增加 required_fields，要确认历史产物可迁移

- [x] `scripts/report/generate-phase-report.py`
  - [x] 新增并发指标汇总

- [x] `scripts/report/generate-acceptance-evidence.py`
  - [x] 新增并发指标展示

---

## 6) 测试文件建议

- [x] `packages/core/test/device-lease-store.test.ts`
- [x] `packages/core/test/session-scheduler.test.ts`
- [x] `packages/mcp-server/test/session-lease.test.ts`
- [x] `packages/mcp-server/test/session-scheduler.test.ts`
- [x] 更新已有 `session-persistence.test.ts`（确认新事件不破坏既有断言）

---

## 7) 最终验收命令（每阶段结束执行）

- [x] `pnpm typecheck`
- [x] `pnpm test:unit`
- [x] `pnpm build`

若有并发 smoke 脚本，再补：

- [x] `pnpm run validate:dry-run`
- [x] 并发自定义脚本（2 设备并行）
