# MCP Context Downshift Wave 1B 执行记录（2026-03-16）

## 1. 变更范围

Wave 1B 目标：`tap_element` / `type_into_element` / `scroll_and_resolve_ui_target` / `scroll_and_tap_element` 支持 sessionId-first 调用，并保持选择器/输入值显式传入。

## 2. 变更文件

- `packages/mcp-server/src/index.ts`
- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/index.ts`
- `packages/mcp-server/test/stdio-server.test.ts`
- `docs/delivery/cli-mcp-tool-checklist-2026-03-16.zh-CN.md`

## 3. 实现摘要

1. MCP 层：4 个 Wave 1B 工具接入 `withSessionExecution(..., { requireResolvedSessionContext: true })`；
2. 合同层：Wave 1B 相关 `platform` 改为 optional，以支持会话继承；
3. 适配器层：4 个工具增加缺 `platform` 时结构化 `CONFIGURATION_ERROR` 兜底；
4. 冲突语义：显式 `platform` 与 active session 平台冲突时统一 `CONFIGURATION_ERROR`。

## 4. 测试覆盖

新增用例（`packages/mcp-server/test/stdio-server.test.ts`）：

- `handleRequest resolves Wave 1B context from active session`
- `handleRequest returns configurationError for sessionId-only Wave 1B call when session is missing`
- `handleRequest returns configurationError for sessionId-only Wave 1B call when session is closed`
- `handleRequest rejects Wave 1B call when explicit platform mismatches active session`

## 5. 验证结果

- `pnpm test:mcp-server` ✅（177 passed / 0 failed）
- `pnpm build` ✅
- `pnpm typecheck` ✅

## 6. 调用示例

### 6.1 正向（sessionId-first）

```text
mobile-e2e-mcp_tap_element({sessionId:'<sid>', contentDesc:'View products', dryRun:true})
mobile-e2e-mcp_type_into_element({sessionId:'<sid>', contentDesc:'Search', value:'hello', dryRun:true})
```

### 6.2 负向（missing session）

```text
mobile-e2e-mcp_scroll_and_resolve_ui_target({sessionId:'<missing-sid>', contentDesc:'View products', dryRun:true})
```

预期：`status=failed`、`reasonCode=CONFIGURATION_ERROR`。

## 7. 参数缩短统计（按计划 §7.2）

统计口径：仅统计 MCP 调用体内业务参数，不统计工具名与外层客户端包装。

| 工具 | 改造前（参数个数） | 改造后（参数个数） | 降幅 |
|---|---:|---:|---:|
| tap_element | 3 (`sessionId,platform,selector`) | 2 (`sessionId,selector`) | 33.3% |
| type_into_element | 4 (`sessionId,platform,selector,value`) | 3 (`sessionId,selector,value`) | 25.0% |
| scroll_and_resolve_ui_target | 4 (`sessionId,platform,selector,maxSwipes`) | 3 (`sessionId,selector,maxSwipes`) | 25.0% |
| scroll_and_tap_element | 4 (`sessionId,platform,selector,maxSwipes`) | 3 (`sessionId,selector,maxSwipes`) | 25.0% |

Wave 1B 中位数降幅：**25.0%**。

## 8. 回滚说明

回滚步骤：

1. 将 Wave 1B 工具从 `withSessionExecution` 恢复为 `withPolicy` 直连；
2. 回退 Wave 1B 合同 optional 字段；
3. 回退 checklist 文案；
4. 执行：`pnpm test:mcp-server && pnpm build && pnpm typecheck`。
