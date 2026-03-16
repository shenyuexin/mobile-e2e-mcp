# MCP Context Downshift Wave 1A 执行记录（2026-03-16）

## 1. 变更范围

Wave 1A 目标：`inspect_ui` / `query_ui` / `resolve_ui_target` / `wait_for_ui` 支持 sessionId-first 调用，并在 session 缺失或冲突时返回结构化错误。

## 2. 变更文件

- `packages/mcp-server/src/index.ts`
- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/index.ts`
- `packages/mcp-server/test/stdio-server.test.ts`
- `docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`

## 3. 核心实现

1. MCP 层将 4 个 Wave 1A 工具接入 `withSessionExecution(..., { requireResolvedSessionContext: true })`；
2. 合同层允许 Wave 1A 输入从 session 继承 `platform`（`InspectUiInput` 及其关联输入）；
3. 适配器层为 Wave 1A 工具补齐 `platform` 缺失时的结构化 `CONFIGURATION_ERROR`；
4. 保持显式参数优先，显式 `platform` 与 active session 冲突时返回 `CONFIGURATION_ERROR`。

## 4. 测试覆盖（新增）

新增/更新用例（`packages/mcp-server/test/stdio-server.test.ts`）：

- `handleRequest resolves inspect_ui/query_ui/resolve_ui_target/wait_for_ui context from active session`
- `handleRequest returns configurationError for sessionId-only Wave 1A call when session is missing`
- `handleRequest returns configurationError for sessionId-only Wave 1A call when session is closed`
- `handleRequest rejects Wave 1A call when explicit platform mismatches active session`

## 5. 验证结果

- `pnpm test:mcp-server` ✅（173 passed / 0 failed）
- `pnpm build` ✅
- `pnpm typecheck` ✅

## 6. 调用示例（dry-run）

### 6.1 sessionId-first 正向示例

```text
mobile-e2e-mcp_query_ui({sessionId:'<sid>', contentDesc:'View products', dryRun:true})
```

预期：`status=success`，`reasonCode=OK`（Android dry-run）；运行上下文由 active session 继承。

### 6.2 负向示例（missing session）

```text
mobile-e2e-mcp_inspect_ui({sessionId:'<missing-sid>', dryRun:true})
```

预期：`status=failed`，`reasonCode=CONFIGURATION_ERROR`，并带 `sessionFound=false`。

## 7. 参数缩短统计（按计划 §7.2 口径，必填）

统计口径：仅统计 MCP 调用体内业务参数，不统计外层客户端命令包装。

| 工具 | 改造前（参数个数） | 改造后（参数个数） | 降幅 |
|---|---:|---:|---:|
| inspect_ui | 3 (`sessionId,platform,deviceId`) | 1 (`sessionId`) | 66.7% |
| query_ui | 3 (`sessionId,platform,selector`) | 2 (`sessionId,selector`) | 33.3% |
| resolve_ui_target | 3 (`sessionId,platform,selector`) | 2 (`sessionId,selector`) | 33.3% |
| wait_for_ui | 4 (`sessionId,platform,selector,timeoutMs`) | 3 (`sessionId,selector,timeoutMs`) | 25.0% |

Wave 1A 中位数降幅：**33.3%**。

说明：Wave 1A 保留选择器/等待参数显式输入，因此降幅低于全量目标；后续 Wave 1B/2/3/4 累计后再评估整体中位数目标。

## 8. 回滚演练

回滚方案：恢复 Wave 1A 相关工具在 `mcp-server/src/index.ts` 的 `withPolicy` 直连，并撤销 Wave 1A 合同 optional 字段。

回滚后验证命令（演练脚本）：

```bash
pnpm test:mcp-server && pnpm build && pnpm typecheck
```

本次未执行实际回滚，仅完成可执行回滚步骤与验证命令固化。
