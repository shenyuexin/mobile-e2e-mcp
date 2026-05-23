# Phase 22 Verification

## Evidence Checked

- `packages/contracts/src/constants/tool-names.ts` includes `navigateBack: "navigate_back"`.
- `packages/contracts/src/types.ts` defines `NavigateBackInput`, `NavigateBackData`, and back execution path values.
- `packages/mcp-server/src/server.ts` exposes `navigate_back` in the tool contract map.
- `packages/mcp-server/src/index.ts` registers the tool descriptor and handler.
- `packages/mcp-server/src/tools/navigate-back.ts` delegates to adapter-maestro.
- `packages/adapter-maestro/src/ui-action-back.ts` implements platform-specific behavior and post-back verification.
- `packages/adapter-maestro/src/capability-model.ts` reports Android full support and iOS conditional support.
- Tests reference `navigate_back` in server, stdio/tool catalog, output contract, and adapter coverage.
- README and `docs/guides/ai-agent-invocation.zh-CN.md` list the tool and iOS boundary.

## Result

Phase 22 can be marked complete.

## Remaining Risk

No fresh verification command was run during this documentation sync.
