# Phase 46 Plan: Actionable Failure Packet

## Goal

Upgrade failed mobile verification from "the action failed" to an agent-usable failure packet with cause, evidence, policy context, and bounded remediation options.

## Practicality Bet

Mobile developers lose time after failures: they need to know whether the issue is app readiness, selector ambiguity, network policy, crash, keyboard/focus, permission interruption, or policy denial. The project already has many signals; this phase should package them into one practical debugging artifact.

## Work Items

1. Define a `failure_packet` schema that can be emitted by the Phase 45 workflow and reused by governed PR summaries.
2. Normalize existing signals into stable categories: policy, app crash, readiness, network, UI target, interruption, keyboard/focus, and unknown.
3. Include artifact references for UI tree, screenshot or crop, logs/crash signals when available, timeline events, and remediation guidance.
4. Add deterministic fixture cases for at least policy denial, app-not-ready, selector/no-match, and network-policy failure.
5. Add a compact Markdown rendering aimed at PR comments and AI-agent handoff.

## Boundary

No LLM-generated remediation in this phase. The first version should be deterministic, inspectable, and aligned with existing reason codes before optional AI remediation is introduced later.

## Verification

- Fixture-backed schema validation for all supported failure categories
- Rendering drift check for Markdown failure packets
- Existing smoke/typecheck coverage for touched packages
- `git diff --check`

## Success Criteria

- Every failed Phase 45 verification produces a structured failure packet instead of scattered logs.
- The packet includes a concrete next action, confidence level, and support boundary.
- Existing policy-remediation guidance appears as one category of the broader failure packet, not as a separate one-off path.
