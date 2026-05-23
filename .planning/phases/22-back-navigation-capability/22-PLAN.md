---
phase: 22-back-navigation-capability
plan: 01
title: Add a first-class navigate_back capability with explicit Android/iOS support boundaries
status: completed
summary_file: 22-SUMMARY.md
verify_file: 22-VERIFY.md
type: execute
wave: 1
depends_on:
  - 19-01
  - 20-PLAN
must_haves:
  truths:
    - The MCP tool surface exposes a first-class back-navigation entrypoint instead of relying on flow-only back semantics.
    - Android back navigation is implemented through a deterministic owned-adb path with explicit outcome/evidence semantics.
    - iOS support does not overclaim a universal system-back primitive; unsupported and conditional paths are explicit in contracts, capability reporting, and docs.
    - The capability is introduced without expanding adapter-maestro/src/index.ts with new low-level runtime logic.
    - Public tool contracts, server registry, capability model, docs, and contract tests stay in sync.
  artifacts:
    - .planning/phases/22-back-navigation-capability/22-PLAN.md
    - packages/contracts/src/constants/tool-names.ts
    - packages/contracts/src/types.ts
    - packages/contracts/src/reason-codes.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/tools/navigate-back.ts
    - packages/adapter-maestro/src/ui-action-tools.ts
    - packages/adapter-maestro/src/ui-runtime-android.ts
    - packages/adapter-maestro/src/capability-model.ts
    - packages/mcp-server/test/server.test.ts
    - packages/mcp-server/test/stdio-server.test.ts
    - packages/mcp-server/test/tool-output-contracts.test.ts
    - README.md
    - docs/guides/ai-agent-invocation.zh-CN.md
---

# Phase 22 Plan 01 — First-Class Back Navigation Capability

## Objective

- **What:** Add a first-class `navigate_back` MCP capability that exposes app/system back navigation to agents with explicit platform semantics and structured evidence.
- **Why:** The repo already supports `back` in replay/recording internals and Android runtime command paths, but the public tool surface does not expose a direct back-navigation capability. This creates an agent-facing gap and encourages awkward workarounds through `run_flow` or tool-specific hacks.
- **Output:** A planned implementation slice that lands `navigate_back` as a public capability, preserves deterministic-first execution, and keeps Android/iOS support boundaries honest.

## Context

Current repo truth shows an asymmetric state:

1. `packages/contracts/src/constants/action-types.ts` already defines `ACTION_TYPES.back` and replay planning accepts `back` steps.
2. `packages/adapter-maestro/src/replay-step-planner.ts` and `packages/adapter-maestro/src/flow-runtime.ts` already treat `back` as a supported replay/runtime action.
3. Android runtime already has a concrete deterministic primitive (`adb shell input keyevent 4`) in `packages/adapter-maestro/src/ui-runtime-android.ts`.
4. The public MCP contract map in `packages/mcp-server/src/server.ts` does **not** expose a back tool, and `packages/contracts/src/types.ts` still keeps `SupportedActionType` narrower than internal replay semantics.
5. iOS runtime currently has tap/type/swipe/hierarchy paths but no universal first-class system-back primitive. Any iOS support must therefore be explicit about conditional or unsupported paths.

This plan intentionally treats `navigate_back` as a capability-surface change governed by the AI-first capability expansion guideline rather than a local runtime tweak.

## Scope

### In Scope

- Introduce a first-class `navigate_back` MCP tool and supporting contracts.
- Define platform-specific semantics for Android and iOS.
- Add structured output/evidence semantics so back navigation is auditable.
- Update capability reporting, tests, and canonical invocation/docs text.
- Stage a safe path for later integration into `perform_action_with_evidence`.

### Out of Scope

- Full unification of `navigate_back` into `perform_action_with_evidence` in the same slice.
- Any claim of universal iOS system-back parity.
- Gesture-guessing heuristics that are not explicit, bounded, and evidence-backed.
- Unrelated refactors to replay/runtime systems beyond what is necessary to host the new capability cleanly.

## Plan

### Strategy

Implement this as a phased capability addition:

1. **Phase 22 baseline slice:** add a dedicated top-level `navigate_back` tool with explicit Android full support and iOS conditional/unsupported semantics.
2. **Later follow-up slice:** extend `perform_action_with_evidence` / planner-orchestrator paths to include back as a first-class action intent once the direct tool is proven and contract drift can be resolved safely.

This keeps the first merge small enough to review while still closing the immediate tool-surface gap.

### Read First

- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/PLANNING-PROTOCOL.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/architecture/adapter-code-placement.md`
- `packages/contracts/src/types.ts`
- `packages/contracts/src/constants/action-types.ts`
- `packages/contracts/src/constants/tool-names.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/index.ts`
- `packages/adapter-maestro/src/ui-action-tools.ts`
- `packages/adapter-maestro/src/ui-runtime-android.ts`
- `packages/adapter-maestro/src/ui-runtime-ios.ts`
- `packages/adapter-maestro/src/replay-step-planner.ts`
- `packages/adapter-maestro/src/capability-model.ts`

### Task Breakdown

1. Define the `navigate_back` capability boundary and contract shape in `packages/contracts`.
2. Add MCP server wiring and policy/session wrapper support without introducing runtime logic into server layers.
3. Implement Android deterministic back execution through the existing owned-adb runtime path.
4. Implement bounded iOS semantics: `app` back only when an explicit deterministic selector path exists; reject unsupported `system` back clearly.
5. Add reason-code, output contract, registry, and capability model coverage.
6. Update docs and invocation guidance so support boundaries are explicit.
7. Record a follow-up note for future `perform_action_with_evidence` integration once the direct tool is stable.

### Risks / Unknowns

- **Semantic ambiguity on Android:** the same key event can mean page-back or app-exit depending on app state.
- **No true iOS system-back primitive:** the tool must not imply cross-platform parity that the runtime cannot prove.
- **Contract drift:** internal replay already models `back`, while public action contracts do not.
- **Policy scope choice:** reusing an existing interaction scope is easier, but a dedicated navigation scope may be cleaner long-term.
- **False transport-success:** a sent command is not enough; outcome semantics need pre/post state evidence where practical.

### Done Criteria

- [ ] `navigate_back` exists as a public MCP tool in contracts, server registry, and descriptors.
- [ ] Android `navigate_back` uses a deterministic runtime path and returns structured outcome metadata.
- [ ] iOS behavior is explicitly limited to supported conditional paths and returns clear unsupported outcomes otherwise.
- [ ] Capability model and public docs describe support boundaries honestly.
- [ ] Contract tests, server tests, and stdio/catalog drift checks cover the new tool.
- [ ] A follow-up note documents the later `perform_action_with_evidence` integration path.

## Implement

### Planned Changes

- `packages/contracts/src/constants/tool-names.ts` — add canonical `navigate_back` tool name.
- `packages/contracts/src/types.ts` — add `NavigateBackInput` / `NavigateBackData` and any shared supporting enums such as `BackTarget` / `BackExecutionPath`.
- `packages/contracts/src/reason-codes.ts` — add any back-specific reason code only if the existing taxonomy cannot express unsupported/failed/ambiguous back outcomes cleanly.
- `packages/mcp-server/src/server.ts` — register the new tool contract in `MobileE2EMcpToolContractMap`.
- `packages/mcp-server/src/tools/navigate-back.ts` — thin wrapper for policy/session aware invocation.
- `packages/mcp-server/src/index.ts` — add descriptor metadata, handler registration, and session-context wiring.
- `packages/core/src/policy-engine.ts` — map the tool to the correct policy scope if current scope mapping requires changes.
- `packages/adapter-maestro/src/ui-action-tools.ts` — add orchestration entrypoint for back navigation.
- `packages/adapter-maestro/src/ui-runtime-android.ts` — host Android back command execution using existing deterministic primitive.
- `packages/adapter-maestro/src/ui-runtime-ios.ts` or focused helper — host iOS bounded app-back behavior without inventing a false system-back abstraction.
- `packages/adapter-maestro/src/capability-model.ts` — expose Android/iOS support levels and notes.
- `packages/mcp-server/test/server.test.ts` — add direct server invocation coverage.
- `packages/mcp-server/test/stdio-server.test.ts` — add stdio tool listing/invocation coverage.
- `packages/mcp-server/test/tool-output-contracts.test.ts` — add output contract coverage for the new tool.
- `README.md` — add the tool to the catalog if shipped.
- `docs/guides/ai-agent-invocation.zh-CN.md` — update canonical invocation guidance if tool sequencing changes.

### Key Decisions To Preserve

- Keep `adapter-maestro/src/index.ts` a thin facade; do not add low-level back execution helpers there.
- Ship `navigate_back` as a dedicated top-level tool first; defer `perform_action_with_evidence` expansion to a follow-up plan.
- Android support may be `full`; iOS `system` back must remain `unsupported` until a real runtime path exists.
- Any iOS fallback gesture path must be labeled conditional/experimental and surfaced explicitly in result data.
- Prefer structured evidence fields over raw transport-only success booleans.

### Proposed API Shape

#### Input

```ts
type BackTarget = "app" | "system";
type IosBackStrategy = "selector_tap" | "edge_swipe";

interface NavigateBackInput {
  sessionId?: string;
  platform?: Platform;
  deviceId?: string;
  runnerProfile?: RunnerProfile;
  harnessConfigPath?: string;
  dryRun?: boolean;
  target?: BackTarget;
  iosStrategy?: IosBackStrategy;
  selector?: InspectUiQuery;
}
```

#### Output data

```ts
type BackExecutionPath =
  | "android_keyevent"
  | "ios_selector_tap"
  | "ios_edge_swipe"
  | "unsupported";

interface NavigateBackData {
  dryRun: boolean;
  target: BackTarget;
  executedStrategy: BackExecutionPath;
  supportLevel: CapabilitySupportLevel;
  fallbackUsed: boolean;
  command?: string;
  exitCode?: number | null;
  preStateSummary?: string;
  postStateSummary?: string;
  stateChanged?: boolean | "unknown";
}
```

### Follow-up Slice (not part of this plan)

After `navigate_back` ships and stabilizes:

1. Expand `SupportedActionType` / `ActionIntent` and `perform_action_with_evidence` to support back intents.
2. Reconcile internal replay `back` semantics with public action contracts.
3. Ensure action-outcome persistence, remediation, and replay checkpoints treat back as a first-class action rather than a tool-only special case.

## Verify

### Test Cases

- [ ] Server lists `navigate_back` in the MCP tool catalog.
- [ ] Android dry-run returns deterministic command metadata for back navigation.
- [ ] Android real invocation path reports structured output and does not degrade silently.
- [ ] iOS `target: "system"` returns an explicit unsupported/conditional outcome rather than pretending success.
- [ ] iOS `target: "app"` with explicit selector path produces the documented execution strategy.
- [ ] Capability reporting shows the correct support notes for Android vs iOS.
- [ ] Tool output contract validation passes with the new tool payload.
- [ ] README/tool-catalog drift checks stay green.

### Verification Commands

```bash
pnpm build
pnpm typecheck
pnpm test:ci
pnpm validate:architecture-guardrails
pnpm validate:tool-output-contracts
```

### Acceptance Criteria

- Agents can invoke a first-class back-navigation tool without falling back to `run_flow` just to press back.
- Android support is deterministic-first and auditable.
- iOS support language matches real runtime truth and does not imply unsupported system behavior.
- The new capability lands without breaking server/catalog/output-contract guardrails.

### Success Criteria

- `navigate_back` becomes a repo-tracked capability with aligned contracts, runtime, tests, and docs.
- The plan leaves a clear, low-risk path for future integration into `perform_action_with_evidence`.
