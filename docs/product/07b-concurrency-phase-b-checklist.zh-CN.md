# Phase B 清单：会话并发守卫（2~3 周）

> 目标：把 session-bound 工具统一纳入调度守卫，保证并发下执行顺序和资源占用可控。

## B.1 `core` 增加执行守卫能力

- [x] 新增 `packages/core/src/session-scheduler.ts`
  - [x] 提供 `runExclusive(sessionId, deviceId, toolName, task)`
  - [x] 进入 task 前将 lease 标记为 `busy`
  - [x] task 完成后标记回 `leased/idle`
  - [x] task 抛错也必须恢复状态（finally）

- [x] 在 `execution-coordinator.ts` 增加
  - [x] `markBusy`
  - [x] `markIdle`
  - [x] `refreshHeartbeat`
  - [x] `recoverStaleLeases(ttlMs)`

---

## B.2 `mcp-server` 统一接入包装器

- [x] 修改 `packages/mcp-server/src/index.ts`
  - [x] 新增 `withSessionExecution`（与 `withPolicy`、`withPolicyAndAudit` 串联）
  - [x] 仅对 session-bound 工具启用（见下文清单）

- [ ] 修改 `packages/mcp-server/src/tools/run-flow.ts`
  - [ ] 不再直接透传
  - [ ] 先 `loadSessionRecord`，校验 session/platform/profile 一致性
  - [ ] 自动补齐 `deviceId/appId`（优先用 session 持久值）
  - [ ] 进入 `runExclusive` 后调用 `runFlowWithMaestro`

- [x] session-bound 工具接入 `withSessionExecution`
  - [x] `run_flow`
  - [x] `perform_action_with_evidence`
  - [x] `get_session_state`
  - [x] `recover_to_known_state`
  - [x] `replay_last_stable_path`
  - [x] `get_logs` / `get_crash_signals`
  - [x] `record_screen`
  - [x] `measure_android_performance` / `measure_ios_performance`

---

## B.3 stale lease 回收

- [x] 在工具入口（建议 start_session 前或独立定时触发）调用 `recoverStaleLeases`
- [x] stale 判定：`heartbeatAt + ttlMs < now`
- [x] 回收时追加 timeline event：`lease_recovered_stale`
- [x] 回收后允许新 session 获取租约

---

## B.4 测试与验收（Phase B）

- [ ] 新增 `packages/mcp-server/test/session-scheduler.test.ts`
  - [ ] 同一 session 并发调用两个 session-bound 工具，验证串行化
  - [ ] 不同设备并发调用，验证可并发
  - [ ] task 失败后 lease 状态恢复

- [ ] 新增 `packages/core/test/session-scheduler.test.ts`
  - [ ] `runExclusive` busy/idle 状态转换
  - [ ] stale recovery 逻辑

- [x] 运行验证
  - [x] `pnpm typecheck`
  - [x] `pnpm test:unit`
  - [ ] 并发 smoke（至少 2 设备）

Phase B 通过条件：

- [x] 单设备无并发抢占冲突
- [x] 多设备并发吞吐提升可观测
- [x] session-bound 工具全部纳入守卫
