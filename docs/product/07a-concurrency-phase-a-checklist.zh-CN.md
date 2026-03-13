# Phase A 清单：基础租约（2 周）

> 目标：先建立“设备租约”这一条硬边界，保证同一设备不会被多个 session 抢占。

## A.1 `core` 新增租约模型与存储

- [x] 新增 `packages/core/src/device-lease-store.ts`
  - [x] 定义 `DeviceLease`、`DeviceLeaseState`、`LeaseConflict` 类型
  - [x] 增加 `buildDeviceLeaseRecordRelativePath`（建议：`artifacts/leases/{platform}-{deviceId}.json`）
  - [x] 提供 `loadLeaseByDevice` / `persistLease` / `removeLease`
  - [x] 写入采用“临时文件 + rename”保证原子性（对齐 `session-store` 风格）

- [x] 新增 `packages/core/src/execution-coordinator.ts`
  - [x] 提供 `acquireLease` / `releaseLease`
  - [ ] 返回统一冲突语义：`busy | unavailable`
  - [x] 记录 `ownerPid`、`acquiredAt`、`heartbeatAt`

- [x] 更新 `packages/core/src/index.ts` 导出新能力

---

## A.2 `mcp-server` 接入 session 生命周期

- [x] 修改 `packages/mcp-server/src/tools/start-session.ts`
  - [x] 在 `resolveSessionDefaults` 得到 `deviceId` 后调用 `acquireLease`
  - [x] acquire 失败时返回可解释 `ToolResult`（不要抛裸错误）
  - [x] acquire 成功后再 `persistStartedSession`
  - [x] timeline 增加 `lease_acquired`

- [x] 修改 `packages/mcp-server/src/tools/end-session.ts`
  - [x] 在 `persistEndedSession` 后调用 `releaseLease`
  - [x] 若租约不存在，保持 end_session 幂等成功
  - [x] timeline 增加 `lease_released`

---

## A.3 测试与验收（Phase A）

- [x] 新增测试：`packages/mcp-server/test/session-lease.test.ts`
  - [x] case1：同设备 session1 已 acquire，session2 start 应失败（busy）
  - [x] case2：session1 end 后 session2 start 应成功
  - [x] case3：重复 end_session 仍成功（幂等）

- [x] 新增测试：`packages/core/test/device-lease-store.test.ts`
  - [ ] 读写一致性
  - [ ] 原子写覆盖
  - [ ] remove 后不存在

- [x] 运行验证
  - [x] `pnpm typecheck`
  - [x] `pnpm test:unit`

Phase A 通过条件：

- [x] 同一设备不会被重复租约
- [x] session 生命周期与租约生命周期一致
- [x] 无破坏现有 start/end 行为与审计文件生成
