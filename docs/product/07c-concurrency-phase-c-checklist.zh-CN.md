# Phase C 清单：观测收口与双设备 sync 预留（2 周）

> 目标：让调度行为“可解释、可审计、可回放”，并为双设备协同场景预留编排字段。

## C.1 timeline / audit 扩展（不破坏主结构）

- [x] 修改 `packages/core/src/session-store.ts`
  - [x] 增加调度事件写入辅助方法（如 `appendSessionSchedulerEvent`）
  - [ ] 事件类型建议：
    - [x] `queue_wait_started`
    - [x] `queue_wait_ended`
    - [x] `lease_acquired`
    - [x] `lease_released`
    - [x] `lease_recovered_stale`

- [x] 修改 `packages/core/src/governance.ts`
  - [x] 保持现有 audit 结构不破坏
  - [ ] 补充可选扩展字段（建议 optional）：
    - [x] `scheduler_metrics.queue_wait_ms`
    - [x] `scheduler_metrics.lease_conflicts`
    - [x] `scheduler_metrics.stale_recoveries`

- [ ] `configs/policies/session-audit-schema.yaml` 若要求强约束，新增字段时保持向后兼容（先 optional）

---

## C.2 报告与指标

- [x] 更新 `scripts/report/generate-phase-report.py`
  - [x] 统计 `queue_wait_ms` 分布（p50/p95）
  - [x] 统计 `lease_conflict_count`
  - [x] 统计 `stale_lease_recovered_count`

- [x] 更新 `scripts/report/generate-acceptance-evidence.py`
  - [x] 汇总并发相关指标到 acceptance evidence

- [ ] 更新 `reports/*` 样例（若仓库维护样例产物）

---

## C.3 双设备 sync 预留（只做预留，不做完整编排）

- [x] 在 `core` 内部模型增加可选字段：
  - [x] `coordinationKey?: string`
  - [x] `barrierId?: string`

- [ ] 在 `mcp-server` 执行包装器透传内部上下文（不变更外部 MCP contract）
- [ ] 文档补充：后续新增 `multi-device orchestrator` 时复用当前租约与守卫

---

## C.4 测试与验收（Phase C）

- [ ] 新增/更新审计测试：验证调度事件可追溯
- [ ] 报告脚本测试：并发指标能正确聚合
- [ ] 回归执行：并发回归一周（或至少多批次）观察 flake 变化

Phase C 通过条件：

- [x] 调度行为在 session timeline 与 audit 中可解释
- [x] 指标进入报告链路
- [x] 双设备协同已有稳定扩展点（无需重构当前调度层）
