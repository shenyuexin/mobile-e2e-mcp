# Roadmap

## Active Phases

| Phase | Title | Status | Depends On |
|---|---|---|---|
| 25 | Full App Explorer | completed | — |
| 26 | Page Context Detection | completed | 25 |
| 27 | Scroll Discovery for Off-Screen Elements | completed | 25, 26 |
| 28 | Explorer Rule Registry | completed | 25, 26, 27 |
| **29** | **Explorer Horizontal Swipe Discovery** | **completed** | **27** |
| **30** | **Release Network Policy Inspection** | **completed** | **—** |
| **30.1** | **Network Failure Policy Diagnosis** | **completed** | **30** |
| **31** | **Probe Evidence Contract Hardening** | **completed** | **—** |
| **45** | **Mobile Change Verification Workflow** | **completed** | **42, 43, 44** |
| **46** | **Actionable Failure Packet** | **completed** | **45** |
| **47** | **Realistic Mobile Evidence Breadth** | **completed** | **45, 46** |
| **48** | **Live Mobile Change Verification Runner** | **completed** | **45, 46** |
| **49** | **Real App Failure Packet Proof** | **completed** | **48** |
| **50** | **PR / Agent Handoff Integration** | **completed** | **48, 49** |
| **51** | **Live Proof Readiness Gate** | **completed** | **48, 50** |
| **52** | **Live Proof Intake Gate** | **completed** | **48, 51** |
| **53** | **Android Live App Failure Evidence** | **completed** | **48, 52** |
| **54** | **Android Settings Live Success Lane** | **completed** | **48, 53** |
| **55** | **One-Command Mobile Change Verification UX** | **completed** | **45, 48, 51, 52, 54** |
| **56** | **Structured Device Readiness Doctor** | **completed** | **51, 55** |
| **57** | **AUT Readiness Contract Scaffold** | **completed** | **51, 55** |
| **58** | **Repo-Owned App Success Evidence** | **completed-with-live-device-blocker** | **55, 56, 57** |
| **59** | **PR and CI Evidence Automation** | **completed** | **50, 55, 58** |
| **60** | **Failure Memory Remediation Loop** | **completed** | **46, 50, 55** |

## Phase 29: Explorer Horizontal Swipe Discovery

- **Goal**: Add experimental horizontal swipe discovery to Explorer's DFS traversal
- **Depends on**: Phase 27 (scroll-segment infrastructure)
- **Key constraint**: Single-axis MVP — vertical-first, horizontal as one-time fallback
- **Support level**: `experimental`
- **Out of scope**: simultaneous vertical+horizontal, container-targeted scroll, interleaved priority

Plans:
- [x] `PLAN.md` / `29-01-SUMMARY.md` — single-axis horizontal swipe discovery MVP

## Completed Planning Syncs

- Phase 21 Plan 01: critical test gap closure completed (`21-01-SUMMARY.md`).
- Phase 21 Plan 03: coverage/tool-contract/systemic test infrastructure completed (`21-03-SUMMARY.md`).
- Phase 22: first-class `navigate_back` capability completed (`22-SUMMARY.md`).
- Phase 28: Explorer rule registry completed (`28-01-SUMMARY.md`).
- Phase 29: Explorer horizontal swipe discovery MVP completed (`29-01-SUMMARY.md`).
- Phase 33: existence scenario validation completed (`33-01-SUMMARY.md`).
- Phase 34: alternative kill test completed (`34-01-SUMMARY.md`).
- Phase 35: wedge selection completed (`35-01-SUMMARY.md`).
- Phase 36: governed agent mobile control proof completed (`36-01-SUMMARY.md`).
- Phase 37: governed control live evidence entrypoint completed (`37-01-SUMMARY.md`).
- Phase 38: business app governed workflow proof completed (`38-01-SUMMARY.md`).
- Phase 39: business app alternative comparison completed (`39-01-SUMMARY.md`).
- Phase 40: governed quickstart readiness completed (`40-01-SUMMARY.md`).
- Phase 41: governed evidence brief completed (`41-01-SUMMARY.md`).
- Phase 42: governed policy escalation proof completed (`42-01-SUMMARY.md`).
- Phase 43: governed PR evidence summary completed (`43-01-SUMMARY.md`).
- Phase 44: governed PR summary hardening completed (`44-01-SUMMARY.md`).
- Phase 45: mobile change verification workflow completed (`45-01-SUMMARY.md`).
- Phase 46: actionable failure packet completed (`46-01-SUMMARY.md`).
- Phase 47: realistic mobile evidence breadth completed (`47-01-SUMMARY.md`).
- Explorer failure review/reporting landed in local commits `aa8cc94` through `cb62a82`, with failure artifacts, log signals, rule decision reporting, and markdown sampling.
- Android physical-device Explorer evidence is tracked at `artifacts/explorer/android-full/2026-04-28T03-38-20/` (45 pages, max depth 4, 0 failures).
- Script cleanup moved historical phase/demo/debug runners under `scripts/legacy/`; current real-device direction is Explorer/probe first, with legacy runners kept as compatibility artifacts.
- Probe-first validation entrypoint consolidation landed on main: Android probe uses probe-native `validate_flow`, Phase 2 RN Android has a dedicated acceptance wrapper, the sample matrix is legacy compatibility, and `validate:probe-dry-run` is CI-gated.
- Capability truth sync and stability hardening are underway: shipped visual/network/checkpoint/flow tools are no longer listed as missing, Explorer failure-review fixtures cover report categories/signals/current visual evidence/managed-baseline comparison/candidate promotion, and Android `type_into_element` records IME visibility around focus.
- Phase 31: Probe evidence contract hardening completed. Android and iOS simulator probe reports now share `tool-probe-report/v1` helpers for JSON shape, Markdown rendering, artifact paths, observed-effect classification, and fixture-backed validation.

## Completed Phases

See `.planning/phases/*/SUMMARY.md` for closure artifacts.

## Phase 30: Release Network Policy Inspection

- **Goal**: Add a first-class MCP capability that inspects release network policy configuration and reports whether HTTP endpoints are allowed by Android cleartext and iOS ATS rules.
- **Depends on**: none
- **Key constraint**: Static policy inspection only — no proxying, packet capture, or runtime traffic mutation.
- **Support level**: `full` for source/config XML/plist inputs; `conditional` for built APK/IPA artifacts when local platform tooling can extract readable manifests/plists.
- **Out of scope**: active network interception, TLS validation, backend health probing, and automatic app config mutation.

Plans:
- [x] `30-01-PLAN.md` — inspect_network_policy MCP capability

## Phase 30.1: Network Failure Policy Diagnosis

- **Goal**: Add a failure-first network diagnosis capability that starts from an observed failed request and determines whether Android cleartext or iOS ATS release policy is the likely cause.
- **Depends on**: Phase 30 (`inspect_network_policy`)
- **Key constraint**: Diagnostic attribution only — no packet capture, proxying, or app policy mutation.
- **Support level**: `full` for explicit failed request payloads and available decoded policy evidence; `conditional` when deriving evidence from JS debug events or built artifacts.
- **Out of scope**: backend health guarantees, active interception, and automatic binary artifact decompilation beyond Phase 30 support boundaries.

Plans:
- [x] `30.1-01-PLAN.md` — diagnose_network_failure MCP capability

## Phase 31: Probe Evidence Contract Hardening

- **Goal**: Keep generated probe report JSON/Markdown stable and validateable without requiring devices.
- **Depends on**: none
- **Key constraint**: Contract tests must be fixture-backed and must not invoke a device or simulator.
- **Support level**: internal validation infrastructure
- **Out of scope**: new probe tool coverage, real-device execution changes, and baseline lifecycle governance.

Plans:
- [x] shared `tool-probe-report/v1` helpers, fixture-backed contract tests, and docs

## Phase 45: Mobile Change Verification Workflow

- **Goal**: Turn the governed mobile-control foundation into a developer-facing workflow that verifies a mobile app change end to end and emits a reusable evidence bundle.
- **Depends on**: Phase 42 (policy escalation proof), Phase 43 (PR evidence summary), Phase 44 (summary generator hardening)
- **Key constraint**: Ship one reliable "change -> mobile verification -> evidence" path before expanding into broad test generation or platform parity.
- **Support level**: `experimental` for the first workflow entrypoint; fixture-backed contract validation must run without devices.
- **Out of scope**: general test generation, cloud device farms, and claims of full Android/iOS/RN/Flutter coverage.

Plans:
- [x] `45-PLAN.md` / `45-01-SUMMARY.md` — mobile change verification workflow

## Phase 46: Actionable Failure Packet

- **Goal**: Upgrade failed mobile verification from scattered logs into an agent-usable failure packet with cause, evidence, policy context, and bounded remediation options.
- **Depends on**: Phase 45
- **Key constraint**: Keep the first version deterministic and schema-backed; no LLM-generated remediation in this phase.
- **Support level**: `experimental` schema and rendering layer for Phase 45 failures.
- **Out of scope**: autonomous code fixing, open-ended AI remediation, and cross-session flakiness scoring.

Plans:
- [x] `46-PLAN.md` / `46-01-SUMMARY.md` — actionable failure packet

## Phase 47: Realistic Mobile Evidence Breadth

- **Goal**: Prove the workflow on realistic mobile developer scenarios so the project is credible as a practical tool, not only a governance demo.
- **Depends on**: Phase 45, Phase 46
- **Key constraint**: Evidence claims must match actual runs; dry-run artifacts must remain explicitly labeled.
- **Support level**: evidence expansion for the governed verification workflow.
- **Out of scope**: broad platform parity, cloud farm support, and framework-wide maturity claims unless proven by this phase.

Plans:
- [x] `47-PLAN.md` / `47-01-SUMMARY.md` — realistic mobile evidence breadth

## Phase 48: Live Mobile Change Verification Runner

- **Goal**: Upgrade the fixture-backed mobile change verification contract into a live-capable runner that can produce the same evidence bundle from real device/emulator conditions.
- **Depends on**: Phase 45, Phase 46
- **Key constraint**: Keep CI deterministic by making live execution optional and no-device outcomes structured.
- **Support level**: `experimental` live proof runner; existing MCP tools remain the execution surface.
- **Out of scope**: new MCP tool surface, cloud farm execution, and platform parity claims.

Plans:
- [x] `48-PLAN.md` / `48-01-SUMMARY.md` — live mobile change verification runner

## Phase 49: Real App Failure Packet Proof

- **Goal**: Capture at least one real or live-run-derived app failure as a committed proof artifact.
- **Depends on**: Phase 48
- **Key constraint**: Real failure evidence must remain separate from fixture evidence and must not block normal CI on device availability.
- **Support level**: manual/self-hosted proof expansion.
- **Out of scope**: broad failure taxonomy completion and automatic app fixing.

Plans:
- [x] `49-PLAN.md` / `49-01-SUMMARY.md` — controlled app-readiness failure packet proof

## Phase 50: PR / Agent Handoff Integration

- **Goal**: Turn verification bundles and failure packets into compact PR/agent handoff summaries.
- **Depends on**: Phase 48, Phase 49
- **Key constraint**: Generate review-ready artifacts without posting to GitHub automatically.
- **Support level**: offline summary generation and drift validation.
- **Out of scope**: GitHub comment publishing automation and CI status checks.

Plans:
- [x] `50-PLAN.md` / `50-01-SUMMARY.md` — PR / agent handoff integration

## Phase 51: Live Proof Readiness Gate

- **Goal**: Make the next physical-device proof attempt safer by checking device availability, app artifact presence, and deterministic readiness-contract inputs before invoking UI-affecting live verification.
- **Depends on**: Phase 48, Phase 50
- **Key constraint**: The readiness gate must not claim physical-device fidelity by itself; it only proves whether the local/self-hosted environment is ready to attempt live proof.
- **Support level**: `experimental` preflight and committed controlled no-device blocker evidence.
- **Out of scope**: cloud device farm orchestration, live proof replacement, and automatic app readiness fixes.

Plans:
- [x] `51-PLAN.md` / `51-01-SUMMARY.md` — live proof readiness gate

## Phase 52: Live Proof Intake Gate

- **Goal**: Validate live runner output before promoting it into tracked showcase evidence.
- **Depends on**: Phase 48, Phase 51
- **Key constraint**: Controlled, fixture, and no-device outputs must be rejected as physical-device proof candidates.
- **Support level**: `experimental` offline intake validator for local/self-hosted live runner output.
- **Out of scope**: running a device, copying artifacts automatically into final evidence, and expanding public platform support claims.

Plans:
- [x] `52-PLAN.md` / `52-01-SUMMARY.md` — live proof intake gate

## Phase 53: Android Live App Failure Evidence

- **Goal**: Commit a real Android-device mobile change verification run as tracked evidence.
- **Depends on**: Phase 48, Phase 52
- **Key constraint**: The evidence may prove a real live failure without claiming the app change verified successfully.
- **Support level**: tracked Android live-device failure evidence for device `10AEA40Z3Y000R5`.
- **Out of scope**: successful app verification, iOS parity, and broad platform support expansion.

Plans:
- [x] `53-PLAN.md` / `53-01-SUMMARY.md` — Android live app failure evidence

## Phase 54: Android Settings Live Success Lane

- **Goal**: Provide a no-APK Android live success proof lane using the built-in Settings app.
- **Depends on**: Phase 48, Phase 53
- **Key constraint**: The lane is a runnable recipe and does not claim successful live proof until executed on a connected device and accepted by intake.
- **Support level**: `experimental` live success lane manifest for device `10AEA40Z3Y000R5`.
- **Out of scope**: app-under-test success claims, iOS parity, and automatic device reconnect handling.

Plans:
- [x] `54-PLAN.md` / `54-01-SUMMARY.md` — Android Settings live success lane

## Phase 55: One-Command Mobile Change Verification UX

- **Goal**: Replace the current scattered proof/readiness/intake/handoff scripts with one developer-facing command that runs the right checks in order and emits a compact result.
- **Depends on**: Phase 45, Phase 48, Phase 51, Phase 52, Phase 54
- **Key constraint**: The command must reduce developer workflow friction without hiding evidence boundaries or live-device prerequisites.
- **Support level**: `experimental` local CLI orchestration for Android-first mobile change verification.
- **Out of scope**: cloud device farm execution, broad framework parity, automatic code fixing, and new MCP tool surface.

Plans:
- [x] `55-PLAN.md` / `55-01-SUMMARY.md` — one-command mobile change verification UX

## Phase 56: Structured Device Readiness Doctor

- **Goal**: Turn device-unavailable and environment-blocked runs into concrete diagnostics and next actions for Android/iOS developer machines.
- **Depends on**: Phase 51, Phase 55
- **Key constraint**: Diagnose and explain readiness blockers; do not mutate host/device state without explicit user action.
- **Support level**: `experimental` structured doctor output for local/self-hosted verification environments.
- **Out of scope**: automatic driver installation, destructive ADB resets, cloud runner provisioning, and guaranteed device recovery.

Plans:
- [x] `56-PLAN.md` / `56-01-SUMMARY.md` — structured device readiness doctor

## Phase 57: AUT Readiness Contract Scaffold

- **Goal**: Help developers create and validate deterministic app-under-test readiness contracts before live verification runs.
- **Depends on**: Phase 51, Phase 55
- **Key constraint**: Prefer stable IDs, accessibility identifiers, deep links, and explicit ready-state checks before OCR/CV fallback.
- **Support level**: `experimental` readiness-contract scaffold and validator for Android-first workflows.
- **Out of scope**: automatic app instrumentation, framework-specific code generation for every stack, and claiming readiness from visual guesses alone.

Plans:
- [x] `57-PLAN.md` / `57-01-SUMMARY.md` — AUT readiness contract scaffold

## Phase 58: Repo-Owned App Success Evidence

- **Goal**: Produce tracked successful live evidence against a repo-owned app path instead of only Android Settings or failure evidence.
- **Depends on**: Phase 55, Phase 56, Phase 57
- **Key constraint**: Success evidence must prove install/launch/readiness/verification outcome on a real or explicitly labeled emulator device and pass intake before promotion.
- **Support level**: `experimental` Android-first app success proof.
- **Out of scope**: iOS parity, full RN/Flutter matrix, and success claims for arbitrary external apps.

Plans:
- [x] `58-PLAN.md` / `58-01-SUMMARY.md` — repo-owned app success candidate and live-device blocker boundary

## Phase 59: PR and CI Evidence Automation

- **Goal**: Make verification output useful in normal developer review by producing CI artifacts and PR-ready summaries from the one-command flow.
- **Depends on**: Phase 50, Phase 55, Phase 58
- **Key constraint**: Automate evidence packaging while preserving proof-level labels and avoiding automatic GitHub posting unless explicitly configured.
- **Support level**: `experimental` CI artifact and PR summary generation.
- **Out of scope**: mandatory real-device CI, GitHub comment publishing by default, and release gate hard-blocking without configured evidence lanes.

Plans:
- [x] `59-PLAN.md` / `59-01-SUMMARY.md` — PR and CI evidence automation

## Phase 60: Failure Memory Remediation Loop

- **Goal**: Use repeated failure packets and session evidence to recommend bounded next actions that shorten the debug/fix loop for mobile developers.
- **Depends on**: Phase 46, Phase 50, Phase 55
- **Key constraint**: Recommendations must be evidence-backed and policy-bounded, not open-ended AI code modification.
- **Support level**: `experimental` local failure-memory analysis and remediation routing.
- **Out of scope**: autonomous source edits, flaky-test prediction as a product claim, and LLM-only root-cause attribution.

Plans:
- [x] `60-PLAN.md` / `60-01-SUMMARY.md` — failure memory remediation loop

## Future Candidates

- Phase 32: Container-Targeted Scroll (requires MCP contract extension for bounds/selector)
- Phase 38: Interleaved Scroll Axis Priority (requires validation data from Phase 29)

## Phase 61: React Native Readiness Doctor

- **Goal**: Give React Native developers a first-class readiness doctor that checks device availability, Metro/debug-target reachability, app-under-test readiness contract strength, and stable RN selector instrumentation before live verification starts.
- **Depends on**: Phase 55, Phase 56, Phase 57, Phase 60
- **Key constraint**: Diagnose readiness blockers without mutating device or host state; blocked readiness is not a failed app verification.
- **Support level**: `experimental` React Native profile readiness diagnostics with fixture-backed validation.
- **Out of scope**: automatic Metro startup, app instrumentation edits, cloud device provisioning, and Detox/Appium/Maestro replacement claims.

Plans:
- [x] `61-PLAN.md` / `61-01-SUMMARY.md` — React Native readiness doctor

## Phase 62: React Native Evidence Pack

- **Goal**: Merge RN readiness, Metro console/network signals, native device evidence references, and bounded failure context into one reviewable evidence pack.
- **Depends on**: Phase 61
- **Key constraint**: Metro evidence is supplemental; native post-condition and readiness evidence remain the proof backbone.
- **Support level**: `experimental` RN evidence packaging for local/CI review.
- **Out of scope**: full debugger semantics, long-running JS tracing, active network interception, and source-code fixing.

Plans:
- [x] `62-PLAN.md` / `62-01-SUMMARY.md` — React Native evidence pack

## Phase 63: React Native One-Command Verification Lane

- **Goal**: Provide a developer-facing RN command path that runs readiness, evidence packing, and review summary generation in a predictable order.
- **Depends on**: Phase 61, Phase 62
- **Key constraint**: Reduce workflow friction while preserving blocked/failed/success proof labels.
- **Support level**: `experimental` RN one-command local verification lane.
- **Out of scope**: mandatory live-device CI, broad RN app compatibility claims, and automatic code remediation.

Plans:
- [ ] `63-PLAN.md` — React Native one-command verification lane

## Phase 64: Official Tool Bridge Contract

- **Goal**: Define how Android CLI/Journeys, Android Studio Journeys, and Dart/Flutter MCP outputs relate to this harness as upstream evidence/context providers rather than replacements.
- **Depends on**: Phase 61, Phase 62, Phase 63
- **Key constraint**: Accept official-tool outputs only with explicit evidence kind, proof boundary, and intake decision.
- **Support level**: `contract-ready` bridge matrix and validator.
- **Out of scope**: invoking Android CLI/Journeys or Dart/Flutter MCP directly, vendor-specific account setup, and claiming official-tool parity.

Plans:
- [ ] `64-PLAN.md` — official tool bridge contract
