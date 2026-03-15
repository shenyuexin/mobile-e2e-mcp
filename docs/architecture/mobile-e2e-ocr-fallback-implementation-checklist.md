# Mobile E2E OCR Fallback Implementation Checklist

This checklist is the implementation companion for:

- `docs/architecture/mobile-e2e-ocr-fallback-design.md`
- `docs/architecture/execution-coordinator-and-fallback-ladder.zh-CN.md`

Use it to ensure OCR fallback is added in a deterministic-first and policy-governed way.

---

## 1) Contracts and Types

- [ ] Define/verify OCR-related types in shared contracts (`packages/contracts`).
- [ ] Ensure tool result envelope includes `resolutionStrategy`, `fallbackUsed`, `confidence`, `reasonCode`, `artifacts`.
- [ ] Add/update reason codes for OCR eligibility, confidence low, and fallback exhausted.

## 2) Policy and Governance

- [ ] Add/verify fallback policy config and action eligibility gates.
- [ ] Require explicit policy scope for OCR-driven actioning.
- [ ] Define confidence thresholds by action class.
- [ ] Ensure high-risk/destructive actions are blocked by default.

## 3) Orchestration Integration

- [ ] Integrate fallback gate in `perform-action-with-evidence` path.
- [ ] Enforce deterministic-first order before OCR fallback.
- [ ] Add bounded retry and stop conditions.
- [ ] Add post-action verification after OCR action.

## 4) Vision Service Layer

- [ ] Add/verify OCR service entry in `packages/adapter-vision` (or agreed core location).
- [ ] Implement/verify provider abstraction (`OcrProvider`).
- [ ] Implement/verify default `MacVisionOcrProvider` path.
- [ ] Normalize provider outputs to shared `OcrOutput`.

## 5) Target Resolution

- [ ] Implement exact/normalized/fuzzy match strategy for OCR text blocks.
- [ ] Emit candidate ranking and chosen target confidence.
- [ ] Record ambiguity when multiple candidates are close.

## 6) Evidence and Timeline

- [ ] Persist screenshot before OCR run.
- [ ] Persist OCR raw output and normalized output.
- [ ] Persist resolution decision trace and confidence.
- [ ] Append fallback events into session timeline.

## 7) Platform Validation

### Android
- [ ] Validate OCR fallback on at least one known semantics-weak screen.
- [ ] Confirm policy gate and confidence gate both take effect.

### iOS
- [ ] Validate OCR fallback with current iOS hierarchy limitations.
- [ ] Confirm partial/unsupported boundaries are explicitly surfaced.

### React Native
- [ ] Verify debug evidence remains supplemental and does not bypass fallback policy.

### Flutter
- [ ] Validate canvas/custom-painted scenarios with bounded fallback.

## 8) Testing and CI

- [ ] Unit tests: policy gating, confidence threshold, resolver ranking.
- [ ] Integration tests: deterministic fail -> OCR success/fail branches.
- [ ] Negative tests: low confidence, blocked action, missing screenshot/provider failure.
- [ ] Ensure structured envelopes are returned on all failure paths.

## 9) Documentation and Ops

- [ ] Update capability map/support matrix after rollout.
- [ ] Add operator notes for provider prerequisites and platform caveats.
- [ ] Add troubleshooting entries for common OCR fallback failures.

---

## Exit Criteria

- [ ] Deterministic path remains primary in production flows.
- [ ] Every OCR action is policy-gated, bounded, and auditable.
- [ ] Failure packets include enough evidence for replay/diagnosis.
