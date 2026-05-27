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
| **45** | **Mobile Change Verification Workflow** | **planned** | **42, 43, 44** |
| **46** | **Actionable Failure Packet** | **planned** | **45** |
| **47** | **Realistic Mobile Evidence Breadth** | **planned** | **45, 46** |

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
- [ ] `45-PLAN.md` — mobile change verification workflow

## Phase 46: Actionable Failure Packet

- **Goal**: Upgrade failed mobile verification from scattered logs into an agent-usable failure packet with cause, evidence, policy context, and bounded remediation options.
- **Depends on**: Phase 45
- **Key constraint**: Keep the first version deterministic and schema-backed; no LLM-generated remediation in this phase.
- **Support level**: `experimental` schema and rendering layer for Phase 45 failures.
- **Out of scope**: autonomous code fixing, open-ended AI remediation, and cross-session flakiness scoring.

Plans:
- [ ] `46-PLAN.md` — actionable failure packet

## Phase 47: Realistic Mobile Evidence Breadth

- **Goal**: Prove the workflow on realistic mobile developer scenarios so the project is credible as a practical tool, not only a governance demo.
- **Depends on**: Phase 45, Phase 46
- **Key constraint**: Evidence claims must match actual runs; dry-run artifacts must remain explicitly labeled.
- **Support level**: evidence expansion for the governed verification workflow.
- **Out of scope**: broad platform parity, cloud farm support, and framework-wide maturity claims unless proven by this phase.

Plans:
- [ ] `47-PLAN.md` — realistic mobile evidence breadth

## Future Candidates

- Phase 32: Container-Targeted Scroll (requires MCP contract extension for bounds/selector)
- Phase 38: Interleaved Scroll Axis Priority (requires validation data from Phase 29)
