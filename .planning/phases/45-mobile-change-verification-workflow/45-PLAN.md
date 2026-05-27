# Phase 45 Plan: Mobile Change Verification Workflow

## Goal

Turn the governed mobile-control foundation into a developer-facing workflow that verifies a mobile app change end to end and emits a reusable evidence bundle.

## Practicality Bet

The market gap is not another broad E2E framework. The practical wedge is: after an AI agent or developer changes mobile code, the project should answer "did the app still launch and reach the expected screen?" with auditable mobile evidence, not only logs or documentation.

## Work Items

1. Define a single workflow entrypoint for mobile change verification, covering app artifact or package id, target platform, expected launch/readiness hints, and policy profile.
2. Reuse existing lifecycle/session tools to run the path: device discovery, session start, install or launch, UI readiness inspection, governed smoke action, evidence capture, and session close.
3. Produce a timestamped verification bundle with JSON and Markdown summaries that an AI coding agent can attach to a PR or use for the next action.
4. Add dry-run fixtures so CI can validate the bundle schema and rendering without requiring a local device.
5. Update public docs only to the extent needed to expose the concrete workflow and its support boundaries.

## Boundary

This phase is not a general test generator and does not claim full Android/iOS/RN/Flutter coverage. It should stay focused on one reliable "change -> mobile verification -> evidence" path.

## Verification

- Workflow fixture validation command for generated JSON/Markdown evidence
- Targeted unit tests for workflow input normalization and summary rendering
- Existing typecheck for touched packages
- `git diff --check`

## Success Criteria

- A developer or AI agent can run one documented command or script to produce a mobile-change verification bundle.
- The bundle clearly states platform, app target, policy profile, executed steps, readiness result, artifacts, and next action.
- CI can validate the bundle contract without physical devices.
