# AI-First Implementation Plan

## 1. Goal

Turn the current repository from a useful collection of mobile MCP tools into an AI-first execution platform.

Concrete target:

- The agent should be able to understand current state quickly.
- Each important action should produce structured outcome evidence.
- Failures should be attributable to a likely layer without reading raw artifacts by default.
- The system should support bounded recovery and repeated execution with lower analysis cost over time.

This plan is intentionally implementation-oriented. It assumes the current package layout:

- `packages/contracts`
- `packages/core`
- `packages/adapter-maestro`
- `packages/mcp-server`

## 2. Non-Goals For This Plan

- Full human debugger UI parity
- Full source-level RN debugger parity
- Large-scale cloud device farm design
- Broad OCR/CV expansion before deterministic and attribution layers are stable

## 3. Delivery Principles

### 3.1 Optimize For AI Decisions, Not Just Tool Coverage

Do not add a tool only because it is easy to expose. Add it when it materially improves:

- state understanding
- action verification
- failure attribution
- bounded recovery

### 3.2 Prefer Wrapping Existing Primitives Before Adding Entirely New Backends

The repository already has enough low-level building blocks to support the first AI-first layer:

- session model
- UI inspection
- action primitives
- logs and crash capture
- RN inspector snapshots
- performance snapshots

The next layer should orchestrate these primitives rather than replacing them.

### 3.3 Every New Tool Must Be Explicit About Certainty

Each new tool should explicitly communicate:

- determinism tier
- fallback usage
- confidence
- missing evidence
- recommended next step

## 4. Workstreams

## WS-1: Contract And Session Foundation

Primary packages:

- `packages/contracts`
- `packages/core`

Deliverables:

- Extend session and tool result contracts for AI-first summaries.
- Add typed action event and state summary models.
- Add a normalized timeline event schema.
- Add basic evidence completeness markers.

Why this comes first:

Without a stable contract, later tool work becomes ad hoc and hard to consume consistently.

## WS-2: State And Readiness Layer

Primary packages:

- `packages/adapter-maestro`
- `packages/mcp-server`

Deliverables:

- `get_session_state`
- `get_screen_summary`
- stronger `wait_until_ready` semantics

Why this matters:

The agent needs compact current-state visibility before it can choose actions reliably.

## WS-3: Action Outcome And Evidence Layer

Primary packages:

- `packages/contracts`
- `packages/core`
- `packages/adapter-maestro`
- `packages/mcp-server`

Deliverables:

- `perform_action_with_evidence`
- `get_action_outcome`
- post-action evidence capture helpers

Why this matters:

Transport-level success is not enough. The system has to report app-level outcome.

## WS-4: Causal Timeline And Failure Attribution

Primary packages:

- `packages/core`
- `packages/adapter-maestro`
- `packages/mcp-server`

Deliverables:

- unified causal timeline inside the session
- `explain_last_failure`
- `rank_failure_candidates`

Why this matters:

This is the point where the system becomes an AI debugging substrate instead of a tool bag.

## WS-5: Recovery And Re-Entry

Primary packages:

- `packages/adapter-maestro`
- `packages/mcp-server`
- `packages/core`

Deliverables:

- `recover_to_known_state`
- interruption-aware re-entry primitives
- replay of last stable path

Why this matters:

Longer autonomous runs require bounded recovery instead of manual restart.

## WS-6: Baseline Memory And Similar Failure Reuse

Primary packages:

- `packages/core`
- `packages/mcp-server`

Deliverables:

- failure signature persistence
- baseline comparison
- similar incident lookup

Why this matters:

Without memory, repeated failures cost the same every time.

## 5. Recommended Phase Plan

## Phase A: Contract Spine

Priority: `P0`

### Scope

- Add AI-first contract types.
- Extend session timeline model.
- Define shared reason and attribution enums where needed.

### Required Contract Additions

Add new typed models in `packages/contracts/src/types.ts`:

- `StateSummary`
- `ActionIntent`
- `ActionOutcomeSummary`
- `EvidenceDeltaSummary`
- `FailureAttribution`
- `TimelineEvent`
- `EvidenceCompleteness`

Suggested fields for `StateSummary`:

- `screenId?: string`
- `screenTitle?: string`
- `routeName?: string`
- `appPhase: "launching" | "ready" | "loading" | "blocked" | "backgrounded" | "crashed" | "unknown"`
- `readiness: "ready" | "waiting_network" | "waiting_ui" | "interrupted" | "unknown"`
- `blockingSignals: string[]`
- `visibleTargetCount?: number`
- `candidateActions?: string[]`
- `recentFailures?: string[]`

Suggested fields for `ActionOutcomeSummary`:

- `actionId: string`
- `actionType: string`
- `resolutionStrategy: "deterministic" | "semantic" | "ocr" | "cv"`
- `preState?: StateSummary`
- `postState?: StateSummary`
- `stateChanged: boolean`
- `fallbackUsed: boolean`
- `retryCount: number`
- `confidence?: number`
- `outcome: "success" | "failed" | "partial" | "unknown"`

Suggested fields for `FailureAttribution`:

- `affectedLayer: "ui_locator" | "ui_state" | "interruption" | "network" | "backend" | "runtime" | "crash" | "performance" | "environment" | "test_logic" | "unknown"`
- `mostLikelyCause: string`
- `candidateCauses: string[]`
- `missingEvidence: string[]`
- `recommendedNextProbe?: string`
- `recommendedRecovery?: string`

### Package Tasks

`packages/contracts`

- Add the new types.
- Update schema generation if applicable.
- Keep all additions backward-compatible for existing tools.

`packages/core`

- Extend session store to persist richer timeline events.
- Add helper builders for timeline append and evidence completeness scoring.

### Acceptance

- Existing tools still compile unchanged.
- New types are available to all packages.
- Session timeline can record typed events beyond the current string-only shape.

## Phase B: State And Readiness

Priority: `P0`

### Scope

- Add `get_session_state`.
- Add `get_screen_summary`.
- Add a readiness decision that synthesizes UI, logs, and blocking conditions.

### New MCP Tools

- `get_session_state`
- `get_screen_summary`

### Implementation Notes

`packages/adapter-maestro`

- Reuse `inspect_ui`, `query_ui`, and session metadata to derive compact screen summaries.
- Start simple: do not attempt universal route detection on day one.
- Prefer heuristic fields such as visible texts, top actionable nodes, loading indicators, dialog presence, keyboard hints, and interruption hints.

`packages/mcp-server`

- Expose new tools in `src/stdio-server.ts`.
- Add tool wrappers under `src/tools/`.

`packages/core`

- Store latest known state summary per session.

### First-Cut Heuristics

`get_screen_summary` can initially return:

- top visible texts
- likely actionable nodes
- whether a blocking dialog or spinner is present
- whether the screen appears stable or still changing
- whether the app appears to be waiting on network or user input

### Acceptance

- Given a running sample app, the agent can call `get_screen_summary` and receive a compact screen summary without reading the raw UI dump.
- Given a blocked state such as a dialog or spinner, `get_session_state` surfaces that as a blocking signal.
- For at least one Android and one iOS sample flow, the returned summary is stable across repeated runs.

## Phase C: Action Outcome And Evidence

Priority: `P0`

### Scope

- Introduce action-level wrappers that collect pre/post evidence automatically.
- Make app-level outcome explicit.

### New MCP Tools

- `perform_action_with_evidence`
- `get_action_outcome`

### Recommended Strategy

Do not replace all existing action tools immediately.

Instead:

1. Keep `tap`, `tap_element`, `type_text`, `type_into_element`, `run_flow` as low-level primitives.
2. Build `perform_action_with_evidence` as a higher-order tool that wraps one bounded action.
3. Internally capture:
   - pre-state summary
   - action execution result
   - post-state summary
   - log delta
   - optional network/JS delta when available

### Minimum Supported Action Types

- tap by selector
- type into selector
- wait for selector
- launch app
- terminate app

### Package Tasks

`packages/contracts`

- Add `PerformActionWithEvidenceInput`
- Add `PerformActionWithEvidenceData`
- Add `GetActionOutcomeInput`
- Add `GetActionOutcomeData`

`packages/core`

- Persist action records keyed by `actionId`
- Persist evidence deltas by action

`packages/adapter-maestro`

- Implement orchestration helpers around existing low-level actions.

`packages/mcp-server`

- Expose the new tools.

### Acceptance

- A successful tap returns whether the app state changed, not just whether the tap command ran.
- A failed action includes pre-state, post-state, and a short delta summary.
- The action record can be retrieved later through `get_action_outcome`.

## Phase D: Causal Timeline And Failure Attribution

Priority: `P0`

### Scope

- Merge action, UI, logs, JS evidence, network signals, and performance hints into one session timeline.
- Add first-pass failure attribution.

### New MCP Tools

- `explain_last_failure`
- `rank_failure_candidates`

### Implementation Notes

`packages/core`

- Introduce a normalized timeline event model with:
  - `eventId`
  - `timestamp`
  - `eventType`
  - `actionId?`
  - `layer`
  - `summary`
  - `artifactRefs`

- Add a timeline query helper that can retrieve events around an action window.

`packages/adapter-maestro`

- Emit timeline events for:
  - action start/end
  - UI inspection snapshots
  - log summary capture
  - JS console/network snapshots
  - performance summary capture

`packages/mcp-server`

- Implement attribution tools using deterministic heuristics first.

### First-Pass Attribution Rules

Start with simple rules, for example:

- no UI change + resolved target + no network + no runtime error -> likely `ui_state`
- action ambiguous or unresolved -> likely `ui_locator`
- error dialog or permission prompt detected -> likely `interruption`
- HTTP 4xx/5xx after action -> likely `network` or `backend`
- JS exception immediately after action -> likely `runtime`
- crash signal after action -> likely `crash`
- long performance stall before timeout -> likely `performance`

Do not use opaque model-only attribution at this stage.

### Acceptance

- For a failed sample flow, `explain_last_failure` identifies the failing action and one likely layer.
- Attribution returns missing evidence when the evidence window is weak.
- The result is useful without opening raw artifacts by default.

## Phase E: Recovery And Re-Entry

Priority: `P0`

### Scope

- Implement bounded recovery primitives.
- Reuse interruption policies and state summaries.

### New MCP Tools

- `recover_to_known_state`
- `replay_last_stable_path`

### Recovery Strategies

First implementation should support a bounded set only:

- dismiss known interruption
- relaunch app
- navigate back
- wait for ready state
- re-run last successful bounded step

Do not attempt open-ended planning inside the recovery tool itself.

### Package Tasks

`packages/core`

- Persist last known stable state and last stable action path.

`packages/adapter-maestro`

- Implement reusable recovery helpers per platform.

`packages/mcp-server`

- Expose recovery tools with explicit policy requirements.

### Acceptance

- For a known interruption or transient blocked state, the system can recover without manual restart.
- Recovery actions are fully recorded in the session timeline.
- Recovery stops when deterministic guarantees are lost.

## Phase F: Historical Memory And Baselines

Priority: `P1`

### Scope

- Store normalized failure signatures.
- Compare current runs with prior successful baselines.

### New MCP Tools

- `find_similar_failures`
- `compare_against_baseline`
- `suggest_known_remediation`

### Package Tasks

`packages/core`

- Add a small local index for failure signatures and baseline metadata.
- Start file-backed inside the workspace; do not over-design a remote store yet.

`packages/mcp-server`

- Expose lookup and comparison tools.

### Signature Strategy

Build failure signatures from:

- action type
- screen summary
- affected layer
- top error signal
- top failed host or status
- interruption category if present

### Acceptance

- The system can identify that a new failure resembles a known failure class.
- The system can compare the failed step against a stored successful baseline and summarize the main differences.

## 6. Concrete Backlog

## Sprint 1

- Add AI-first types to `packages/contracts/src/types.ts`
- Extend session timeline structure in `packages/core`
- Add `get_session_state`
- Add `get_screen_summary`
- Add tests for state summaries on existing sample fixtures

Exit criteria:

- Agent can ask for compact current state and receive a stable answer.

## Sprint 2

- Add `perform_action_with_evidence`
- Add `get_action_outcome`
- Record pre/post state and evidence deltas
- Add tests for successful and failed actions

Exit criteria:

- Agent can verify whether an action changed the app state.

## Sprint 3

- Add unified timeline events
- Add `explain_last_failure`
- Add deterministic attribution rules
- Add tests using known failure fixtures

Exit criteria:

- Agent can identify likely failing layer without opening raw artifacts first.

## Sprint 4

- Add `recover_to_known_state`
- Add bounded replay of last stable step
- Wire interruption-driven recovery for supported cases

Exit criteria:

- Agent can recover from at least one known blocked state on Android and one on iOS simulator.

## Sprint 5

- Add baseline comparison
- Add similar failure lookup
- Add remediation suggestion plumbing

Exit criteria:

- Repeated failures become cheaper to analyze than first-time failures.

## 7. File-Level Change Guide

Start with these files and directories.

Contracts:

- `packages/contracts/src/types.ts`

Core:

- `packages/core/src/session-store.ts`
- `packages/core/src/index.ts`

MCP server:

- `packages/mcp-server/src/stdio-server.ts`
- `packages/mcp-server/src/tools/`

Adapter:

- `packages/adapter-maestro/src/index.ts`
- `packages/adapter-maestro/src/ui-model.ts`
- `packages/adapter-maestro/src/ui-tools.ts`
- `packages/adapter-maestro/src/js-debug.ts`
- `packages/adapter-maestro/src/device-runtime.ts`

Tests:

- `packages/mcp-server/test/`
- `packages/adapter-maestro/test/`

## 8. Implementation Order Inside Code

Recommended coding order:

1. Add contract types.
2. Add core session/timeline persistence helpers.
3. Add adapter-side state summarization helpers.
4. Expose `get_session_state` and `get_screen_summary`.
5. Add action wrapper orchestration.
6. Add attribution and recovery on top of the stored timeline.

This order minimizes churn because later tools build on earlier stored state instead of re-collecting everything ad hoc.

## 9. Cut Lines

If implementation time is limited, keep these cut lines.

Safe to postpone:

- generalized route detection
- full RN runtime probing
- full response body capture
- cross-run remote memory service
- broad OCR/CV expansion
- complex autonomous recovery planning

Do not postpone:

- compact state summary
- action outcome reporting
- unified causal timeline
- failure attribution skeleton
- bounded recovery for known cases

## 10. Acceptance Checklist For The Whole Plan

The plan is succeeding when all of the following are true.

- The agent can inspect current state through a compact summary.
- The agent can perform one bounded action and know whether the app changed.
- The agent can explain the last failure in structured terms.
- The agent can recover from a known interruption or blocked state.
- The agent can compare a repeated failure against a prior baseline or signature.

If one of these remains impossible without manually reading raw artifacts or manually restarting the app, the AI-first implementation is still incomplete.
