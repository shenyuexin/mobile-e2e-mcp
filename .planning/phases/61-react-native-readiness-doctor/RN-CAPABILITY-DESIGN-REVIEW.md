# RN Capability Design Review

## Practicality Red Team Verdict

**Promising and worth continuing, if narrowed to RN developer verification friction rather than broad RN E2E replacement.**

The strongest user is a mobile/RN engineer or AI coding agent that already changed app code and now needs to know whether the app is runnable, inspectable, and reviewable on a device. Their pain is not only "run a tap"; it is "why did my mobile verification not even start, and what evidence can I attach to a PR?"

## Alternatives Check

- **Detox** is stronger for RN-owned deterministic E2E suites, but it does not give this project’s policy/session/evidence/failure-memory layer to AI agents.
- **Maestro/Appium** are stronger general runners, but they do not standardize RN Metro evidence, readiness blockers, and proof promotion boundaries for agentic workflows.
- **Android CLI/Journeys** is a strong Android-native AI test path and can run from CI, but it is Android-scoped and vision/reasoning-first; this harness should treat it as upstream evidence, not replace it.
- **Dart/Flutter MCP** improves Flutter project reasoning and runtime context; it is framework intelligence, not cross-stack proof governance.
- **Ad-hoc scripts** are fast locally but fail at reusable evidence, policy boundaries, and PR/CI handoff.

## Evidence Gaps This Wave Must Close

- RN currently has Metro JS debug helpers and sample acceptance traces, but no single RN readiness/evidence workflow.
- Existing support text says RN baseline exists, but the workflow still leaks prerequisites such as Metro, appId, testIDs, and device state.
- There is no machine-readable contract for how official Android/Flutter AI tools relate to this harness.

## Design Quality Gate

The design is reasonable because it is layered:

1. Phase 61 answers "can this RN verification safely start?"
2. Phase 62 answers "what RN evidence should a reviewer or agent see?"
3. Phase 63 answers "what one command should a developer run?"
4. Phase 64 answers "how do official tools plug in without overclaiming?"

The design is intentionally not a new RN runner. It keeps the project differentiated around governed orchestration, evidence, proof intake, and failure routing.

## Minimum Killer Demo

Target: repo-owned or local RN login app.

Scenario: developer changes login UI; device is connected but Metro is not running, or critical testIDs are missing.

Expected output: one RN command stops before live UI action, reports the precise blocker, records Metro/debug-target/testID/readiness status, and emits a PR-ready artifact with bounded next action.

## Decision

Proceed with Phase 61-64. Do not claim full RN parity until live app success evidence and intake-backed promotion exist.
