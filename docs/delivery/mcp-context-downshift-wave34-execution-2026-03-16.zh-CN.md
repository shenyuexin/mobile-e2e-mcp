# MCP Context Downshift Wave 3/4 执行记录（2026-03-16）

## 1. 范围

Wave 3：

- `collect_debug_evidence`
- `get_screen_summary`

Wave 4：

- `run_flow`
- `perform_action_with_evidence`
- `recover_to_known_state`
- `replay_last_stable_path`
- `resolve_interruption`
- `resume_interrupted_action`

目标：运行上下文统一从 active session 继承，保留业务参数显式。

## 2. 代码变更

- `packages/contracts/src/types.ts`
  - `CollectDebugEvidenceInput/GetScreenSummaryInput/RunFlowInput` 的 `platform` 改为 optional。
- `packages/mcp-server/src/index.ts`
  - Wave 3/4 上述工具统一加 `withSessionExecution(..., { requireResolvedSessionContext: true })`。
- `packages/adapter-maestro/src/index.ts`
  - 为 `collect_debug_evidence/get_screen_summary/run_flow` 增加缺 platform 结构化失败兜底。
- `packages/mcp-server/test/stdio-server.test.ts`
  - 新增 Wave 3/4 sessionId-only 正向与 missing session 负向测试。

## 3. 验证

- `pnpm test:mcp-server` ✅（180 passed / 0 failed）

## 4. 参数缩短统计（计划 §7.2）

| 工具 | 改造前参数 | 改造后参数 | 降幅 |
|---|---:|---:|---:|
| collect_debug_evidence | 4 (`sessionId,platform,deviceId,appId`) | 2 (`sessionId,appId?`) | 50.0% |
| get_screen_summary | 2 (`sessionId,platform`) | 1 (`sessionId`) | 50.0% |
| run_flow | 3 (`sessionId,platform,runCount`) | 2 (`sessionId,runCount?`) | 33.3% |
| perform_action_with_evidence | 3 (`sessionId,platform,action`) | 2 (`sessionId,action`) | 33.3% |
| recover_to_known_state | 3 (`sessionId,platform,deviceId`) | 1 (`sessionId`) | 66.7% |
| replay_last_stable_path | 3 (`sessionId,platform,deviceId`) | 1 (`sessionId`) | 66.7% |
| resolve_interruption | 3 (`sessionId,platform,signals/classification`) | 2 (`sessionId,signals/classification?`) | 33.3% |
| resume_interrupted_action | 3 (`sessionId,platform,checkpoint`) | 2 (`sessionId,checkpoint?`) | 33.3% |

Wave 3/4 中位数降幅：**41.7%**。
