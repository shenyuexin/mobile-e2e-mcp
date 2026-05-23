# Phase: Unified Output Directory Restructure

## Goal
Consolidate all runtime outputs (currently scattered across `artifacts/`, `reports/`, and some hardcoded `docs/showcase/` references) into a single, well-organized `output/` directory with clear semantic boundaries and updated retention policy.

## Motivation
1. **Storage pressure**: `artifacts/` + `reports/` = ~2.7 GB with 70K+ files, growing without retention discipline
2. **Boundary confusion**: `reports/` contains raw diagnostics (136MB iOS trace) while `artifacts/` contains structured evidence — roles are reversed
3. **Governance gap**: `artifact-retention.yaml` only covers 3 categories but `artifacts/` has 40+ subdirectories
4. **Hardcoded sprawl**: `"artifacts"` and `"reports"` are hardcoded in 75 files across source, tests, scripts, configs, and docs

---

## New Directory Structure

```
output/                          # NEW unified root (gitignored, like old artifacts/)
├── evidence/                    # Runtime evidence (session/action/diagnostic)
│   ├── sessions/                # Session state JSONs
│   ├── actions/                 # Action outcome JSONs
│   ├── screenshots/             # UI screenshots (PNG/JPG)
│   ├── recordings/
│   │   ├── snapshots/           # UI hierarchy snapshots (XML/JSON)
│   │   ├── events/              # Recorded event streams (JSONL)
│   │   └── videos/              # Screen recordings (MP4)
│   ├── performance/             # Performance traces (.trace, .perfetto)
│   ├── diagnostics/             # Device diagnostics bundles
│   ├── ui-dumps/                # Raw UI hierarchy dumps
│   ├── crash-signals/           # Crash/ANR signals
│   ├── logs/                    # Logcat / simulator logs
│   ├── state-summaries/         # Session state summaries
│   ├── debug-evidence/          # Debug evidence markdowns
│   ├── ios-physical-actions/    # iOS physical device Maestro flows
│   └── explorer/                # Explorer traversal output
├── reports/                     # Structured reports (JSON + MD summaries)
│   ├── probes/                  # Tool probe reports
│   ├── acceptance/              # Acceptance evidence
│   ├── validation/              # Phase validation reports
│   └── explorer/                # Explorer summary reports
└── tmp/                         # Ephemeral / debug files (auto-purged)
```

### Old → New Mapping

| Old Path | New Path | Rationale |
|----------|----------|-----------|
| `artifacts/sessions/` | `output/evidence/sessions/` | Core session state |
| `artifacts/actions/` | `output/evidence/actions/` | Action evidence envelopes |
| `artifacts/screenshots/` | `output/evidence/screenshots/` | Screenshot artifacts |
| `artifacts/record-snapshots/` | `output/evidence/recordings/snapshots/` | Recording UI snapshots |
| `artifacts/record-events/` | `output/evidence/recordings/events/` | Recording event streams |
| `artifacts/screen-recordings/` | `output/evidence/recordings/videos/` | Screen recordings |
| `artifacts/performance/` | `output/evidence/performance/` | Performance traces |
| `artifacts/diagnostics/` | `output/evidence/diagnostics/` | Diagnostic bundles |
| `artifacts/ui-dumps/` | `output/evidence/ui-dumps/` | UI hierarchy dumps |
| `artifacts/crash-signals/` | `output/evidence/crash-signals/` | Crash signals |
| `artifacts/logs/` | `output/evidence/logs/` | Platform logs |
| `artifacts/state-summaries/` | `output/evidence/state-summaries/` | State summaries |
| `artifacts/debug-evidence/` | `output/evidence/debug-evidence/` | Debug evidence |
| `artifacts/ios-physical-actions/` | `output/evidence/ios-physical-actions/` | iOS physical Maestro flows |
| `artifacts/explorer/` | `output/evidence/explorer/` | Explorer raw output |
| `artifacts/leases/` | `output/evidence/leases/` | Lease metadata |
| `artifacts/run-flow/` | `output/evidence/run-flow/` | Flow execution artifacts |
| `artifacts/mcp-server/` | `output/evidence/mcp-server/` | MCP server artifacts |
| `artifacts/ai-first/` | `output/evidence/ai-first/` | Failure index |
| `artifacts/recorded-steps/` | `output/evidence/recorded-steps/` | Recorded step mappings |
| `artifacts/record-sessions/` | `output/evidence/record-sessions/` | Record session metadata |
| `artifacts/manual/` | `output/tmp/manual/` | One-time probe (temp) |
| `artifacts/phase*-*` | `output/tmp/phase*/` | Phase CI markers (temp) |
| `artifacts/emulator-validation/` | `output/tmp/emulator-validation/` | Emulator validation |
| `artifacts/tmp/` | `output/tmp/` | Temporary files |
| `reports/*.json` | `output/reports/probes/` | Tool probe reports |
| `reports/acceptance-evidence.*` | `output/reports/acceptance/` | Acceptance evidence |
| `reports/phase-sample-report.*` | `output/reports/validation/` | Phase validation |
| `reports/ios-diagnostics-fixed/` | `output/evidence/diagnostics/validation-ios-fixed/` | Raw diagnostics → evidence |
| `reports/ios-perf-fixed/` | `output/evidence/performance/validation-ios-fixed/` | Raw performance → evidence |

---

## Files to Modify (75 total)

### Source Code (32 files)
1. `packages/adapter-maestro/src/harness-config.ts` — `buildArtifactsDir()` default path
2. `packages/adapter-maestro/src/device-runtime.ts` — screenshot/screen-recording/log/crash/diagnostic paths
3. `packages/adapter-maestro/src/device-runtime-android.ts` — logcat/crash/diagnostic paths
4. `packages/adapter-maestro/src/device-runtime-ios.ts` — simulator log/crash-manifest/diagnostic paths
5. `packages/adapter-maestro/src/ui-runtime.ts` — ui-dump paths
6. `packages/adapter-maestro/src/performance-runtime.ts` — performance output path
7. `packages/adapter-maestro/src/recording-runtime.ts` — record-events, snapshot, session paths
8. `packages/adapter-maestro/src/recording-runtime-android.ts` — "artifacts" string literal
9. `packages/adapter-maestro/src/recording-runtime-ios.ts` — "artifacts" string literal
10. `packages/adapter-maestro/src/recording-runtime-snapshot.ts` — "artifacts" string literal
11. `packages/adapter-maestro/src/recording-mapper.ts` — `artifacts/record-snapshots/` check
12. `packages/adapter-maestro/src/action-outcome.ts` — `artifacts/actions/` path
13. `packages/adapter-maestro/src/action-orchestrator-ocr.ts` — screenshot path
14. `packages/adapter-maestro/src/ui-action-tools.ts` — dry-run message with path
15. `packages/adapter-maestro/src/ui-action-tools-ios-physical.ts` — ios-physical-actions path
16. `packages/adapter-maestro/src/diagnostics-tools.ts` — debug-evidence, ios-physical-actions paths
17. `packages/adapter-maestro/src/element-screenshot.ts` — "artifacts" string literal
18. `packages/adapter-maestro/src/ui-tool-shared.ts` — "artifacts" string literal
19. `packages/adapter-maestro/src/session-state.ts` — "artifacts" string literal (3 occurrences)
20. `packages/adapter-maestro/src/flow-runtime.ts` — run-flow path
21. `packages/adapter-maestro/src/doctor-runtime.ts` — artifact root scan path
22. `packages/mcp-server/src/index.ts` — sessions dir, lease path
23. `packages/mcp-server/src/cli/context-resolver.ts` — sessions dir
24. `packages/mcp-server/src/tools/start-session.ts` — artifactRoot wiring
25. `packages/explorer/src/run-artifacts.ts` — outputDir preparation

### Test Files (18 files)
26. `packages/mcp-server/test/server.test.ts`
27. `packages/mcp-server/test/governance.test.ts`
28. `packages/mcp-server/test/page-context-tool.test.ts`
29. `packages/mcp-server/test/stdio-server.test.ts`
30. `packages/mcp-server/test/session-persistence.test.ts`
31. `packages/mcp-server/test/auto-remediation.test.ts`
32. `packages/mcp-server/test/tool-output-contracts.test.ts`
33. `packages/adapter-maestro/test/page-context-read-paths.test.ts`
34. `packages/adapter-maestro/test/page-context-invalidation.test.ts`
35. `packages/adapter-maestro/test/ui-model.test.ts`
36. `packages/adapter-maestro/test/diagnostics-tools.test.ts`

### Scripts (12 files)
37. `scripts/dev/android-tool-probe.ts`
38. `scripts/dev/ios-tool-probe.ts`
39. `scripts/dev/ios-simulator-tool-probe.ts`
40. `scripts/dev/run-phase1-android.sh`
41. `scripts/dev/run-phase1-ios.sh`
42. `scripts/dev/run-phase2-rn-android.sh`
43. `scripts/dev/run-phase3-flutter-android.sh`
44. `scripts/dev/run-phase3-native-android.sh`
45. `scripts/dev/run-phase3-native-ios.sh`
46. `scripts/dev/run-phase3-native-ios-real-device.sh`
47. `scripts/dev/run-sample-phase-matrix.sh`
48. `scripts/dev/run-maestro-ios-manual-runner.sh`
49. `scripts/dev/record-demo-happy-path-android.sh`
50. `scripts/dev/record-demo-interruption-home-recovery-android.sh`
51. `scripts/dev/publish-showcase-assets-android.sh`
52. `scripts/explorer/test-explorer.ts`
53. `scripts/explorer/test-explorer-android.ts`
54. `scripts/explorer/test-explorer-ios-device.ts`
55. `scripts/explorer/test-explorer-ios-device-lib.ts`
56. `scripts/explorer/test-explorer-ios-device.test.ts`
57. `scripts/validate-bounded-auto-remediation-real-run.ts`
58. `scripts/validate-phase2-rn-android.ts`

### Configs (2 files)
59. `configs/policies/artifact-retention.yaml`
60. `configs/harness/sample-harness.yaml`

### Documentation (12 files)
61. `.gitignore`
62. `docs/showcase/README.md`
63. `docs/showcase/demo-playbook.zh-CN.md`
64. `docs/showcase/record-session-demo.md`
65. `docs/showcase/failure-intelligence-demo.md`
66. `docs/showcase/ios-recording-showcase.md`
67. `docs/showcase/ci-evidence.md`
68. `docs/showcase/android-real-device-demo-run-2026-03-18.md`
69. `docs/testing/android-tool-probe-checklist.md`
70. `docs/testing/ios-simulator-tool-probe-checklist.md`
71. `docs/guides/vivo-oppo-multi-user-replay.md`
72. `docs/spike/screenshot-baseline.md`
73. `AGENTS.md`

### Generated Flow Files (legacy)
74. `flows/samples/generated/*.yaml` — contain `artifacts/record-snapshots/` references

---

## Implementation Strategy

### Wave 1: Foundation (Contracts + Config)
1. Create `packages/contracts/src/artifact-paths.ts` — single source of truth for all output paths
2. Update `.gitignore`: add `output/`, keep `artifacts/` and `reports/` for migration period
3. Update `configs/policies/artifact-retention.yaml` with full category coverage
4. Update `configs/harness/sample-harness.yaml` artifact_root → `output/evidence/...`
5. Update `harness-config.ts` default path: `artifacts/mcp-server/...` → `output/evidence/mcp-server/...`

### Wave 2: Adapter Runtime (Source Code)
6. Update all `packages/adapter-maestro/src/*-runtime.ts` files to use new paths
7. Update `packages/adapter-maestro/src/*-tools.ts` files
8. Update `packages/adapter-maestro/src/action-outcome.ts`
9. Update `packages/adapter-maestro/src/recording-mapper.ts`
10. Update `packages/adapter-maestro/src/session-state.ts`
11. Update `packages/mcp-server/src/index.ts`
12. Update `packages/mcp-server/src/cli/context-resolver.ts`
13. Update `packages/explorer/src/run-artifacts.ts`

### Wave 3: Scripts
14. Update all `scripts/dev/*.sh` OUT_DIR defaults
15. Update all `scripts/dev/*-probe.ts` artifact/report paths
16. Update `scripts/explorer/test-explorer*.ts`
17. Update `scripts/validate-*.ts`

### Wave 4: Tests
18. Update all test files to use new paths

### Wave 5: Documentation
19. Update all docs with new path references
20. Update `AGENTS.md`

### Wave 6: Migration + Cleanup
21. Create migration script: `scripts/dev/migrate-artifacts-to-output.sh`
   - Move existing `artifacts/` → `output/evidence/`
   - Move existing `reports/` → `output/reports/`
22. Update `.gitignore`: remove `artifacts/` and `reports/` (now empty)
23. Run full test suite

---

## Verification Plan

1. `pnpm build` → exit 0
2. `pnpm typecheck` → zero errors
3. `pnpm test:ci` → all pass
4. `pnpm validate:architecture-guardrails` → pass
5. Verify no `"artifacts"` or `"reports"` hardcoded in new code
6. Verify `output/` directory structure matches spec after a test run

---

## Risks

| Risk | Mitigation |
|------|-----------|
| 75 files is a large blast radius | Split into 6 waves, verify after each |
| External scripts / CI may reference old paths | Update `.github/workflows/*.yml` as part of Wave 3 |
| Generated flow YAMLs contain old snapshot paths | Regenerate or add backward-compatible handling |
| Loss of historical evidence data | Migration script copies (not moves) initially |
| Showcase docs reference old artifact paths | Update as Wave 5 |

## Rollback
- Old `artifacts/` and `reports/` kept until `.gitignore` updated in Wave 6
- Migration script is idempotent (checks before copy)

---

## Oracle Review Feedback (Applied)

**Verdict**: CONDITIONAL — executable after addressing below items
**Risk Rating**: HIGH

### Action Items from Oracle Review

1. **Missing files added to scope**:
   - `.github/workflows/ocr-smoke.yml`
   - `.github/workflows/platform-smoke.yml`
   - `.github/workflows/real-device-acceptance.yml`
   - `docs/showcase/explorer/config.json`
   - `packages/adapter-maestro/test/inspect-ui-page-context.test.ts`
   - `packages/adapter-maestro/test/page-context-pre-action-gating.test.ts`
   - `packages/adapter-maestro/test/page-context-tools.test.ts`
   - `packages/adapter-maestro/test/recording-mapper.test.ts`
   - `packages/adapter-maestro/test/recording-runtime.test.ts`
   - `packages/adapter-maestro/test/ui-action-tools.test.ts`
   - `packages/adapter-maestro/test/ui-runtime.test.ts`
   - `packages/core/test/device-lease-store-errors.test.ts`
   - `scripts/report/generate-acceptance-evidence.py`
   - `scripts/report/generate-phase-report.py`
   - `scripts/report/summarize-failures.py`

2. **Architecture adjustments applied**:
   - Path helper will be placed in `packages/adapter-maestro/src/` (NOT in contracts)
   - Contracts layer will only define artifact/evidence category semantics (types)
   - Default path construction stays in adapter/core/server config helpers

3. **Simplifications applied**:
   - **No historical data migration in this phase** — old `artifacts/` and `reports/` stay ignored, new outputs go to `output/`
   - **Preserve existing leaf names** where possible — only change the root from `artifacts/`/`reports/` to `output/evidence/`/`output/reports/`
   - **No retention automation yet** — policy file updated but enforcement deferred
   - **Backward compatibility**: old generated flow YAMLs keep working (snapshot paths remain valid since old `artifacts/` is untouched)

4. **Phase split adopted**:
   The original single phase is now split into **4 sequential phases**:
   - **Phase 1: Foundation** — path helper, gitignore, retention policy, backward-compat read support
   - **Phase 2: Runtime + Tests** — adapter/server/explorer source + unit tests
   - **Phase 3: CI + Scripts** — workflows, dev scripts, report generators
   - **Phase 4: Docs + Cleanup** — docs update, optional migration script

### Critical Blockers Resolved
- [x] File inventory now complete (added CI workflows + Python scripts + missing tests)
- [x] Old evidence paths remain readable (no migration = no breakage)
- [x] Contracts layer placement resolved (path helper in adapter, not contracts)
