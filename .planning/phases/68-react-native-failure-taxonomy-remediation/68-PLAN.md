# Phase 68 Implementation Plan: React Native Failure Taxonomy And Remediation

**Goal:** Turn repeated RN-specific blockers and JS/runtime signals into deterministic reason codes and bounded remediation actions.

**Architecture:** Add `react-native-failure-taxonomy/v1` that consumes RN readiness/evidence-pack style inputs and classifies failures into RN reason codes such as `RN_METRO_UNAVAILABLE`, `RN_NO_DEBUG_TARGET`, `RN_JS_EXCEPTION`, `RN_NETWORK_FAILURE`, and `RN_SELECTOR_MISSING`. Keep recommendations bounded and evidence-backed.

**Scope**

- Create taxonomy builder, renderer, validator, tests, package scripts, and committed evidence.
- Integrate taxonomy summary into RN evidence pack.
- Preserve failure-memory boundaries: classification is evidence grouping, not autonomous fixing.

**Out of Scope**

- LLM root-cause attribution.
- Automatic code fixes.
- Source-map/Hermes symbolication.

**Read-First Context**

- `scripts/showcase/react-native-evidence-pack.ts`
- `scripts/showcase/mobile-change-failure-memory.ts`
- `docs/strategy/react-native-capability-review.zh-CN.md`

**Checklist**

- [ ] Implement RN taxonomy classifier and remediation table.
- [ ] Add tests for readiness, JS exception, network failure, and clean evidence.
- [ ] Add package scripts and committed evidence.
- [ ] Add evidence-pack taxonomy summary.
- [ ] Write summary and verification artifacts.

**Verification**

- `pnpm run test:react-native-failure-taxonomy`
- `pnpm run generate:react-native-failure-taxonomy`
- `pnpm run validate:react-native-failure-taxonomy`
- `pnpm run test:react-native-evidence-pack`
- `pnpm run validate:react-native-evidence-pack`

**Acceptance Criteria**

- RN failures get stable reason codes and bounded next actions.
- Weak/no issue evidence stays non-blocking.
- Evidence pack surfaces taxonomy without changing proof boundaries.
