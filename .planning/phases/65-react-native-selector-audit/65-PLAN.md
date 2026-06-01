# Phase 65 Implementation Plan: React Native Selector Audit

**Goal:** Turn declared RN stable selectors into a source-audited artifact before live verification starts.

**Architecture:** Add a fixture-backed source scanner under `scripts/showcase/` that inspects RN source files for `testID`, `accessibilityLabel`, and `accessibilityHint` literals, compares them with the declared selector contract, and writes JSON/Markdown evidence. Keep this as deterministic static analysis; no device or Metro dependency.

**Scope**

- Create `react-native-selector-audit/v1`.
- Add generator, validator, tests, committed evidence, and package scripts.
- Keep source scanning bounded to configured roots and explicit file extensions.

**Out of Scope**

- AST-perfect JavaScript parsing.
- Automatic source edits.
- Device UI tree confirmation.

**Read-First Context**

- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/strategy/react-native-capability-review.zh-CN.md`
- `scripts/showcase/react-native-readiness.ts`
- `examples/rn-login-demo/App.tsx.template`

**Checklist**

- [ ] Implement selector scanner and audit builder.
- [ ] Add tests for found, missing, and duplicate selector outcomes.
- [ ] Generate committed fixture evidence.
- [ ] Add `generate`, `validate`, and `test` package scripts.
- [ ] Write summary and verification artifacts.

**Verification**

- `pnpm run test:react-native-selector-audit`
- `pnpm run generate:react-native-selector-audit`
- `pnpm run validate:react-native-selector-audit`

**Acceptance Criteria**

- Missing declared selectors produce `blocked` with `RN_SELECTOR_MISSING`.
- Source-discovered selectors include file, line, prop, and value.
- Evidence explicitly says static source audit does not prove runtime visibility.
