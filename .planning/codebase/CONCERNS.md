# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

**Untracked local config is part of the live runtime contract:**
- Issue: `run_flow` and the phase-3 validation scripts depend on `configs/harness/sample-harness.yaml` and `configs/matrices/framework-profile-matrix.md`, but both paths are ignored by `.gitignore` and are not tracked by git.
- Files: `.gitignore`, `packages/adapter-maestro/src/harness-config.ts`, `scripts/validate-phase3-samples.ts`
- Impact: A clean clone can silently fall back to `buildDefaultHarnessConfig()` in `packages/adapter-maestro/src/harness-config.ts`, which changes run counts, runner scripts, sample names, and flow selection. Local success can diverge from CI or from another contributor's machine.
- Fix approach: Either commit canonical harness/matrix files, or move the fallback into explicit example/sample config files and make missing config a structured failure instead of a silent default.

**Ignored OCR fixtures are treated as committed test assets:**
- Issue: `tests/README.md` describes OCR fixtures as committed assets, and `.github/workflows/ocr-smoke.yml` references them, but `tests/fixtures/ocr/` is ignored by `.gitignore` and not tracked by git.
- Files: `.gitignore`, `tests/README.md`, `.github/workflows/ocr-smoke.yml`, `packages/adapter-vision/test/ocr-smoke.test.ts`
- Impact: OCR validation depends on local machine state. Fresh clones and release verification can skip or miss the intended regression layer without obvious visibility.
- Fix approach: Commit the fixture set, or move OCR smoke to an explicit opt-in local workflow and update docs to stop calling the assets committed.

**Large monolithic runtime files concentrate unrelated behaviors:**
- Issue: core execution behavior is concentrated in very large files with mixed platform branches, dry-run logic, diagnostics, and CLI shaping.
- Files: `packages/adapter-maestro/src/ui-inspection-tools.ts`, `packages/adapter-maestro/src/ui-action-tools.ts`, `packages/adapter-maestro/src/device-runtime.ts`, `packages/mcp-server/src/dev-cli.ts`, `packages/mcp-server/src/index.ts`
- Impact: Small changes carry high regression risk, review cost is high, and support-boundary drift is more likely because behavior, messaging, and policy wrapping live in the same modules.
- Fix approach: Continue decomposing by capability family and platform branch. Prefer narrow per-tool/per-platform modules over shared multi-mode files.

## Known Bugs

**Docs index references a file that is not present:**
- Symptoms: `docs/README.md` points readers to `docs/delivery/p0-p2-execution-plan.zh-CN.md`, but that file does not exist in the repository.
- Files: `docs/README.md`, `docs/delivery/`
- Trigger: Following the docs index from the public docs landing page.
- Workaround: Use existing delivery docs under `docs/delivery/`, especially `docs/delivery/roadmap.md` and `docs/delivery/npm-release-and-git-tagging.zh-CN.md`.

**Golden-path tool count is stale:**
- Symptoms: `docs/guides/golden-path.md` still says "54" tools, while the live MCP registry exports 55 tools from `packages/mcp-server/src/index.ts`.
- Files: `docs/guides/golden-path.md`, `packages/mcp-server/src/index.ts`
- Trigger: Using the guide as a source of truth for current tool surface.
- Workaround: Treat `packages/mcp-server/src/index.ts` and `packages/mcp-server/src/server.ts` as the current source of truth for exposed tools.

**Published package metadata points to a different repository:**
- Symptoms: npm/package README and package metadata reference `https://github.com/shenyuexin/mobile-e2e` instead of the current `mobile-e2e-mcp` repository.
- Files: `packages/mcp-server/package.json`, `packages/mcp-server/README.md`
- Trigger: Navigating from npm metadata or the package README to source, issues, or homepage.
- Workaround: Use the current repository root directly instead of following package metadata links.

## Security Considerations

**Artifact redaction is metadata-only, not content-level:**
- Risk: governance code redacts artifact paths and selected timeline strings, but it does not redact screenshot pixels, log file contents, crash payloads, or exported diagnostics bundles.
- Files: `packages/core/src/governance.ts`, `packages/core/src/session-record-store.ts`, `packages/mcp-server/src/tools/persist-session-evidence.ts`, `docs/architecture/governance-security.md`
- Current mitigation: redaction targets in `configs/policies/artifact-retention.yaml` and tests in `packages/mcp-server/test/governance.test.ts` cover path/detail string masking.
- Recommendations: Treat screenshots/log bundles as sensitive artifacts, add content-redaction or content-classification hooks before persistence, and align docs so they do not imply screenshot/log content redaction that does not exist.

**Default policy profile is permissive for a baseline profile:**
- Risk: `sample-harness-default` allows install, uninstall, clear-data, tap, type, swipe, and interruption handling by default.
- Files: `configs/policies/access-profiles.yaml`, `packages/mcp-server/src/policy-guard.ts`, `packages/core/src/policy-engine.ts`
- Current mitigation: tool-to-scope mapping exists and denied tools return structured `POLICY_DENIED` failures.
- Recommendations: Make the default profile least-privilege, require explicit elevation for destructive actions, and separate sample/demo defaults from production-safe defaults.

**Policy scope granularity is still coarse:**
- Risk: high-value operations are still bucketed into broad scopes such as `logs`, `tap`, `type`, `install`, and `clear-data`.
- Files: `packages/core/src/policy-engine.ts`, `docs/architecture/governance-security.md`, `docs/delivery/roadmap.md`
- Current mitigation: interruption high-risk actions already have a dedicated `interrupt-high-risk` gate.
- Recommendations: Implement the finer scopes already described in `docs/architecture/governance-security.md` before claiming enterprise-grade governance.

## Performance Bottlenecks

**Session auto-resolution scans all persisted sessions:**
- Problem: when a session-bound tool is called without `sessionId`, `listActiveSessionCandidates()` walks every JSON file under `artifacts/sessions` and loads each one.
- Files: `packages/mcp-server/src/index.ts`, `packages/core/src/session-record-store.ts`
- Cause: implicit session selection is implemented as filesystem discovery rather than an indexed lookup.
- Improvement path: add an active-session index keyed by platform/device/app/profile, or require explicit `sessionId` for more tools to avoid repeated scans.

**Action lookup scales linearly with artifact count:**
- Problem: `loadLatestActionRecordForSession()` and `listActionRecordsForSession()` iterate over every action JSON file and parse each record.
- Files: `packages/core/src/action-record-store.ts`
- Cause: action records are stored as flat files without a per-session index.
- Improvement path: maintain per-session indexes or append-only manifests instead of directory-wide scans.

**Filesystem-backed coordination does not scale beyond one host cleanly:**
- Problem: scheduler locks and leases live under `artifacts/` and rely on local filesystem semantics.
- Files: `packages/core/src/session-scheduler.ts`, `packages/core/src/device-lease-store.ts`, `packages/core/src/execution-coordinator.ts`
- Cause: locking and heartbeat recovery assume a single shared working tree on one machine.
- Improvement path: move leases and scheduler state to a process-safe shared backend before adding multi-runner or hosted execution claims.

## Fragile Areas

**iOS recording is heuristic and simulator-log driven:**
- Files: `packages/adapter-maestro/src/recording-runtime-ios.ts`, `packages/adapter-maestro/src/recording-runtime.ts`, `packages/adapter-maestro/src/capability-model.ts`
- Why fragile: iOS recording depends on `xcrun simctl log stream` keyword matches for `touch`, `tap`, `keyboard`, and `swipe`, plus a polling `idb ui describe-all` snapshot loop every 0.7 seconds. Event capture quality depends on simulator log shape, `idb` availability, and timing alignment rather than a deterministic recording channel.
- Safe modification: keep iOS recording changes behind explicit partial-support messaging and preserve warning-heavy outputs when signals are sparse.
- Test coverage: `packages/adapter-maestro/test/recording-runtime.test.ts` exists, but real confidence still depends on simulator behavior outside unit tests.

**iOS UI inspection/actions still have partial parity semantics despite many "full" tool labels:**
- Files: `packages/adapter-maestro/src/ui-inspection-tools.ts`, `packages/adapter-maestro/src/ui-action-tools.ts`, `packages/adapter-maestro/src/capability-model.ts`
- Why fragile: `inspect_ui` explicitly returns `supportLevel: "partial"` for iOS and depends on `idb`, while adjacent capabilities in `capability-model.ts` are marked `full`. That mismatch makes support-boundary regressions easy to introduce.
- Safe modification: keep support-level calculations close to the actual runtime code paths and verify docs against tool outputs after each capability change.
- Test coverage: iOS partial/unsupported behavior is asserted in `packages/adapter-maestro/test/ui-model.test.ts`, but the surface area remains large.

**Audit generation hides failures:**
- Files: `packages/core/src/session-record-store.ts`
- Why fragile: `syncSessionAuditRecord()` swallows exceptions and returns `undefined`, so broken governance config or serialization issues can silently drop audit artifacts.
- Safe modification: return structured warnings or emit explicit timeline events when audit sync fails.
- Test coverage: session persistence tests cover the happy path in `packages/mcp-server/test/session-persistence.test.ts`, not failure observability for audit-sync errors.

## Scaling Limits

**Current persistence model is single-repo, single-filesystem scale:**
- Current capacity: local JSON files under `artifacts/` with dry-run concurrency coverage from `scripts/validate-concurrent-smoke.ts`.
- Limit: state size and latency grow with artifact count, and coordination semantics do not extend naturally across machines or workers.
- Scaling path: introduce indexed persistence for sessions/actions/failures first, then externalize leases/scheduler state before adding shared runners or cloud/device-farm orchestration.

**Real-device validation capacity is narrower than roadmap language:**
- Current capacity: `configs/harness/sample-harness.yaml` uses `run_count_default: 5` for phase-1 local runs, but `.github/workflows/real-device-acceptance.yml` defaults all workflow-dispatch run counts to `"1"`.
- Limit: the workflow does not meet the roadmap's phase-1 exit language of repeated-run confidence by default.
- Scaling path: raise default real-device run counts, or explicitly document that the current workflow is smoke-grade acceptance rather than phase-exit validation.

## Dependencies at Risk

**OCR is effectively macOS-only today:**
- Risk: the only implemented OCR provider is `MacVisionOcrProvider`, which requires `process.platform === "darwin"` and uses `xcrun swift` with Apple Vision/AppKit.
- Files: `packages/adapter-vision/src/ocr/providers/mac-vision-ocr-provider.ts`, `packages/adapter-maestro/src/toolchain-runtime.ts`, `.github/workflows/ocr-smoke.yml`
- Impact: bounded OCR fallback is unavailable on Linux-based execution hosts and ordinary Ubuntu CI.
- Migration plan: add at least one cross-platform OCR provider, then make provider selection explicit in capability reporting and policy.

**iOS execution depends on idb/idb_companion availability:**
- Risk: multiple iOS runtime paths depend on `idb`, and partial/failure behavior is often just configuration-sensitive rather than functionally unsupported.
- Files: `packages/adapter-maestro/src/toolchain-runtime.ts`, `packages/adapter-maestro/src/recording-runtime-ios.ts`, `packages/adapter-maestro/src/ui-inspection-tools.ts`
- Impact: contributor machines and self-hosted runners can report inconsistent iOS capability levels based on host setup.
- Migration plan: reduce hard dependency on `idb` where possible, or make host prerequisite checks stricter and more front-loaded in `doctor`/`describe_capabilities`.

## Missing Critical Features

**Enterprise governance described in docs is ahead of implementation:**
- Problem: roadmap and architecture docs describe RBAC, approval workflows, environment segmentation, secrets controls, compliance exports, and fine-grained policy scopes, but the live implementation is still coarse-profile YAML plus local audit JSON.
- Blocks: trustworthy enterprise positioning and any support claim that implies approval workflows or secrets-governed multi-environment deployment.
- Files: `docs/delivery/roadmap.md`, `docs/architecture/capability-map.md`, `docs/architecture/governance-security.md`, `configs/policies/access-profiles.yaml`, `packages/core/src/policy-engine.ts`

**Capability docs include target-state surfaces that do not exist in the live registry:**
- Problem: `docs/architecture/capability-map.md` and `docs/architecture/overview.md` enumerate capabilities such as `selectDevice`, `bootDevice`, `shutdownDevice`, `openDeepLink`, `setGeoLocation`, `setPermissions`, `exportSessionReport`, and approval/compliance features that are not present in the current MCP registry.
- Blocks: external readers can overestimate current product maturity and support boundaries.
- Files: `docs/architecture/capability-map.md`, `docs/architecture/overview.md`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/server.ts`

## Test Coverage Gaps

**Main CI remains no-device and smoke-oriented:**
- What's not tested: the default `CI` workflow does not exercise real-device behavior, actual `idb` integration, Android OEM user-space quirks, or end-to-end OCR fallback on non-local environments.
- Files: `.github/workflows/ci.yml`, `tests/README.md`, `.github/workflows/real-device-acceptance.yml`, `.github/workflows/ocr-smoke.yml`
- Risk: environment-specific regressions can merge while unit and dry-run layers remain green.
- Priority: High

**Android OEM/user-0 fallback is validated outside the standard CI path:**
- What's not tested: the Vivo/Oppo multi-user replay path and Android OEM text fallback logic rely on device-specific scripts and real-run validation.
- Files: `scripts/dev/android-oem-text-fallback.ts`, `scripts/dev/vivo-user0-login-adb-fallback.ts`, `docs/guides/vivo-oppo-multi-user-replay.md`, `scripts/validate-bounded-auto-remediation-real-run.ts`
- Risk: one of the most device-specific recovery paths has the weakest automated regression coverage.
- Priority: High

**Silent-failure paths are under-tested:**
- What's not tested: audit-sync failure observability, malformed persisted JSON recovery, and partial-loss scenarios in filesystem-backed stores.
- Files: `packages/core/src/session-record-store.ts`, `packages/core/src/device-lease-store.ts`, `packages/core/src/action-record-store.ts`
- Risk: the system can degrade from "auditable" to "best effort" without loud failures.
- Priority: Medium

---

*Concerns audit: 2026-03-26*
