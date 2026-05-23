---
phase: 21-test-quality-hardening
plan: 03
summary_type: internal-planning
task_type: test-infrastructure
completed: 2026-05-12
requirements_completed:
  - TEST-21-COVERAGE-BASELINE
  - TEST-21-UNTESTED-TOOLS
  - TEST-21-OUTPUT-CONTRACTS
key_files:
  created:
    - docs/testing/coverage-baseline.md
    - packages/mcp-server/test/untested-tools.test.ts
  modified:
    - package.json
    - packages/core/package.json
    - packages/adapter-vision/package.json
    - packages/adapter-maestro/package.json
    - packages/mcp-server/package.json
    - packages/mcp-server/test/tool-output-contracts.test.ts
repo_truth_synced:
  - docs/testing/coverage-baseline.md
  - packages/mcp-server/test/untested-tools.test.ts
  - packages/mcp-server/test/tool-output-contracts.test.ts
verify_file: 21-03-VERIFY.md
---

# Phase 21 Plan 03 Summary

## Completed

- Added repository and package-level coverage scripts using the c8/V8 coverage wrapper.
- Recorded a coverage baseline in `docs/testing/coverage-baseline.md`.
- Added behavioral dry-run tests for previously untested MCP tools in `packages/mcp-server/test/untested-tools.test.ts`.
- Upgraded tool output contract validation to use `ajv`.

## Deferred

- Stdio-server test consolidation remains deferred as planned because it is mostly maintenance refactoring, not a correctness improvement.

## Boundary

This plan covers systemic infrastructure. It does not imply every medium-score test file from `21-02-PLAN.md` has been strengthened.
