# 并发调度逐文件改造清单（按包执行）

> 用法：开发时按本清单逐项打勾，避免漏改。此文档与 07a/07b/07c 阶段清单交叉使用。

## 1) `packages/core`

## 1.1 新增文件

- [ ] `src/device-lease-store.ts`
  - [ ] 定义 lease 数据结构
  - [ ] 实现 load/persist/remove
  - [ ] 原子写

- [ ] `src/execution-coordinator.ts`
  - [ ] `acquireLease`
  - [ ] `releaseLease`
  - [ ] `markBusy` / `markIdle`
  - [ ] `recoverStaleLeases`

- [ ] `src/session-scheduler.ts`
  - [ ] `runExclusive`
  - [ ] 异常路径 finally 恢复

## 1.2 修改文件

- [ ] `src/session-store.ts`
  - [ ] 增加 scheduler/lease 事件追加方法
  - [ ] 保证不污染 `latestStateSummary` 的 UI 语义

- [ ] `src/index.ts`
  - [ ] 导出新增 coordinator / scheduler API

- [ ] `src/governance.ts`（Phase C）
  - [ ] 扩展可选调度指标字段

---

## 2) `packages/mcp-server`

## 2.1 修改工具入口

- [ ] `src/tools/start-session.ts`
  - [ ] acquire lease 后再 persistStartedSession
  - [ ] acquire 冲突时返回结构化 ToolResult

- [ ] `src/tools/end-session.ts`
  - [ ] release lease
  - [ ] 保持 end idempotent

- [ ] `src/tools/run-flow.ts`
  - [ ] load session + 参数补齐 + runExclusive

## 2.2 修改 server 组合层

- [ ] `src/index.ts`
  - [ ] 新增 `withSessionExecution` 包装器
  - [ ] 与 `withPolicy` / `withPolicyAndAudit` 正确串联
  - [ ] 仅给 session-bound 工具接入

## 2.3 可选（如需）

- [ ] `src/policy-guard.ts`
  - [ ] 如需要，增加调度前置检查结果的 reasonCode 映射

---

## 3) `packages/adapter-maestro`

原则：不新增调度职责，只保持执行器角色。

- [ ] `src/index.ts`
  - [ ] 确认不加入 queue/lease 状态逻辑
  - [ ] 保持 runFlow / action 执行接口兼容

- [ ] `src/harness-config.ts`
  - [ ] 如 session 传入 `deviceId`，确保优先级一致（session > config 默认）

---

## 4) `packages/contracts`

原则：Phase A/B 尽量不改外部 contract；Phase C 仅增可选字段。

- [ ] `src/types.ts`
  - [ ] 若扩展调度可观测字段，保持 optional
  - [ ] 不破坏 `Session` / `ToolResult` 现有消费方

- [ ] `session.schema.json` / `tool-result.schema.json`
  - [ ] 若字段入 schema，保持向后兼容

---

## 5) 配置与报告

- [ ] `configs/policies/session-audit-schema.yaml`
  - [ ] 如果增加 required_fields，要确认历史产物可迁移

- [ ] `scripts/report/generate-phase-report.py`
  - [ ] 新增并发指标汇总

- [ ] `scripts/report/generate-acceptance-evidence.py`
  - [ ] 新增并发指标展示

---

## 6) 测试文件建议

- [ ] `packages/core/test/device-lease-store.test.ts`
- [ ] `packages/core/test/session-scheduler.test.ts`
- [ ] `packages/mcp-server/test/session-lease.test.ts`
- [ ] `packages/mcp-server/test/session-scheduler.test.ts`
- [ ] 更新已有 `session-persistence.test.ts`（确认新事件不破坏既有断言）

---

## 7) 最终验收命令（每阶段结束执行）

- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm build`

若有并发 smoke 脚本，再补：

- [ ] `pnpm run validate:dry-run`
- [ ] 并发自定义脚本（2 设备并行）
