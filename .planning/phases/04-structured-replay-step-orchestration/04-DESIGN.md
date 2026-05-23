# Structured Replay Step Orchestration Design

**Date:** 2026-03-27
**Status:** Draft for review
**Source:** Brownfield design synthesis using current replay, recording, action-orchestration, evidence, and session runtime behavior

## 1. Purpose

This design upgrades replay from a black-box runner call into a step-aware execution surface that is explainable, auditable, and recoverable.

The primary goal is to make `run_flow` answer the questions that matter during replay:

- Which step is running now?
- Which steps already succeeded?
- Which steps remain?
- Why did a step fail?
- Was the failure terminal, retryable, recoverable, or handoff-required?
- Which evidence belongs to the failing step?
- Did the replay finish, stop early, or continue in degraded mode?

This document is a target-state design. It does not claim that the current repository already delivers the behavior described below.

## 2. Problem Statement

The repository already supports:

- passive recording and replay front door (`start_record_session -> end_record_session -> run_flow`)
- structured `RecordedStep` generation from raw recorded events
- action-level outcome classification, retry budgeting, bounded remediation, interruption handling, and evidence capture through `perform_action_with_evidence`

However, replay still has a structural gap:

- recorded flows are structured before replay, but replay execution is not structured at the same step granularity
- `run_flow` currently returns run-level results (`passedRuns`, `failedRuns`, `summaryLine`) rather than step-level execution outcomes
- failure evidence is not reliably attached to the exact replay step that triggered it
- replay cannot yet expose a trustworthy "completed steps / failed step / remaining steps" view to agents

The result is a split-brain model:

- recording knows about steps
- action execution knows about bounded recovery and explainable outcomes
- replay still behaves like a black-box wrapper around a runner

The target-state design closes that split.

## 3. Scope

### 3.1 In Scope

- Make `run_flow` a step-aware replay orchestrator while preserving its role as the replay tool
- Promote `RecordedStep` into the canonical replay execution unit
- Define step-level runtime state, outcome, evidence, retry, recovery, and stop/continue semantics
- Define step-level replay contracts and timeline/audit integration
- Reuse current action orchestration capabilities where possible instead of inventing a parallel policy
- Define a compatibility path from current runner-based replay toward MCP-native replay orchestration

### 3.2 Out of Scope

- Redesigning passive recording capture channels
- Building a visual recorded-step editor
- Introducing new OCR/CV primitives beyond current bounded fallback behavior
- Expanding public platform support claims in this design alone
- Solving business-specific app recipes or profile authoring in this document

## 4. Current Repo Truth

The design builds on these current behaviors:

- `RecordedStep` already exists as a structured output of recording and includes `stepNumber`, `actionType`, `actionIntent`, `confidence`, and warnings.
- `end_record_session` already maps raw events into `RecordedStep[]`, persists them, exports a replayable flow, and emits `stepCount`, `confidenceSummary`, and `reviewRequired`.
- `perform_action_with_evidence` already computes:
  - `failureCategory`
  - `stepState`
  - `retryDecisionTrace`
  - `postActionVerificationTrace`
  - `checkpointDecisionTrace`
  - evidence and timeline markers
- the action execution stack already uses bounded retry budgets, interruption guards, manual-handoff detection, terminal readiness checks, and bounded auto-remediation
- `run_flow` currently remains run-level and mostly runner-oriented

This means the repo already has the right primitives, but they are not yet unified into replay execution.

## 5. Design Goals

1. `run_flow` remains the replay entry point.
2. Replay results become step-aware rather than only run-aware.
3. Replay semantics reuse the existing deterministic-first, bounded-recovery, evidence-rich action model.
4. Replay can express both:
   - "hard stop now"
   - "recover and continue"
5. Crash, interruption, network, and readiness evidence can be attributed to a replay step instead of only the whole run.
6. Session, policy, and audit remain first-class; replay must not become an untracked side path.
7. Compatibility with existing runner-backed flows is preserved during migration, but target-state truth belongs to MCP-native orchestration.

## 6. Considered Approaches

### 6.1 Option A: Keep Runner Replay and Add Post-Hoc Step Parsing

Description:

- keep `run_flow` as a wrapper around the external runner
- parse runner logs after execution to infer which step failed

Pros:

- smallest initial code delta
- preserves current shell/runner integration

Cons:

- step attribution stays probabilistic
- stop/continue decisions remain hidden inside runner behavior
- evidence cannot be reliably bound to the exact failing step
- does not converge with the existing action-orchestration model

Verdict:

- acceptable only as an interim compatibility technique
- not sufficient for the target state

### 6.2 Option B: Make `run_flow` a Step-Aware Replay Orchestrator

Description:

- keep the tool name and replay role
- parse replay input into canonical replay steps
- execute each step via MCP-native orchestration
- emit structured step-level outcomes during and after replay

Pros:

- directly solves "current step / completed steps / remaining steps / why failed"
- reuses `perform_action_with_evidence` semantics
- allows bounded continue/stop decisions per step
- aligns replay with evidence, policy, and session timeline architecture

Cons:

- larger cross-layer change
- requires new contracts and migration work
- demands explicit handling of runner compatibility

Verdict:

- selected target-state architecture

### 6.3 Option C: Permanent Dual Replay Systems

Description:

- keep current runner replay forever
- add a second MCP-native replay path beside it

Pros:

- low migration pressure

Cons:

- long-term semantic drift
- duplicate docs, tests, failure models, and support language
- agents must choose between two replay truths

Verdict:

- rejected as the long-term design

## 7. Locked Decisions

### 7.1 Replay Entry Point

- `run_flow` remains the canonical replay tool.
- The external API should evolve rather than be replaced by a new top-level replay tool family.

### 7.2 Canonical Execution Unit

- `RecordedStep` becomes the canonical replay planning unit.
- Replay runtime may derive an internal richer form such as `ReplayStep`, but that internal model must preserve a stable mapping back to `RecordedStep.stepNumber`.

### 7.3 Continue/Stop Policy

- Replay does not use a naive global `stopOnFailure=true/false` model as its primary semantics.
- Continue/stop behavior is decided per step using step state, readiness, attribution strength, and bounded policy.
- Some failures are terminal.
- Some failures are recoverable with bounded retry or state recovery.
- Some failures are block-but-resumable after interruption handling.

### 7.4 Recovery Model

- Replay should inherit the current action-level bounded recovery logic rather than invent an unrelated replay-only policy.
- The target model should classify replay steps using the same or closely related concepts already present in action orchestration:
  - `terminal_stop`
  - `recoverable_waiting`
  - `partial_progress`
  - `degraded_but_continue_safe`
  - `replay_recommended`

### 7.5 Evidence Attribution

- Replay evidence must be step-scoped first and run-scoped second.
- A replay-level summary is still useful, but only after each step has a clear evidence window and outcome.

### 7.6 Migration Posture

- Existing runner-backed replay remains a compatibility lane during migration.
- The target-state truth, docs, and future support semantics should converge on MCP-native step orchestration rather than permanent log inference.

## 8. Target Architecture

```text
run_flow
  ->
Replay Flow Loader
  ->
Replay Step Planner
  ->
Replay Step Orchestrator
  -> for each step:
     - pre-step state capture
     - action execution
     - bounded retry / interruption handling / remediation
     - post-step verification
     - step evidence attribution
     - timeline + audit persistence
  ->
Replay Session Summary
  ->
RunFlowResult + step-level report
```

### 8.1 Main Units

#### A. Replay Flow Loader

Responsibilities:

- load replay input from flow file or future structured flow payload
- normalize YAML or exported flow into canonical replay step definitions
- reject unsupported or ambiguous steps early with structured warnings

Notes:

- this is parsing and validation, not execution
- it should preserve original source references for diagnostics

#### B. Replay Step Planner

Responsibilities:

- transform imported replay steps into runtime `ReplayStep[]`
- assign stable ids
- determine step dependencies and checkpoint candidates
- classify step intent at the replay layer

#### C. Replay Step Orchestrator

Responsibilities:

- execute steps one by one
- bridge each replay step into current MCP action execution
- decide whether to retry, recover, continue, or stop
- update replay progress after every step

#### D. Replay Evidence Binder

Responsibilities:

- bind screenshots, ui dumps, logs, crash signals, and diagnostics summaries to the step that caused or exposed them
- attach both direct artifacts and summarized suspect signals

#### E. Replay Timeline Persister

Responsibilities:

- write replay-step events into session timeline and audit surfaces
- preserve per-step causality without losing replay-level summaries

#### F. Replay Session Summary Builder

Responsibilities:

- compute completed, failed, skipped, and remaining step sets
- expose replay-level status and guidance to MCP clients

## 9. Replay Data Model

### 9.1 New Internal Runtime Model

Recommended internal shape:

```ts
type ReplayStep = {
  replayStepId: string;
  stepNumber: number;
  source: "recorded_step" | "flow_import";
  sourceRef?: string;
  actionType: ActionIntent["actionType"] | "tap";
  actionIntent?: ActionIntent;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  dependency?: {
    previousStepRequired: boolean;
    checkpointEligible: boolean;
  };
};
```

This is not necessarily a user-facing contract. It is the replay runtime's normalized execution unit.

### 9.2 New Step-Level Result Contract

Recommended contract addition:

```ts
type ReplayStepStatus =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped";

interface ReplayStepOutcome {
  replayStepId: string;
  stepNumber: number;
  status: ReplayStepStatus;
  reasonCode: ReasonCode;
  actionId?: string;
  startedAt?: string;
  endedAt?: string;
  attempts: number;
  boundedRecoveryAttempted: boolean;
  selectedRecovery?: "none" | "wait_until_ready" | "recover_to_known_state" | "replay_last_stable_path";
  outcome?: ActionOutcomeSummary;
  retryDecisionTrace?: RetryDecisionTrace;
  postActionVerificationTrace?: PostActionVerificationTrace;
  checkpointDecisionTrace?: CheckpointDecisionTrace;
  actionabilityReview?: string[];
  artifacts: string[];
  evidence?: ExecutionEvidence[];
  blockingStepNumber?: number;
  stopReason?: string;
}
```

### 9.3 Replay Progress Contract

Recommended addition:

```ts
interface ReplayProgressSummary {
  totalSteps: number;
  currentStepNumber?: number;
  completedSteps: number[];
  partialSteps: number[];
  failedSteps: number[];
  skippedSteps: number[];
  remainingSteps: number[];
  lastSuccessfulStepNumber?: number;
  firstFailedStepNumber?: number;
}
```

### 9.4 `RunFlowData` Target-State Extension

Recommended evolution:

```ts
interface RunFlowData {
  // existing fields remain during migration
  dryRun: boolean;
  harnessConfigPath: string;
  runnerProfile: RunnerProfile;
  runnerScript: string;
  flowPath: string;
  requestedFlowPath?: string;
  configuredFlows: string[];
  artifactsDir: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  command: string[];
  exitCode: number | null;
  summaryLine?: string;

  // new target-state fields
  executionMode?: "runner_compat" | "step_orchestrated";
  replayProgress?: ReplayProgressSummary;
  stepOutcomes?: ReplayStepOutcome[];
  finalReplayState?: OrchestrationStepState;
  checkpointSummary?: {
    lastCheckpointStepNumber?: number;
    replayRecommendedFromStepNumber?: number;
  };
}
```

Migration rule:

- existing run-level fields remain until all current integrations are updated
- step-level fields become the preferred source of truth for agents

## 10. Execution Semantics

### 10.1 Replay Loop

For each `ReplayStep`:

1. mark step as `running`
2. capture pre-step state/evidence window
3. execute the mapped action
4. run interruption guard and bounded retry logic
5. compute outcome classification
6. bind evidence to the step
7. decide continue/stop/skip
8. persist step outcome
9. update replay progress summary

### 10.2 Continue vs Stop Rules

Replay should reuse the current action model as the policy source of truth.

Recommended behavior:

- `terminal_stop`
  - stop replay immediately
  - mark current step failed
  - mark remaining steps pending or skipped with `blockingStepNumber`

- `recoverable_waiting`
  - allow bounded retry
  - if retry budget exhausts without meaningful state change, stop

- `partial_progress`
  - allow bounded retry
  - if progress exists but step outcome is incomplete, the replay summary should reflect partial completion, not binary success/failure only

- `degraded_but_continue_safe`
  - continue when policy allows and post-step verification says downstream steps remain meaningful

- `replay_recommended`
  - in replay context, this means local continuation is unsafe and rollback/checkpoint recovery is preferred
  - if checkpoint replay is not allowed or not available, stop with explicit reasoning

### 10.3 Manual Handoff

Replay must inherit current manual-handoff boundaries:

- OTP
- captcha
- protected-page or secure-input boundaries

Rules:

- do not silently continue through these states
- surface the step as blocked or partial with handoff-required semantics
- preserve remaining steps for possible resumption

### 10.4 Interruption Handling

Replay should treat interruption resolution as part of normal step orchestration, not as an external afterthought.

Expected flow:

1. pre-step interruption guard
2. step execution
3. post-step interruption check
4. bounded resume if the interruption was auto-resolved

### 10.5 Crash and Terminal Readiness

Replay must stop early when the post-step state is terminal, including:

- `backend_failed_terminal`
- `offline_terminal`
- app crash or equivalent runtime terminal boundary

Crash-aware stop is required because continuing would only create misleading downstream failures.

## 11. Evidence and Timeline Integration

### 11.1 Step Evidence Window

Every replay step should define an evidence window:

- pre-step state summary
- post-step state summary
- post-step logs summary
- post-step crash summary
- optional diagnostics or debug packet references

This mirrors the current action evidence model rather than using a replay-only evidence packet.

### 11.2 Timeline Events

Recommended replay-specific timeline event types:

- `replay_started`
- `replay_step_started`
- `replay_step_retry_decision`
- `replay_step_recovered`
- `replay_step_failed`
- `replay_step_completed`
- `replay_paused_for_handoff`
- `replay_stopped`
- `replay_completed`

Rules:

- replay step events must carry `stepNumber`
- if the step triggered an action record, timeline entries should reference `actionId`
- replay-level events must not replace action-level events; they should complement them

### 11.3 Artifact Organization

Recommended structure:

- `artifacts/replay/<sessionId>/steps/<stepNumber>/...`
- `artifacts/replay/<sessionId>/summary/...`

This structure helps separate:

- step-local evidence
- replay-summary evidence
- imported runner compatibility artifacts if still present during migration

## 12. Relationship to Current Runner-Based Replay

### 12.1 Compatibility Lane

During migration, the system may still support a compatibility mode where:

- flow execution is delegated to the current runner
- best-effort step inference is emitted when possible
- `executionMode = "runner_compat"`

This mode is transitional.

### 12.2 Target-State Lane

Target state:

- flow parsing and step execution are owned by MCP-native orchestration
- `executionMode = "step_orchestrated"`

### 12.3 Why Both May Exist Temporarily

Some existing profiles and scripts depend on:

- shell runner scripts
- environment-specific wiring
- bundle execution assumptions

These should be migrated progressively instead of broken abruptly.

## 13. Replay Input Mapping

### 13.1 Recorded Flow Path

Replay imported from recorded steps should preserve:

- step numbers
- step confidence
- selector quality warnings

These warnings matter for future failure interpretation.

### 13.2 Non-Recorded Flow Path

For existing hand-authored flow YAML, replay should still normalize steps into the same canonical runtime model.

Rules:

- parser should annotate steps that came from imported YAML rather than recorded steps
- unsupported YAML constructs should produce structured warnings early

## 14. Recovery and Checkpoint Model

### 14.1 Checkpoint Source

Replay checkpoints should come from successful, meaningful state transitions rather than arbitrary step boundaries.

The current action model already identifies checkpoint candidates. Replay should adopt the same rule:

- checkpoint only when a step causes meaningful progress and stable postcondition confidence

### 14.2 Replay Recovery Options

Recommended recovery strategies available to replay:

- `none`
- `wait_until_ready`
- `recover_to_known_state`
- `replay_last_stable_path`

### 14.3 Resume Semantics

If replay pauses for handoff or bounded recovery stops short of completion, the system should preserve enough state to resume from:

- the blocked step
- or the last stable checkpoint if the blocked step is not safe to resume locally

## 15. Contract and File Ownership

### 15.1 Contracts

Primary ownership:

- `packages/contracts/src/types.ts`
- `packages/contracts/src/index.ts`

Changes:

- add replay step outcome and progress summary types
- extend `RunFlowData`
- keep backward compatibility while transitioning clients

### 15.2 Core

Primary ownership:

- `packages/core/src/session-store.ts`
- `packages/core/src/session-record-store.ts`
- `packages/core/src/action-record-store.ts`

Changes:

- persist replay-step timeline and audit records
- support replay artifact indexing and lookup

### 15.3 Adapter Runtime

Primary ownership:

- `packages/adapter-maestro/src/flow-runtime.ts`
- recommended additions:
  - `packages/adapter-maestro/src/replay-step-orchestrator.ts`
  - `packages/adapter-maestro/src/replay-step-planner.ts`
  - `packages/adapter-maestro/src/replay-step-persistence.ts`

Changes:

- move `run_flow` from runner-summary semantics toward step orchestration
- reuse `performActionWithEvidenceWithMaestro` as the per-step execution engine where possible

### 15.4 MCP Server

Primary ownership:

- `packages/mcp-server/src/tools/run-flow.ts`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/server.ts`

Changes:

- preserve the same tool name
- expose extended structured response fields
- keep policy/session wrapping behavior aligned with other session-bound write tools

### 15.5 Docs

Primary ownership:

- `docs/guides/flow-generation.md`
- `docs/guides/ai-agent-invocation.zh-CN.md`
- relevant architecture docs under `docs/architecture/`

Changes:

- update `run_flow` guidance from runner-oriented replay to step-aware replay semantics
- document compatibility mode honestly while migration is incomplete

## 16. Migration Plan

### Phase A: Contract and Report Layer

Goal:

- extend replay contracts and report structure without yet replacing all runtime behavior

Deliverables:

- new step-level result types
- `RunFlowData` extension
- compatibility mode marker

### Phase B: Step Planner and Replay Step Persistence

Goal:

- load replay input into canonical `ReplayStep[]`
- persist replay progress and step placeholders even before full orchestration

Deliverables:

- replay step parser/planner
- replay-step persistence and progress summary generation

### Phase C: Step-Orchestrated Execution Path

Goal:

- execute replay one step at a time using MCP-native orchestration

Deliverables:

- step execution loop
- per-step outcomes
- bounded retry / interruption / handoff / stop semantics

### Phase D: Evidence and Crash Attribution Binding

Goal:

- bind diagnostics and failure evidence to the replay step that triggered the problem

Deliverables:

- step-scoped evidence windows
- replay-step crash/network/runtime attribution

### Phase E: Compatibility Narrowing

Goal:

- reduce reliance on runner-compat mode and update docs/support semantics

Deliverables:

- explicit support boundary by profile/path
- de-emphasize or retire black-box replay paths where feasible

## 17. Testing Strategy

### 17.1 Contract Tests

- `RunFlowData` backward compatibility
- step outcome schema stability
- replay progress summary correctness

### 17.2 Runtime Unit Tests

- step planner normalization for recorded and imported flows
- continue/stop decisions by step state
- retry budget exhaustion behavior
- manual-handoff pause behavior
- checkpoint selection and replay recommendation behavior

### 17.3 Integration Tests

- recorded flow replay produces step-level outcomes
- terminal crash stops replay at the correct step
- blocked-but-recoverable step continues after bounded recovery
- remaining steps are correctly marked after stop

### 17.4 Evidence Tests

- failing step artifacts are stored under the expected step scope
- crash and log summaries are attached to the correct step outcome
- replay timeline and action timeline stay consistent

## 18. Risks and Mitigations

### Risk 1: Semantic Drift Between Replay and Action Execution

Mitigation:

- reuse current action orchestration contracts and classification logic wherever possible
- avoid replay-only failure taxonomies unless absolutely necessary

### Risk 2: Permanent Two-Truth Replay Semantics

Mitigation:

- make compatibility mode explicit
- treat step-orchestrated replay as the target-state canonical path

### Risk 3: Excessive Artifact Volume

Mitigation:

- prefer summarized evidence by default
- keep heavy diagnostics gated and step-scoped
- honor current retention policy boundaries

### Risk 4: False Continue After Terminal Failure

Mitigation:

- terminal readiness and crash signals must override optimistic continuation
- preserve strong early-stop rules for backend/offline/crash/manual-handoff boundaries

## 19. Acceptance Criteria for This Design

This design is considered implemented only when all of the following become true in repo behavior:

1. `run_flow` can return step-level structured outcomes, not only run-level totals.
2. Replay can identify current, completed, failed, skipped, and remaining steps.
3. Replay stop/continue behavior is driven by bounded step semantics rather than only a coarse global flag.
4. Crash, interruption, and readiness evidence can be attributed to a replay step.
5. Replay writes session/timeline/audit artifacts consistent with the existing action execution model.
6. Public guidance describes replay support truthfully during migration and after convergence.

## 20. Canonical References

The following files are the current repo truth or architectural context this design depends on:

- `/Users/linan/Documents/mobile-e2e-mcp/packages/adapter-maestro/src/recording-mapper.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/adapter-maestro/src/recording-runtime.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/adapter-maestro/src/flow-runtime.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/adapter-maestro/src/action-orchestrator.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/adapter-maestro/src/action-orchestrator-model.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/mcp-server/src/tools/perform-action-with-auto-remediation.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/packages/contracts/src/types.ts`
- `/Users/linan/Documents/mobile-e2e-mcp/docs/strategy/record-replay-productization.md`
- `/Users/linan/Documents/mobile-e2e-mcp/docs/strategy/record-replay-structural-fix-plan.md`
- `/Users/linan/Documents/mobile-e2e-mcp/docs/architecture/evidence-timeline-architecture.zh-CN.md`
- `/Users/linan/Documents/mobile-e2e-mcp/docs/architecture/session-orchestration-architecture.zh-CN.md`

## 21. Assumptions Used for This Draft

- `run_flow` remains the replay-facing MCP tool instead of being replaced by a new top-level tool
- target-state design takes precedence over minimal-change compatibility
- some compatibility with current external runner execution is still needed during migration
- replay should inherit current bounded retry and remediation principles rather than introduce a second governance model
- the user will review this document as a whole and request changes afterward rather than approve section by section
