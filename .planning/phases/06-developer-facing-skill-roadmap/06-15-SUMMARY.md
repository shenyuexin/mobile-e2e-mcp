---
phase: 06-developer-facing-skill-roadmap
plan: 15
summary_type: implementation
task_type: feature
completed: 2026-03-28
requirements_completed: []
key_files:
  modified:
    - packages/contracts/src/types.ts
    - packages/contracts/src/index.ts
    - packages/adapter-maestro/src/action-outcome.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts
    - packages/mcp-server/test/server.test.ts
    - packages/mcp-server/test/stdio-server.test.ts
    - docs/guides/ai-agent-invocation.zh-CN.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
  created:
    - packages/adapter-maestro/src/readiness-guidance.ts
    - .planning/phases/06-developer-facing-skill-roadmap/06-15-PLAN.md
    - .planning/phases/06-developer-facing-skill-roadmap/06-15-VERIFY.md
repo_truth_synced:
  - packages/contracts/src/types.ts
  - packages/contracts/src/index.ts
  - packages/adapter-maestro/src/action-outcome.ts
  - packages/adapter-maestro/src/readiness-guidance.ts
  - packages/mcp-server/src/index.ts
  - docs/guides/ai-agent-invocation.zh-CN.md
verify_file: 06-15-VERIFY.md
---

# Phase 06 Plan 15 Summary

## Meta
- Task ID: 06-15
- Date: 2026-03-28
- Repo: mobile-e2e-mcp
- Branch: current workspace
- Owner: OpenCode agent

## Goal

Make the existing MCP remediation chain automatically use the validated readiness-skill logic so developers do not need separate agent-side skill calls.

## Result

- Added `skillGuidance` to the remediation contract.
- Wired baseline + Android + iOS guidance into `suggest_known_remediation`.
- Passed Android-oriented server/stdio tests and manually verified Android + iOS `skillGuidance` output through the existing server invocation path.

## Next Step

- Future follow-on: consider whether `explain_last_failure` or `collect_debug_evidence` should also expose the same guidance layer, or whether the current single-entry remediation integration is sufficient.
