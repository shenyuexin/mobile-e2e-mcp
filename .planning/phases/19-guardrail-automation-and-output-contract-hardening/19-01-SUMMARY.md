# Phase 19 Plan 01 — Summary

**Phase:** 19-guardrail-automation-and-output-contract-hardening
**Plan:** 01
**Title:** Automate architecture guardrails and harden tool output contracts
**Status:** completed
**Date:** 2026-04-08

## Objective

Turn architecture guardrails from prose-only review discipline into executable CI checks, and add tool-specific output payload validation for the 6 highest-value AI-facing tools on top of the shared `ToolResult` envelope.

## What Was Done

### Workstream A — Guardrail Automation

1. **Created `scripts/validate-architecture-guardrails.ts`** — repo-local architecture guardrail validator with 6 check categories:
   - **Hotspot file size reporting**: 6 known hotspot files monitored with soft (500 lines → warn) and hard (1500 lines → warn-first, per rollout policy) limits
   - **Thin-facade boundary enforcement**: Detects forbidden patterns in `adapter-maestro/src/index.ts` (direct platform commands, platform branching, network logic)
   - **Platform leakage detection**: Pure model/config modules must not import execution-side logic
   - **Dependency direction validation**: No reverse imports from focused modules into orchestration modules
   - **Tool catalog drift**: Compares registered tool names in MCP server index against backtick-wrapped references in README and README.zh-CN.md
   - **PR template completeness**: Verifies required capability-impact sections exist in `.github/PULL_REQUEST_TEMPLATE.md`

2. **Extracted `ui-action-tools.ts` from 2002 → 1180 lines** (under 1500 target):
   - **`ui-action-tools-ios-physical.ts`** (~370 lines): iOS physical action execution helpers (flow paths, evidence persistence, startup failure classification, fallback execution)
   - **`ui-action-scroll.ts`** (~546 lines): `scrollAndResolveUiTargetWithMaestroTool` — the scroll+resolve loop for both Android and iOS
   - All original exports preserved via re-exports; behavioral equivalence maintained

3. **Wired into CI**: Added `architecture-guardrails` job to `.github/workflows/ci.yml` running on `ubuntu-latest`, depending on `unit-and-typecheck`

### Workstream B — Tool Output Contract Hardening

4. **Created `packages/contracts/tool-data-schemas/`** — 6 Tier 1 tool output payload schemas:
   - `perform_action_with_evidence.schema.json` — primary AI-facing action execution tool
   - `get_action_outcome.schema.json` — action outcome retrieval
   - `explain_last_failure.schema.json` — deterministic failure attribution
   - `rank_failure_candidates.schema.json` — failure cause ranking
   - `describe_capabilities.schema.json` — platform capability profile
   - `get_session_state.schema.json` — session state summary
   - `index.json` — schema registry with tier metadata

5. **Created `scripts/validate-tool-output-contracts.ts`** — zero-dependency validator that:
   - Validates ToolResult envelope integrity (8 required fields)
   - Validates synthetic payloads against each Tier 1 schema
   - Checks MCP registry completeness for all 6 Tier 1 tools

6. **Created `packages/mcp-server/test/tool-output-contracts.test.ts`** — 24 test cases:
   - Schema metadata completeness (6 sub-tests)
   - Valid payload passes validation (6 sub-tests)
   - Invalid payload fails validation (6 sub-tests)
   - ToolResult envelope required fields (1 test)
   - Schema index completeness (1 test)
   - Directory existence (1 test + sub-tests)

7. **Wired into CI**: Added `tool-output-contracts` job to `.github/workflows/ci.yml`

### Workstream C — Truth-Sync and Rollout Discipline

8. **Updated `.github/PULL_REQUEST_TEMPLATE.md`**:
   - Added explicit checkboxes for `pnpm validate:architecture-guardrails` and `pnpm validate:tool-output-contracts`
   - Added "Machine-checked vs reviewer-only" section documenting what CI enforces vs what remains human judgment

9. **Updated `tests/README.md`**:
   - Documented the new architecture guardrail and contract validation layers
   - Updated CI scope section to list the 4 CI jobs (unit-and-typecheck, dry-run-smoke, architecture-guardrails, tool-output-contracts)

10. **Updated `package.json`**:
    - Added `validate:architecture-guardrails` script
    - Added `validate:tool-output-contracts` script

## Enforcement Policy

| Check | Current Mode | Notes |
|-------|-------------|-------|
| Hotspot soft limit (500 lines) | **warn** | Advisory for all hotspot files |
| Hotspot hard limit (1500 lines) | **warn** (warning-first rollout) | Will become **fail** after noise characterization |
| Thin-facade boundary violation | **fail** | Invariant — no platform commands/branching in facade |
| Platform leakage | **fail** | Pure modules must not import execution logic |
| Dependency direction break | **fail** | No reverse imports from focused into orchestration |
| Tool catalog drift (minor) | **warn** | ≤3 missing tools |
| Tool catalog drift (major) | **warn** | >3 missing tools |
| PR template missing sections | **warn** | Advisory |
| ToolResult envelope integrity | **fail** | Universal shell must remain intact |
| Tier 1 schema well-formedness | **fail** | Synthetic payload must validate |
| Tier 1 registry completeness | **fail** | All 6 Tier 1 tools must be registered |

## Verification Evidence

```
$ pnpm build
✅ All packages build successfully

$ pnpm tsx scripts/validate-architecture-guardrails.ts
✅ Architecture guardrail validation passed (0 failures, 6 warnings for existing hotspot files)

$ pnpm tsx scripts/validate-tool-output-contracts.ts
✅ Tool output contract validation passed (8/8 checks)

$ pnpm exec tsx --test packages/mcp-server/test/tool-output-contracts.test.ts
✅ 24 tests pass, 0 fail
```

## Known Gaps / Follow-On Work

1. **`validateAgainstSchema` duplication**: The inline JSON Schema validator exists in both `validate-tool-output-contracts.ts` and `tool-output-contracts.test.ts`. Consider extracting to a shared utility.
2. **No `additionalProperties: false` on schemas**: Tier 1 schemas do not forbid extra properties. Add in a future slice if strict contract enforcement is desired.
3. **Dependency direction check is hardcoded**: Only checks specific file names. Future work: generalize to directory-level rules or AST-based cycle detection.
4. **No circular dependency check**: Extracted modules create new import paths. Should add a circular dependency check in a future slice.
5. **Tool catalog drift is README-only**: Does not verify tool descriptions or invocation guidance accuracy. Future: extend to validate description text alignment.

## Changed Files

| File | Change |
|------|--------|
| `scripts/validate-architecture-guardrails.ts` | **new** — architecture guardrail validator |
| `scripts/validate-tool-output-contracts.ts` | **new** — tool output contract validator |
| `packages/contracts/tool-data-schemas/*.schema.json` | **new** (6 files) — Tier 1 tool output schemas |
| `packages/contracts/tool-data-schemas/index.json` | **new** — schema registry |
| `packages/mcp-server/test/tool-output-contracts.test.ts` | **new** — 24 contract tests |
| `packages/adapter-maestro/src/ui-action-scroll.ts` | **new** — extracted scroll tool |
| `packages/adapter-maestro/src/ui-action-tools-ios-physical.ts` | **new** — extracted iOS physical helpers |
| `packages/adapter-maestro/src/ui-action-tools.ts` | **modified** — reduced from 2002 to 1180 lines |
| `.github/workflows/ci.yml` | **modified** — added 2 CI jobs |
| `.github/PULL_REQUEST_TEMPLATE.md` | **modified** — added machine-checked section |
| `package.json` | **modified** — added 2 validation scripts |
| `tests/README.md` | **modified** — documented new validation layers |

## Commit

- `9bd5449` — feat(phase 19): automate architecture guardrails and harden tool output contracts
