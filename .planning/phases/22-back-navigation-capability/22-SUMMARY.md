---
phase: 22-back-navigation-capability
plan: 01
summary_type: internal-planning
task_type: capability
completed: 2026-05-12
requirements_completed:
  - NAV-BACK-01
  - NAV-BACK-02
  - NAV-BACK-03
key_files:
  modified:
    - packages/contracts/src/constants/tool-names.ts
    - packages/contracts/src/types.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/tools/navigate-back.ts
    - packages/adapter-maestro/src/ui-action-back.ts
    - packages/adapter-maestro/src/capability-model.ts
    - packages/adapter-maestro/test/navigate-back.test.ts
    - packages/mcp-server/test/server.test.ts
    - packages/mcp-server/test/tool-output-contracts.test.ts
    - README.md
    - docs/guides/ai-agent-invocation.zh-CN.md
repo_truth_synced:
  - packages/contracts/src/constants/tool-names.ts
  - packages/contracts/src/types.ts
  - packages/mcp-server/src/server.ts
  - packages/mcp-server/src/index.ts
  - packages/mcp-server/src/tools/navigate-back.ts
  - packages/adapter-maestro/src/ui-action-back.ts
  - packages/adapter-maestro/src/capability-model.ts
  - README.md
  - docs/guides/ai-agent-invocation.zh-CN.md
verify_file: 22-VERIFY.md
---

# Phase 22 Summary

## Completed

- Added `navigate_back` as a first-class MCP tool.
- Added contract types and tool-name constants for `NavigateBackInput` and `NavigateBackData`.
- Wired MCP server registration and a thin `tools/navigate-back.ts` wrapper.
- Implemented Android deterministic back dispatch through `android_keyevent`.
- Kept iOS boundaries explicit: app-level selector/edge-swipe paths are conditional, and system-level back remains unsupported.
- Added post-back verification fields including page identity and tree-hash evidence.
- Added server, contract, capability, and adapter tests.
- Updated README and AI invocation guidance to list `navigate_back` with platform caveats.

## Follow-Up

- Integrating back into broader `perform_action_with_evidence` action intent remains a future slice.
- iOS system-level parity remains unsupported until a real runtime primitive exists.
