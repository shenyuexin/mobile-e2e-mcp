# MCP Context Downshift Wave 2 执行记录（2026-03-16）

## 1. 范围

Wave 2 工具：

- `tap`
- `type_text`
- `take_screenshot`
- `record_screen`
- `get_logs`
- `get_crash_signals`
- `collect_diagnostics`

目标：调用从 `sessionId + platform(+deviceId)` 收敛到 `sessionId + 业务参数`。

## 2. 代码变更

- `packages/contracts/src/types.ts`
  - 将 Wave 2 输入中的 `platform` 改为 optional。
- `packages/mcp-server/src/index.ts`
  - 上述工具统一接入 `withSessionExecution(..., { requireResolvedSessionContext: true })`。
- `packages/adapter-maestro/src/index.ts`
  - 补齐缺 `platform` 的结构化 `CONFIGURATION_ERROR`。
- `packages/mcp-server/test/stdio-server.test.ts`
  - 新增 Wave 2 sessionId-only 正向与 missing session 负向验证。

## 3. 验证

- `pnpm test:mcp-server` ✅（180 passed / 0 failed）

## 4. 参数缩短统计（计划 §7.2）

| 工具 | 改造前参数 | 改造后参数 | 降幅 |
|---|---:|---:|---:|
| tap | 5 (`sessionId,platform,deviceId,x,y`) | 3 (`sessionId,x,y`) | 40.0% |
| type_text | 4 (`sessionId,platform,deviceId,text`) | 2 (`sessionId,text`) | 50.0% |
| take_screenshot | 4 (`sessionId,platform,deviceId,outputPath`) | 2 (`sessionId,outputPath?`) | 50.0% |
| record_screen | 5 (`sessionId,platform,deviceId,durationMs,outputPath`) | 3 (`sessionId,durationMs?,outputPath?`) | 40.0% |
| get_logs | 4 (`sessionId,platform,deviceId,lines`) | 3 (`sessionId,lines?,query?`) | 25.0% |
| get_crash_signals | 5 (`sessionId,platform,deviceId,appId,lines`) | 3 (`sessionId,appId?,lines?`) | 40.0% |
| collect_diagnostics | 3 (`sessionId,platform,deviceId`) | 1 (`sessionId`) | 66.7% |

Wave 2 中位数降幅：**40.0%**。
