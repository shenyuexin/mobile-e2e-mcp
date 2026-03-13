# 并发调度改造总清单（可执行版）

> 目标：基于当前仓库实现（`mcp-server -> adapter-maestro -> core`）逐步落地“设备租约 + 会话并发调度”，并为后续双设备 sync 编排预留能力。

## 1. 使用方式（先读）

按以下顺序执行：

1. `07a-concurrency-phase-a-checklist.zh-CN.md`（基础租约）
2. `07b-concurrency-phase-b-checklist.zh-CN.md`（会话工具并发守卫）
3. `07c-concurrency-phase-c-checklist.zh-CN.md`（观测与 sync 预留）
4. `07d-concurrency-package-file-checklist.zh-CN.md`（逐文件核对，不漏改）

每完成一个阶段，务必运行该阶段文档里的验证命令和验收项。

---

## 2. 目标边界（防止过度设计）

### 必做

- [ ] 同一 `deviceId` 在任意时刻只允许一个 session 执行设备操作
- [ ] 不同 `deviceId` 的 session 可并发执行
- [ ] `start_session` 获取租约、`end_session` 释放租约
- [ ] `run_flow`/`perform_action_with_evidence` 等 session-bound 工具进入统一执行守卫
- [ ] 调度事件写入 session timeline，保留审计可追溯性

### 暂不做（本轮排除）

- [ ] 不引入分布式队列/外部 DB（Redis/Kafka 等）
- [ ] 不在 `adapter-maestro` 内实现调度逻辑
- [ ] 不做云设备农场集成（后续 Device Provider 阶段）

---

## 3. 分阶段里程碑

## Phase A（基础租约，2 周）

- [ ] 新增 `core` 租约存储与租约管理
- [ ] `start_session` 与 `end_session` 接入 acquire/release
- [ ] 基础冲突处理（busy/unavailable）

完成定义：同一设备无法重复租约，session 生命周期和租约生命周期一致。

## Phase B（会话并发守卫，2~3 周）

- [ ] 增加统一 `withSessionExecution` 包装器
- [ ] `run_flow` 从“直接转发”升级为“加载 session + 执行守卫 + 调用 adapter”
- [ ] 将 session-bound 工具统一走守卫
- [ ] stale lease 回收（TTL + heartbeat）

完成定义：并发压力下无设备抢占冲突，session 工具执行顺序可解释。

## Phase C（观测收口 + 双设备 sync 预留，2 周）

- [ ] timeline 增加 lease/scheduler 事件
- [ ] 报告补充 queue wait / lease conflict 等指标
- [ ] 预留 `coordinationKey`/`barrierId`（内部字段，不破坏 MCP 外部 contract）

完成定义：调度行为可追溯，可为后续双设备编排复用。

---

## 4. 设计约束（必须遵守）

- [ ] 调度状态归属 `packages/core`
- [ ] 工具编排归属 `packages/mcp-server`
- [ ] 设备执行归属 `packages/adapter-maestro`
- [ ] 不破坏现有 `Session` / `ToolResult` 主干结构
- [ ] 保持 `end_session` 幂等语义

---

## 5. 风险清单与止损策略

- [ ] 风险：stdio 每次请求重建 server 导致内存态锁失效
  - 策略：租约状态落盘（`core` 文件存储）作为真实状态源
- [ ] 风险：调度状态混入 `latestStateSummary`，污染 UI 状态语义
  - 策略：调度信息写 timeline event，不侵入 UI state summary
- [ ] 风险：改造范围过大导致回归不稳定
  - 策略：按阶段灰度；每阶段只扩一批工具

---

## 6. 完工判定（总）

- [ ] 单设备并发冲突测试通过
- [ ] 多设备并发基线测试通过
- [ ] 全量类型检查通过
- [ ] 关键单元测试通过
- [ ] 调度事件在 session/audit 中可追溯
