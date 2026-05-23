# Scroll-Only Gesture Control Design

**Date:** 2026-04-10
**Status:** Draft for review
**Source:** Brownfield design synthesis using current `scroll_only` contract, adapter runtime, MCP exposure, and AI-facing invocation guidance

## 1. Purpose

This design upgrades `scroll_only` from a direction-only black-box scroll helper into a tool that still supports simple default swipes but can also express precise, viewport-relative gestures.

The goal is to make `scroll_only` useful for two different classes of callers:

- simple callers that only want “scroll once in a direction”
- precision callers that need explicit horizontal or vertical gesture control without dropping to raw coordinates

This document is a target-state design. It does not claim that the current repository already delivers the behavior described below.

## 2. Problem Statement

The current `scroll_only` input is intentionally simple:

- `count`
- `swipeDirection` with only `"up" | "down"`
- `swipeDurationMs`
- `settleDelayMs`

That simplicity now causes three limitations:

1. **Direction is too narrow.**
   The current contract only supports vertical motion, but real mobile flows also need horizontal swipe semantics.

2. **Distance and path are opaque.**
   The tool expresses “which way” but not “from where to where.” This makes the current behavior effectively black-box and reduces precise control for stable automation.

3. **The existing field shape will age poorly.**
   Extending `swipeDirection` to more cases can work short-term, but it keeps the tool centered on a flat enum instead of a structured gesture model.

The result is that `scroll_only` is easy to call, but not expressive enough for deterministic or replay-friendly gesture intent.

## 3. Scope

### 3.1 In Scope

- redesign `scroll_only` input around a structured `gesture` object
- support four explicit gesture directions: `up`, `down`, `left`, `right`
- support optional viewport-relative precision control through `startRatio` and `endRatio`
- preserve a simple default behavior when no precision fields are supplied
- define compatibility behavior for current `swipeDirection` callers
- define expected contract, runtime, docs, and test updates needed for implementation

### 3.2 Out of Scope

- container-relative scrolling
- absolute pixel coordinates
- selector-aware scrolling semantics inside `scroll_only`
- redesigning `scroll_and_resolve_ui_target` or `scroll_and_tap_element` in the same change
- introducing a new low-level gesture tool family

## 4. Current Repo Truth

Current repository behavior relevant to this design:

- `ScrollOnlyInput` currently accepts `swipeDirection?: "up" | "down"`
- `ScrollOnlyInput` does not accept distance/path geometry
- `scroll_only` is exposed as a write-governed MCP tool and executes platform swipe commands directly
- `scroll_only` currently returns executed swipe command history only; it does not imply hierarchy capture
- AI guidance currently positions `scroll_only` as a low-dependency action to use before `wait_for_ui` and `resolve_ui_target`

This means the tool is already correctly placed as a direct action primitive. The design should preserve that role rather than turning it into a selector-aware orchestration tool.

## 5. Design Goals

1. Keep `scroll_only` simple for low-friction callers.
2. Add precise gesture control without requiring raw coordinates.
3. Support both vertical and horizontal scroll semantics.
4. Keep the gesture model viewport-relative so it is stable across screen sizes.
5. Preserve deterministic, auditable tool semantics.
6. Avoid overloading `scroll_only` with container-aware or selector-aware responsibilities.
7. Provide a migration path from `swipeDirection` to structured `gesture` input.

## 6. Considered Approaches

### 6.1 Option A: Add only `distanceRatio`

Description:

- keep direction as the main input
- add a single “how far” parameter

Pros:

- smallest contract change
- easy for callers to understand

Cons:

- still cannot express where the gesture starts
- less useful for avoiding edge areas and system gesture zones
- still leaves horizontal support awkward unless direction is separately expanded

Verdict:

- acceptable as a minimal patch
- not selected because it only solves part of the control problem

### 6.2 Option B: Add structured `gesture` input with direction and optional ratios

Description:

- move scroll semantics under `gesture`
- let `gesture.direction` express `up | down | left | right`
- let `gesture.startRatio` / `gesture.endRatio` optionally refine the gesture path
- keep default behavior when `gesture` is omitted or when `gesture.direction` is present without precision ratios

Pros:

- supports vertical and horizontal movement cleanly
- supports precision without absolute coordinates
- fits AI-facing contracts better than a flat offset field
- scales better for future refinement

Cons:

- requires compatibility handling for legacy `swipeDirection`
- slightly larger contract and validation update

Verdict:

- selected design

### 6.3 Option C: Expose absolute coordinates

Description:

- accept raw gesture coordinates or offsets

Pros:

- maximum caller control

Cons:

- device-specific and fragile
- weak fit for stable MCP contracts
- easier for agents and humans to misuse

Verdict:

- rejected

## 7. Locked Decisions

### 7.1 Structured Gesture Model

`scroll_only` should evolve toward:

```ts
interface ScrollOnlyInput {
  sessionId: string;
  platform?: Platform;
  runnerProfile?: RunnerProfile;
  deviceId?: string;
  harnessConfigPath?: string;
  dryRun?: boolean;
  count?: number;
  swipeDurationMs?: number;
  settleDelayMs?: number;
  gesture?: {
    direction: "up" | "down" | "left" | "right";
    startRatio?: number;
    endRatio?: number;
  };
  swipeDirection?: "up" | "down"; // deprecated compatibility lane during migration
}
```

Target-state truth belongs to `gesture`. `swipeDirection` remains only as a bounded migration aid.

### 7.2 Viewport-Relative Precision

`startRatio` and `endRatio` are ratios relative to the viewport, not absolute pixels.

This keeps the tool cross-device stable and consistent with deterministic-first API design.

### 7.3 Default Mode Must Survive

If `gesture` is omitted, `scroll_only` must still remain easy to call.

Default behavior should continue to perform a standard platform swipe using repo-owned defaults.

This is a compatibility and usability requirement, not an optional convenience.

### 7.4 Precision Mode Overrides Legacy Direction

If both `gesture.direction` and deprecated `swipeDirection` are present, `gesture.direction` wins.

The runtime must not try to merge them.

### 7.5 No Container Semantics in This Slice

This change must remain viewport-relative.

Container-relative scrolling is a different problem because it requires element/region ownership, container bounds, and likely selector-aware logic. That should land as a separate future capability slice rather than being hidden inside `scroll_only`.

## 8. Target Behavior

### 8.1 Call Shapes

#### Simple default scroll

```json
{
  "sessionId": "s1",
  "platform": "android",
  "gesture": { "direction": "up" }
}
```

Expected behavior:

- performs one default upward swipe
- uses repo-owned default path geometry when ratios are absent

#### Precision vertical scroll

```json
{
  "sessionId": "s1",
  "platform": "android",
  "gesture": {
    "direction": "up",
    "startRatio": 0.82,
    "endRatio": 0.34
  }
}
```

Expected behavior:

- performs a viewport-relative vertical swipe from lower screen to upper-mid screen
- allows shorter or longer controlled gestures than the default black-box path

#### Precision horizontal scroll

```json
{
  "sessionId": "s1",
  "platform": "ios",
  "gesture": {
    "direction": "left",
    "startRatio": 0.82,
    "endRatio": 0.28
  }
}
```

Expected behavior:

- performs a horizontal leftward swipe
- preserves the same deterministic result envelope as vertical mode

### 8.2 Direction Semantics

- `up` and `down` map to vertical gestures
- `left` and `right` map to horizontal gestures
- direction names describe perceived content movement only if the current runtime already follows that convention; otherwise the contract should explicitly document that they describe finger-swipe direction

Implementation should pick one interpretation and document it clearly. The contract must not leave this ambiguous.

**Recommended interpretation:** the direction should mean the actual swipe gesture direction sent to the device runtime, because that is the more direct, transport-aligned meaning.

### 8.3 Ratio Semantics

- ratios must be bounded to `0 < ratio < 1`
- omitted ratios mean “use default viewport anchors for that direction”
- if both ratios are present, they define the gesture span
- if only one ratio is present, the runtime should either:
  - reject as configuration error, or
  - normalize with a direction-specific default anchor

**Recommended rule:** require both `startRatio` and `endRatio` together. Partial precision input should fail early as configuration error because guessing the other endpoint weakens determinism.

## 9. Contract Changes

### 9.1 Input Contract

`ScrollOnlyInput` should add:

- `gesture.direction`
- `gesture.startRatio?`
- `gesture.endRatio?`

`swipeDirection` should be marked deprecated in code comments and docs.

### 9.2 Output Contract

The current `ScrollOnlyData` can remain mostly intact, but the response should become more honest about which gesture path was used.

Recommended additions:

```ts
interface ScrollOnlyData {
  ...
  gestureApplied: {
    direction: "up" | "down" | "left" | "right";
    startRatio?: number;
    endRatio?: number;
    mode: "default" | "precision" | "legacy_direction";
  };
}
```

Why:

- tells callers whether the runtime used a repo default path or explicit geometry
- improves auditability and dry-run clarity
- makes migration visible rather than hidden

## 10. Runtime Design

### 10.1 Normalization Layer

The adapter should normalize input into a single internal gesture model before command generation.

Suggested internal shape:

```ts
type NormalizedScrollGesture = {
  direction: "up" | "down" | "left" | "right";
  mode: "default" | "precision" | "legacy_direction";
  startRatio?: number;
  endRatio?: number;
};
```

Normalization responsibilities:

- accept `gesture.direction` as the new source of truth
- fall back to deprecated `swipeDirection` only when `gesture` is absent
- reject invalid mixed/partial ratio input
- produce one runtime-ready model for Android/iOS hooks

### 10.2 Coordinate Derivation

The runtime should derive actual swipe coordinates from viewport bounds and the normalized gesture.

This should remain inside focused UI model/runtime modules rather than leaking more low-level logic into top-level adapter orchestration.

### 10.3 Dry-Run Behavior

Dry-run should return:

- normalized direction
- whether the call used default or precision mode
- the applied ratios when present
- the intended command preview path as far as current dry-run semantics allow

## 11. Validation Rules

The contract/runtime should reject these cases with configuration errors:

- `gesture` present without `direction`
- only one of `startRatio` or `endRatio` present
- ratios outside the accepted range
- `startRatio === endRatio`
- legacy `swipeDirection` using unsupported horizontal values

The contract/runtime should allow:

- `gesture.direction` alone
- `gesture.direction` with both ratios
- deprecated `swipeDirection` alone during migration

## 12. Docs and Invocation Guidance

Implementation of this design should update the following truth owners together:

- `packages/contracts/src/types.ts`
- `packages/adapter-maestro/src/ui-action-scroll.ts`
- any shared UI model/runtime helpers that derive swipe coordinates
- `packages/mcp-server` tests and any contract-facing schema/descriptor truth
- `README.md` and `README.zh-CN.md` if tool contract examples or capability framing change
- `docs/guides/ai-agent-invocation.zh-CN.md` so examples show the new `gesture.direction` path rather than direction-only usage

The docs should explicitly state:

- `scroll_only` remains viewport-relative
- `gesture.direction` is the preferred input
- `swipeDirection` is deprecated
- container-relative semantics are not part of this capability

## 13. Testing Strategy

Implementation should add or update tests for:

1. contract normalization
   - `gesture.direction` only
   - `gesture.direction` + ratios
   - deprecated `swipeDirection`
   - precedence when both are present

2. validation
   - missing `gesture.direction`
   - only one ratio present
   - ratio out of range
   - equal start/end ratios

3. capability/runtime behavior
   - vertical default dry-run
   - horizontal default dry-run
   - precision dry-run returns `gestureApplied`
   - command history/evidence remains honest

4. docs/truth sync
   - canonical examples and tool descriptions reference the new preferred input model

## 14. Risks and Trade-offs

- **Migration risk:** existing callers may keep using `swipeDirection` indefinitely unless docs and examples move decisively to `gesture.direction`.
- **Semantics risk:** “direction” must be documented clearly as gesture direction vs content movement direction.
- **Scope creep risk:** container-relative scrolling will be tempting but should remain out of scope for this slice.
- **Cross-platform nuance risk:** horizontal swipe support may require platform-specific default anchors, but that belongs in runtime implementation, not contract ambiguity.

## 15. Recommended Implementation Sequence

1. update contract types and validation semantics
2. add failing tests for normalization, precedence, and invalid ratio cases
3. add runtime normalization + viewport-relative coordinate derivation
4. return `gestureApplied` in dry-run and executed results
5. update docs/examples to make `gesture.direction` canonical
6. keep `swipeDirection` only as a deprecated compatibility lane

## 16. Acceptance Criteria

- `scroll_only` supports `gesture.direction` with `up | down | left | right`
- callers can optionally provide `startRatio` and `endRatio` for precise viewport-relative gestures
- default no-precision behavior remains available
- runtime/result semantics stay deterministic and auditable
- docs and examples point to `gesture.direction` as the primary contract
- deprecated `swipeDirection` behavior is explicitly documented and bounded

## 17. Recommendation

Implement Option B.

This gives `scroll_only` a structured, future-friendly gesture model while keeping the tool simple for black-box callers. It solves the current vertical-only limitation, avoids the fragility of absolute coordinates, and preserves the tool’s role as a direct action primitive rather than turning it into a selector-aware orchestration layer.
