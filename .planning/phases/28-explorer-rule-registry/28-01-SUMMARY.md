---
phase: 28-explorer-rule-registry
plan: 01
summary_type: internal-planning
task_type: feature
completed: 2026-04-29
requirements_completed:
  - EXPLORER-RULES-01
  - EXPLORER-RULES-02
  - EXPLORER-RULES-03
key_files:
  created:
    - packages/explorer/src/engine-helpers.ts
    - packages/explorer/src/rules/default-rules.ts
    - packages/explorer/src/rules/legacy-rule-adapter.ts
    - packages/explorer/src/rules/rule-evaluator.ts
    - packages/explorer/src/rules/rule-matcher.ts
    - packages/explorer/src/rules/rule-registry.ts
    - packages/explorer/src/rules/rule-types.ts
    - packages/explorer/tests/rules/default-rules.test.ts
    - packages/explorer/tests/rules/integration-rule-decisions.test.ts
    - packages/explorer/tests/rules/rule-evaluator.test.ts
    - packages/explorer/tests/rules/rule-matcher.test.ts
    - packages/explorer/tests/rules/rule-registry.test.ts
    - docs/engineering/explorer-rule-registry.zh-CN.md
  modified:
    - packages/explorer/src/config.ts
    - packages/explorer/src/engine.ts
    - packages/explorer/src/page-registry.ts
    - packages/explorer/src/report/markdown.ts
    - packages/explorer/src/report/summary.ts
    - packages/explorer/src/types.ts
    - packages/explorer/tests/config.test.ts
    - packages/explorer/tests/page-registry.test.ts
    - packages/explorer/tests/report/markdown.test.ts
    - packages/explorer/tests/report/summary.test.ts
    - docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md
repo_truth_synced:
  - packages/explorer/src/rules/**
  - packages/explorer/src/config.ts
  - packages/explorer/src/engine.ts
  - packages/explorer/src/report/summary.ts
  - packages/explorer/src/report/markdown.ts
  - docs/engineering/explorer-rule-registry.zh-CN.md
  - docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md
verify_file: 28-01-VERIFY.md
---

# Phase 28 Plan 01 Summary

## Meta

- Task ID: 28-01
- Date: 2026-04-29
- Repo: mobile-e2e-mcp
- Branch: feat/fix-android-explorer
- Owner: Hephaestus / OpenCode
- Type: feature

## Goal

### Problem

Explorer traversal decisions were split across defaults, samplers, page-context routing, heuristics, prioritization, and inline engine checks, making skip/sample/gate behavior hard to configure or explain.

### Expected Outcome

- [x] Default traversal rules are declared in a visible registry with stable IDs, categories, actions, reasons, support notes, and override semantics.
- [x] Legacy `samplingRules`, `skipPages`, `skipElements`, `blockedOwnerPackages`, destructive policy, and stateful policy remain compatible through adapters.
- [x] User `rules` config can add, disable, or override rules through existing config JSON.
- [x] `summary.json` and `report.md` expose rule-decision metadata.
- [x] Tests cover matcher, registry, evaluator, compatibility, reporting, config validation, and integration regressions.

### Non-goals

- No DFS/state-graph redesign.
- No new MCP tool.
- No OCR/CV-first or probabilistic default classification.
- No removal of legacy config fields.

## Plan

### Strategy

Implemented a focused rule subsystem under `packages/explorer/src/rules/`, wired the engine to build one effective registry, and preserved compatibility by projecting default and legacy fields into registry-backed decisions.

### Task Breakdown

1. Added shared rule types and safe matcher helpers.
2. Moved default sampling/skip/gate/risk vocabulary into `default-rules.ts` with stable IDs.
3. Added legacy adapters and registry builder with disabled IDs, project override, and diagnostics semantics.
4. Added evaluator APIs for page, element, and sampling rules.
5. Integrated the evaluator into `engine.ts` while extracting helper logic into `engine-helpers.ts` to keep `engine.ts` under the 1500-line limit.
6. Added rule decision ledger support to `types.ts`, `summary.ts`, `markdown.ts`, and `PageRegistry` metadata persistence.
7. Added docs and config validation.
8. Added integration regressions for Fonts navigation control, stateful form policy, and user overrides.

### Risks / Unknowns

- `pnpm validate:architecture-guardrails` still reports existing soft-limit warnings in adapter/server files unrelated to Phase 28; no failures were reported.
- Directory-level LSP scans still show pre-existing warnings in unrelated explorer files; modified files are clean.

### Done Criteria

- [x] Default skip/sampling/gating/risk behavior has stable rule IDs in `default-rules.ts`.
- [x] No new traversal policy regex was added directly to `engine.ts`; rule helpers live outside it.
- [x] Existing legacy config fields still work.
- [x] User rules can add, disable, or override behavior.
- [x] Summary and markdown reports explain rule decisions.
- [x] Docs explain rule config, precedence, examples, and report fields.

## Implement

### Changes

- `packages/explorer/src/rules/*` — new rule model, default catalog, legacy adapters, registry builder, evaluator, and safe matcher.
- `packages/explorer/src/config.ts` — default compatibility projections now come from the catalog; rule config validation added.
- `packages/explorer/src/engine.ts` / `engine-helpers.ts` — registry is built once and used for page/element/sampling decisions; helper extraction plus follow-up ledger wiring kept `engine.ts` under the 1500-line limit at 1383 lines.
- `packages/explorer/src/page-registry.ts` — persisted `ruleDecision` metadata from snapshots into page entries.
- `packages/explorer/src/report/summary.ts` / `markdown.ts` — added per-page and aggregate rule-decision output plus markdown table.
- `docs/engineering/explorer-rule-registry.zh-CN.md` — new user/contributor guide.
- `docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md` — linked high-fanout sampling to registry semantics.

### Key Decisions

- Phase 28 uses existing config JSON / `--config <path>` for rule config; no separate `--rules` CLI flag was added.
- Invalid regex patterns warn and match false instead of aborting traversal; invalid category/action values fail config loading.
- Unknown `disabledRuleIds` warn but do not abort, preserving safe migration behavior.
- Rule IDs are treated as stable report/config identifiers and should not be renamed casually.

### Notes

- `engine.ts` is now 1383 lines and below the user's 1500-line constraint.
- `engine-helpers.ts` centralizes reusable engine decision/recovery helpers.

### Deviations

- None — executed within planned scope. Optional standalone `--rules` CLI flag was intentionally not added and documented as unnecessary for v1.

## Verify

### Test Cases

- [x] Matcher tests cover path/title/element/platform/mode and invalid regex behavior.
- [x] Default catalog tests cover stable IDs and compatibility projections.
- [x] Registry tests cover built-ins, disabled IDs, project overrides, duplicate diagnostics, and legacy adapters.
- [x] Evaluator tests cover Fonts sampling, Bluetooth/SIM page skips, Help/FAQ skips, destructive/stateful policies.
- [x] Report tests cover `ruleDecision` summary and markdown output.
- [x] Config tests cover malformed categories/actions, invalid regex warnings, unknown disabled IDs, and valid rule config loading.
- [x] Integration regressions cover Fonts navigation-control classification, stateful policy skip/allow, and disabling default Help skip.

### Evidence Types

- [x] test
- [x] command
- [x] documentation readback
- [ ] screenshot
- [ ] log

### Evidence

```bash
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/report/summary.test.ts tests/report/markdown.test.ts
# pass 88, fail 0

pnpm --filter @mobile-e2e-mcp/explorer test -- tests/config.test.ts
# pass 112, fail 0

pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/integration-rule-decisions.test.ts
# pass 91, fail 0

pnpm --filter @mobile-e2e-mcp/explorer test
# pass 88, fail 0

pnpm --filter @mobile-e2e-mcp/explorer typecheck
# tsc -p tsconfig.json --noEmit passed

pnpm --filter @mobile-e2e-mcp/explorer build
# tsup build and DTS build passed

pnpm typecheck
# monorepo typecheck passed

pnpm build
# monorepo build passed

pnpm validate:architecture-guardrails
# passed; 6 existing warnings, 0 failures

pnpm test:ci
# build, typecheck, unit, and smoke validation completed without reported failure
```

Line-count check:

```text
packages/explorer/src/engine.ts: 1383 lines (OK)
packages/explorer/src/engine-helpers.ts: 375 lines (OK)
all checked touched files: <= 1500 lines
```

### Result

- ✅ Success

### Execution Metrics

- Verification scenarios run: matcher/registry/evaluator/config/report/integration/package/root validation.
- Environments checked: local monorepo command suite.
- Notable evidence count: 10 command groups plus LSP diagnostics on modified files.

## Retro

### What went well

- The rule subsystem stayed focused and testable, so the engine could remain a traversal coordinator instead of growing more policy logic.
- Extracting helpers reduced `engine.ts` below the 1500-line constraint while preserving behavior.

### What went wrong

- Task 6 initially had a bad patch placement in `summary.test.ts`, and `engine.ts` had stale duplicate helpers after extraction.

### Reusable Rule

- If a phase adds explainability to traversal decisions, add report tests and persistence tests together, because report formatting alone does not prove real engine decisions reach the report model.

### Optimization Ideas

- Run the line-count check immediately after any extraction affecting `engine.ts` so helper duplication is caught before tests fan out.

## Source-of-Truth Sync

- Formal repo truth affected: yes.
- Updated owners: `packages/explorer/src/rules/**`, `packages/explorer/src/config.ts`, `packages/explorer/src/engine.ts`, `packages/explorer/src/report/summary.ts`, `packages/explorer/src/report/markdown.ts`, `packages/explorer/src/types.ts`, explorer tests, and docs under `docs/engineering/`.

## Next Step

- Ready for review / PR preparation. No immediate Phase 28 follow-up is required unless reviewers request broader live-device evidence.
