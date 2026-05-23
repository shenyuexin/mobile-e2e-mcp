---
phase: 28-explorer-rule-registry
plan: 01
title: Explorer Rule Registry and Explainable Traversal Policy
status: completed
summary_file: 28-01-SUMMARY.md
verify_file: 28-01-VERIFY.md
requirements:
  - EXPLORER-RULES-01
  - EXPLORER-RULES-02
  - EXPLORER-RULES-03
formal_truth_owners:
  - packages/explorer/src/types.ts
  - packages/explorer/src/config.ts
  - packages/explorer/src/exploration-sampler.ts
  - packages/explorer/src/page-context-heuristic.ts
  - packages/explorer/src/page-context-router.ts
  - packages/explorer/src/element-prioritizer.ts
  - packages/explorer/src/engine.ts
  - packages/explorer/src/report/summary.ts
  - packages/explorer/src/report/markdown.ts
  - packages/explorer/tests/**
  - docs/engineering/explorer-rule-registry.zh-CN.md
  - docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md
---

# Phase 28 Plan 01: Explorer Rule Registry and Explainable Traversal Policy

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

### Problem

Explorer traversal decisions are currently split across defaults, samplers, page-context routing, legacy heuristics, element prioritization, and inline engine keyword checks, so users cannot easily know which pages/elements will be skipped, sampled, gated, or deferred, nor how to add their own rules safely.

### Expected Outcome

- [ ] Default traversal rules are declared in one visible registry module with stable rule IDs, categories, actions, reasons, support notes, and override semantics.
- [ ] Existing behavior is preserved by adapting current scattered defaults and hard-coded pattern lists into the registry-backed evaluator.
- [ ] User configuration has a documented, schema-like surface for adding or overriding page, element, sampling, page-context, destructive, side-effect, navigation-control, low-value, and stateful-form rules.
- [ ] Every non-expanded page and skipped/sampled element records a machine-readable rule match in JSON summary output.
- [ ] Markdown/report output includes a rule decision section so users can answer “why did this page/element not run?” without reading logs.
- [ ] Tests prove precedence, backwards compatibility, report explainability, invalid-regex handling, and current known examples such as Fonts sampling, Bluetooth/SIM skip, account owner-package gating, payment/account stateful form gating, and low-value Help/FAQ gating.

### Non-goals

- Do not redesign DFS/state graph execution in this phase.
- Do not change default support boundaries for Android/iOS beyond making existing rules explicit.
- Do not introduce a new MCP tool in this phase; this is explorer config/report capability hardening.
- Do not make OCR/CV or probabilistic page classification the primary rule path.
- Do not remove legacy fields in the first implementation; preserve compatibility and migrate behind adapters.

## Current State Summary

### Current rule locations

| Current location | What lives there today | Problem |
|---|---|---|
| `packages/explorer/src/config.ts` | `DEFAULT_SAMPLING_RULES`, `DEFAULT_SKIP_PAGES`, `DEFAULT_SKIP_ELEMENTS`, `blockedOwnerPackages` default | User-visible defaults are mixed with interview/config persistence concerns. |
| `packages/explorer/src/exploration-sampler.ts` | Sampling/skip matchers plus hard-coded side-effect and navigation-control regex lists | Matcher and policy vocabulary are mixed. Pattern lists are not user-extensible. |
| `packages/explorer/src/page-context-heuristic.ts` | Low-value pages, protected auth surfaces, system dialogs, dismissible dialogs | Large hard-coded heuristic library with no user override surface. |
| `packages/explorer/src/page-context-router.ts` | `PageContext` deterministic routing table and blocked owner-package check | Page gating uses a separate rule system from skip/sampling rules. |
| `packages/explorer/src/element-prioritizer.ts` | Destructive/external-link/navigation-control/type filtering | Destructive and side-effect vocabulary is hard-coded and separate from sampler vocabulary. |
| `packages/explorer/src/engine.ts` | Orchestrates all rule systems and has inline stateful-form keywords (`payment`, `profile`, `account`, etc.) | Critical traversal policy is embedded in engine flow. |
| `packages/explorer/src/report/summary.ts` | Emits `explorationStatus`, `stoppedByPolicy`, `ruleFamily`, sampling metadata | No normalized rule-match ledger. |
| `packages/explorer/src/report/markdown.ts` | Overview/modules/failures | Does not explain skipped/sampled/gated rule decisions. |

### Existing precedence chain to preserve initially

The first implementation must preserve this effective page decision order unless tests explicitly update it:

1. Explicit `skipPages`
2. Low-value deep content check
3. Deterministic `pageContext` routing
4. Legacy heuristic fallback
5. Element-level filters and sampling during action enumeration

This order may be represented internally as a unified ordered rule evaluator, but default behavior must remain compatible.

## Architecture

### Strategy

Introduce an `ExplorerRuleRegistry` and `evaluateExplorerRules()` layer that centralizes rule declarations and match results while preserving the existing engine call sites through compatibility adapters. Keep the engine as the traversal coordinator; move rule vocabulary, defaults, match criteria, precedence, and explainability into focused rule modules.

### Design principles

1. **Single visible rule catalog**: all default “do not run / run later / sample / gate” behavior must have a stable `id` and category.
2. **Compatibility first**: existing `samplingRules`, `skipPages`, `skipElements`, `blockedOwnerPackages`, `destructiveActionPolicy`, and `statefulFormPolicy` keep working.
3. **Ordered and explainable**: rule evaluation is ordered; each match returns `ruleId`, `category`, `action`, `reason`, `source`, and optional `recoveryMethod`.
4. **User overrides without code changes**: users can add project-local rule config in `.explorer-config.json`.
5. **Hard-coded heuristics become default rules**: legacy regex lists remain default rules, not hidden code policy.
6. **Platform/support honesty**: rules can declare `platforms`, `supportLevel`, and caveats; reports should surface caveats when relevant.

### Proposed rule model

Create `packages/explorer/src/rules/rule-types.ts`:

```typescript
import type { ExplorerPlatform, PageContext, PageSnapshot, ClickableTarget } from "../types.js";

export type ExplorerRuleCategory =
  | "page-skip"
  | "element-skip"
  | "sampling"
  | "page-context"
  | "risk-pattern"
  | "navigation-control"
  | "side-effect"
  | "low-value-content"
  | "auth-boundary"
  | "system-dialog"
  | "stateful-form"
  | "external-app";

export type ExplorerRuleAction =
  | "allow"
  | "skip-page"
  | "skip-element"
  | "gate-page"
  | "sample-children"
  | "defer-action"
  | "defer-to-heuristic";

export type ExplorerRuleSource = "default" | "project-config" | "runtime-config" | "legacy-adapter";

export type ExplorerRuleSupportLevel = "contract-ready" | "experimental" | "reproducible-demo" | "ci-verified";

export interface ExplorerRuleMatchCriteria {
  pathPrefix?: string[];
  screenTitle?: string;
  screenTitlePattern?: string;
  screenId?: string;
  pageContextType?: PageContext["type"];
  ownerPackage?: string;
  ownerPackagePattern?: string;
  elementLabel?: string;
  elementLabelPattern?: string;
  resourceIdPattern?: string;
  appId?: string;
  appIdPattern?: string;
  platform?: ExplorerPlatform | ExplorerPlatform[];
  minDepth?: number;
  maxDepth?: number;
  maxClickableCount?: number;
  detectionSource?: PageContext["detectionSource"];
  minConfidence?: number;
}

export interface ExplorerRule {
  id: string;
  category: ExplorerRuleCategory;
  action: ExplorerRuleAction;
  reason: string;
  match: ExplorerRuleMatchCriteria;
  enabled?: boolean;
  priority?: number;
  source?: ExplorerRuleSource;
  recoveryMethod?: string;
  interruptionType?: string;
  supportLevel?: ExplorerRuleSupportLevel;
  caveat?: string;
  sampling?: {
    strategy: "representative-child";
    maxChildrenToValidate?: number;
    stopAfterFirstSuccessfulNavigation?: boolean;
    excludeActions?: string[];
  };
}

export interface ExplorerRuleEvaluationInput {
  path: string[];
  depth: number;
  mode: string;
  platform: ExplorerPlatform;
  snapshot?: PageSnapshot;
  element?: ClickableTarget;
}

export interface ExplorerRuleMatchResult {
  matched: boolean;
  ruleId?: string;
  category?: ExplorerRuleCategory;
  action?: ExplorerRuleAction;
  reason?: string;
  source?: ExplorerRuleSource;
  recoveryMethod?: string;
  interruptionType?: string;
  supportLevel?: ExplorerRuleSupportLevel;
  caveat?: string;
  sampling?: ExplorerRule["sampling"];
}
```

### Proposed config shape

Extend `ExplorerConfig` while preserving old fields:

```typescript
export interface ExplorerRuleConfig {
  version: 1;
  defaults?: {
    includeBuiltIns?: boolean;
    disabledRuleIds?: string[];
  };
  rules?: ExplorerRule[];
  overrides?: Array<{
    id: string;
    enabled?: boolean;
    reason?: string;
    priority?: number;
  }>;
}

export interface ExplorerConfig {
  // existing fields remain
  rules?: ExplorerRuleConfig;
}
```

Example user config:

```json
{
  "appId": "com.apple.Preferences",
  "mode": "full",
  "platform": "ios-simulator",
  "rules": {
    "version": 1,
    "defaults": {
      "includeBuiltIns": true,
      "disabledRuleIds": ["default.ios.fonts.system-fonts.smoke-sampling"]
    },
    "rules": [
      {
        "id": "project.skip.billing-pages",
        "category": "page-skip",
        "action": "gate-page",
        "reason": "Billing pages are out of scope for exploratory traversal",
        "match": { "screenTitlePattern": "Billing|Payment|Checkout" },
        "recoveryMethod": "backtrack-cancel-first"
      },
      {
        "id": "project.skip.logout",
        "category": "element-skip",
        "action": "skip-element",
        "reason": "Do not sign out during unattended exploration",
        "match": { "elementLabelPattern": "Sign Out|Log Out" }
      }
    ]
  }
}
```

## File Structure

### New files

| File | Responsibility |
|---|---|
| `packages/explorer/src/rules/rule-types.ts` | Shared rule model, evaluation input/output, config extension types. |
| `packages/explorer/src/rules/default-rules.ts` | Built-in default rule catalog with stable IDs. Owns current default sampling/skip/page-context/risk/heuristic vocabulary. |
| `packages/explorer/src/rules/rule-matcher.ts` | Pure matching helpers for path/title/id/label/resource/platform/depth/pageContext criteria. |
| `packages/explorer/src/rules/rule-registry.ts` | Builds effective ordered registry from defaults + legacy config + `rules` config + overrides. |
| `packages/explorer/src/rules/rule-evaluator.ts` | Evaluates page and element decisions and returns `ExplorerRuleMatchResult`. |
| `packages/explorer/src/rules/legacy-rule-adapter.ts` | Converts existing `samplingRules`, `skipPages`, `skipElements`, `blockedOwnerPackages`, and policy fields into rule objects. |
| `packages/explorer/tests/rules/rule-matcher.test.ts` | Unit tests for criteria matching and invalid regex behavior. |
| `packages/explorer/tests/rules/rule-registry.test.ts` | Unit tests for defaults, overrides, disabled rules, and legacy adapters. |
| `packages/explorer/tests/rules/rule-evaluator.test.ts` | Unit tests for page/element/sampling/stateful/destructive decisions. |
| `docs/engineering/explorer-rule-registry.zh-CN.md` | User-facing and contributor-facing guide for rule categories, precedence, examples, and explain output. |

### Modified files

| File | Change |
|---|---|
| `packages/explorer/src/types.ts` | Add `ExplorerRuleConfig` references and rule-match fields on `PageEntry`/related report types if needed. |
| `packages/explorer/src/config.ts` | Move built-in defaults into `default-rules.ts`; keep exports as compatibility aliases during migration. |
| `packages/explorer/src/exploration-sampler.ts` | Keep compatibility wrappers but delegate matching to rule matcher/evaluator. |
| `packages/explorer/src/page-context-heuristic.ts` | Convert hard-coded low-value/auth/dialog decisions into default rules or thin evaluator helpers. |
| `packages/explorer/src/page-context-router.ts` | Delegate pageContext decisions to the rule evaluator while preserving output shape. |
| `packages/explorer/src/element-prioritizer.ts` | Replace hard-coded destructive/side-effect/nav-control checks with registry-backed helpers where practical. |
| `packages/explorer/src/engine.ts` | Build effective registry once, pass to page/element/sampling decisions, record rule match ledger. |
| `packages/explorer/src/report/summary.ts` | Emit `ruleDecisions` aggregate and per-page/per-element rule match metadata. |
| `packages/explorer/src/report/markdown.ts` | Add “Rule Decisions” section. |
| `packages/explorer/src/cli.ts` | Optional: add `--rules <path>` or document using `--config`; do not block phase if config-only is chosen. |
| `docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md` | Link sampling behavior to new registry semantics. |

## Plan

### Read First

- `AGENTS.md`
- `docs/engineering/ai-first-capability-expansion-guideline.md`
- `docs/architecture/adapter-code-placement.md`
- `packages/explorer/src/types.ts`
- `packages/explorer/src/config.ts`
- `packages/explorer/src/exploration-sampler.ts`
- `packages/explorer/src/page-context-heuristic.ts`
- `packages/explorer/src/page-context-router.ts`
- `packages/explorer/src/element-prioritizer.ts`
- `packages/explorer/src/engine.ts`
- `docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md`

### Task Breakdown

#### Task 1: Add rule model and pure matcher

**Files:**
- Create: `packages/explorer/src/rules/rule-types.ts`
- Create: `packages/explorer/src/rules/rule-matcher.ts`
- Create: `packages/explorer/tests/rules/rule-matcher.test.ts`
- Modify: `packages/explorer/src/types.ts`

- [ ] Define `ExplorerRule`, `ExplorerRuleConfig`, `ExplorerRuleMatchCriteria`, `ExplorerRuleEvaluationInput`, and `ExplorerRuleMatchResult`.
- [ ] Add `rules?: ExplorerRuleConfig` to `ExplorerConfig` without removing existing fields.
- [ ] Implement pure helpers: `normalizeRuleText`, `matchesPathPrefix`, `matchesRegexSafely`, `matchesPlatform`, `matchesRuleCriteria`.
- [ ] Tests: exact path prefix, fuzzy path segment compatibility, title exact/pattern, element label exact/pattern, owner package exact/pattern, platform list, min/max depth, invalid regex returns no match and does not throw.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-matcher.test.ts`.

#### Task 2: Build default rule catalog

**Files:**
- Create: `packages/explorer/src/rules/default-rules.ts`
- Create: `packages/explorer/tests/rules/default-rules.test.ts`
- Modify: `packages/explorer/src/config.ts`

- [ ] Move current defaults into stable IDs while preserving compatibility exports:
  - `default.ios.fonts.system-fonts.smoke-sampling`
  - `default.android.bluetooth.other-devices.page-skip`
  - `default.android.network.sims-mobile-network.page-skip`
  - `default.element.help.low-value-skip`
  - `default.element.faq.low-value-skip`
  - `default.owner-package.bbk-account.external-app-gate`
  - `default.low-value.help-faq-about-legal.android`
  - `default.auth.protected-surface.android`
  - `default.dialog.system-alert`
  - `default.dialog.dismissible-nickname`
  - `default.risk.destructive-actions`
  - `default.risk.side-effect-actions`
  - `default.navigation.controls`
  - `default.stateful-form.account-payment-address`
- [ ] Keep `DEFAULT_SAMPLING_RULES`, `DEFAULT_SKIP_PAGES`, and `DEFAULT_SKIP_ELEMENTS` exports in `config.ts` as compatibility projections from the rule catalog or keep them unchanged with a deprecation note.
- [ ] Tests: default catalog has unique IDs; all built-in rules have reason/category/action; legacy projections match existing default values.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/default-rules.test.ts tests/config.test.ts`.

#### Task 3: Add registry builder and legacy adapters

**Files:**
- Create: `packages/explorer/src/rules/legacy-rule-adapter.ts`
- Create: `packages/explorer/src/rules/rule-registry.ts`
- Create: `packages/explorer/tests/rules/rule-registry.test.ts`
- Modify: `packages/explorer/src/config.ts`

- [ ] Implement `adaptLegacySamplingRules(config)`, `adaptLegacySkipPageRules(config)`, `adaptLegacySkipElementRules(config)`, `adaptLegacyBlockedOwnerPackages(config)`, and policy adapters for destructive/stateful settings.
- [ ] Implement `buildExplorerRuleRegistry(config)` with order:
  1. built-ins if `rules.defaults.includeBuiltIns !== false`
  2. legacy config adapters
  3. project `rules.rules`
  4. `rules.overrides`
  5. disabled IDs removed last
- [ ] Decide and document duplicate ID behavior: project rules with the same ID override built-ins; duplicate project IDs are invalid and ignored with a diagnostic entry.
- [ ] Tests: disabled built-in is removed; project override changes reason/enabled/priority; legacy `skipPages` still produces a page-skip rule; `includeBuiltIns: false` leaves only project/legacy rules.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-registry.test.ts`.

#### Task 4: Add evaluator for page, element, sampling, and risk decisions

**Files:**
- Create: `packages/explorer/src/rules/rule-evaluator.ts`
- Create: `packages/explorer/tests/rules/rule-evaluator.test.ts`
- Modify: `packages/explorer/src/exploration-sampler.ts`

- [ ] Implement `evaluatePageRules(registry, input)` for `skip-page`, `gate-page`, and `defer-to-heuristic` outputs.
- [ ] Implement `evaluateElementRules(registry, input)` for `skip-element`, `defer-action`, `navigation-control`, `side-effect`, and destructive checks.
- [ ] Implement `evaluateSamplingRules(registry, input)` returning sampling metadata equivalent to current `SamplingRule`.
- [ ] Implement compatibility wrappers in `exploration-sampler.ts` so existing call sites can still use `matchSamplingRule`, `matchSkipPageRule`, and `matchSkipElementRule` during migration.
- [ ] Tests: Fonts sampling rule matches only smoke mode; full mode does not match; `Download` is excluded by sampling; Bluetooth/SIM skip pages match; Help/FAQ elements skip; destructive labels respect `destructiveActionPolicy`; stateful labels respect `statefulFormPolicy`.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-evaluator.test.ts tests/engine.test.ts`.

#### Task 5: Refactor engine/page-context integration without changing traversal semantics

**Files:**
- Modify: `packages/explorer/src/engine.ts`
- Modify: `packages/explorer/src/page-context-router.ts`
- Modify: `packages/explorer/src/page-context-heuristic.ts`
- Modify: `packages/explorer/src/element-prioritizer.ts`
- Test: existing `packages/explorer/tests/engine.test.ts`, `page-context-router.test.ts`, `page-context-heuristic.test.ts`, `element-prioritizer.test.ts`

- [ ] Build the effective registry once near the start of `explore(config, mcp)`.
- [ ] Replace inline `isStatefulFormEntry()` keyword ownership with evaluator-backed matching while preserving the same default keyword behavior.
- [ ] Replace hard-coded low-value/page-context checks with evaluator-backed calls or thin compatibility functions that return normalized `ExplorerRuleMatchResult`.
- [ ] Preserve `ExplorerPageAction` output shape so existing engine code continues to mark snapshots as `reached-not-expanded`.
- [ ] Preserve navigation-control and side-effect deferral ordering while adding the missing class of parent-title/nav-back labels uncovered by the Fonts issue as a default navigation-control rule where evidence supports it.
- [ ] Tests: all existing explorer tests pass; add regression for Academy Engraved LET / Al Nile child pages where `System Fonts` is treated as nav-control/deferred before `Plain`/`Regular`/`Bold`.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/engine.test.ts tests/page-context-router.test.ts tests/page-context-heuristic.test.ts tests/element-prioritizer.test.ts`.

#### Task 6: Add rule decision ledger to summaries and markdown reports

**Files:**
- Modify: `packages/explorer/src/types.ts`
- Modify: `packages/explorer/src/report/summary.ts`
- Modify: `packages/explorer/src/report/markdown.ts`
- Modify: `packages/explorer/tests/report/summary.test.ts`
- Modify: `packages/explorer/tests/report/markdown.test.ts`

- [ ] Add a report-safe `RuleDecisionEntry` type with fields: `ruleId`, `category`, `action`, `reason`, `source`, `path`, `screenTitle`, `elementLabel?`, `recoveryMethod?`, `supportLevel?`, `caveat?`.
- [ ] Add per-page `ruleDecision?: RuleDecisionEntry` for gated/skipped pages.
- [ ] Add run-level `ruleDecisions` aggregate with counts by `ruleId`, category, and action.
- [ ] Preserve existing `stoppedByPolicy`, `ruleFamily`, and `sampling` fields for compatibility.
- [ ] Markdown: add `## Rule Decisions` with top matched rules and examples of skipped/gated pages/elements.
- [ ] Tests: summary JSON includes rule decisions for stateful, external owner-package, low-value, and sampling cases; markdown escapes rule IDs/reasons safely.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/report/summary.test.ts tests/report/markdown.test.ts`.

#### Task 7: Document user configuration and precedence

**Files:**
- Create: `docs/engineering/explorer-rule-registry.zh-CN.md`
- Modify: `docs/engineering/explorer-high-fanout-list-sampling.zh-CN.md`
- Optional modify: `README.md` or `docs/README.md` only if public invocation guidance changes.

- [ ] Document rule categories and actions.
- [ ] Document precedence and compatibility with legacy fields.
- [ ] Provide JSON examples for:
  - skip a payment/checkout page
  - skip logout/delete elements
  - disable built-in Fonts smoke sampling
  - add project-specific sampling rule
  - block external owner package
  - allow destructive actions for a controlled sandbox run
- [ ] Document report output: how to read `ruleDecisions`, `stoppedByPolicy`, `ruleFamily`, and sampling details.
- [ ] Link `explorer-high-fanout-list-sampling.zh-CN.md` to the new registry doc.
- [ ] Run docs-related validation where available: `pnpm validate:architecture-guardrails`.

#### Task 8: Add config validation and optional CLI affordance

**Files:**
- Modify: `packages/explorer/src/config.ts`
- Modify: `packages/explorer/src/cli.ts`
- Modify: `packages/explorer/tests/config.test.ts`
- Optional create: `packages/explorer/tests/cli.test.ts` if CLI parser is unit-testable.

- [ ] Add validation for rule config: rule IDs required, categories/actions valid, regex fields compile, unknown disabled IDs produce warning diagnostics but do not abort.
- [ ] Decide whether `--rules <path>` is needed in this phase. If added, merge it as project rules after `.explorer-config.json` and before direct CLI overrides.
- [ ] If `--rules` is not added, document that users should use `--config <path>` and include `rules` in the same JSON file.
- [ ] Tests: invalid regex is reported and ignored; malformed rule action/category returns config-load error; `--config` can load rule registry entries.
- [ ] Run: `pnpm --filter @mobile-e2e-mcp/explorer test -- tests/config.test.ts`.

#### Task 9: End-to-end verification and regression matrix

**Files:**
- Modify/add targeted fixtures under `packages/explorer/tests/fixtures/**` if needed.
- Modify: `packages/explorer/tests/engine.test.ts`
- Create: `packages/explorer/tests/rules/integration-rule-decisions.test.ts`

- [ ] Add fixture-based regression for the Fonts issue:
  - `Academy Engraved LET` detail page has `System Fonts`, `Plain`.
  - `Al Nile` detail page has `System Fonts`, `Regular`, `Bold`.
  - `System Fonts` is classified/deferred as navigation control.
  - `Plain`, `Regular`, and `Bold` remain eligible.
- [ ] Add regression for account/pay stateful form branch:
  - `Create Payment Method` or `Add Account` matches default stateful-form rule when policy is `skip`.
  - Same branch is allowed when policy is `allow`.
- [ ] Add regression for user override:
  - project rule disables default low-value Help skip and the page becomes explorable.
- [ ] Run targeted explorer tests: `pnpm --filter @mobile-e2e-mcp/explorer test`.
- [ ] Run repo checks: `pnpm typecheck`, `pnpm build`, `pnpm test:ci`.

## Key Decisions To Preserve

- The registry is the source of rule truth; the engine should not grow new inline regex/keyword policy after this phase.
- Compatibility fields stay valid in Phase 28; removal/deprecation can be a later phase after docs and migration evidence exist.
- Rule IDs are stable public-ish identifiers in reports and config overrides; do not rename them casually.
- Match failures from invalid user regex must be safe and explainable; no thrown runtime errors during traversal.
- Default rules must be platform-aware when evidence is platform-specific, especially low-value Android heuristics and iOS Fonts sampling behavior.
- Reports must explain both page-level gates and element-level skips where data is available.

## Risks / Unknowns

| Risk | Impact | Mitigation |
|---|---|---|
| Registry abstraction changes traversal order accidentally | Missed pages or unsafe taps | Lock current precedence with engine regression tests before refactor. |
| Rule model becomes too generic and hard to reason about | Users cannot configure safely | Keep v1 categories/actions small and map to existing behavior only. |
| Existing hard-coded functions are still used in hidden paths | Divergent decisions | Add tests around exported compatibility functions and run grep for old pattern arrays. |
| Report output grows too noisy | Users ignore explain data | Aggregate by rule ID and include examples rather than dumping every element skip in markdown. |
| User disables safety defaults accidentally | Unsafe exploration | Require explicit `disabledRuleIds`; keep destructive/stateful policies default `skip`; document sandbox-only overrides. |
| `--rules` path complicates config precedence | Confusing UX | Prefer `.explorer-config.json` first unless a concrete user need requires a separate file. |

## Done Criteria

- [ ] All default skip/sampling/gating/risk behavior has stable rule IDs in `default-rules.ts`.
- [ ] No new page/element traversal policy regex is introduced directly in `engine.ts`.
- [ ] Existing legacy config fields still work.
- [ ] User-supplied `rules` config can add, disable, or override rules without code changes.
- [ ] `summary.json` includes rule decision metadata sufficient to explain skipped/gated/sampled behavior.
- [ ] `report.md` includes a concise “Rule Decisions” section.
- [ ] Docs explain how to add rules and how precedence works.
- [ ] Tests cover matcher, registry, evaluator, engine regressions, and report output.

## Verify

### Test Cases

- [ ] `DEFAULT_SAMPLING_RULES` compatibility still contains the Fonts smoke sampling rule.
- [ ] `mode=full` does not trigger the smoke Fonts sampling rule.
- [ ] A project rule can disable the default Fonts sampling rule.
- [ ] `skipPages` legacy config still gates Bluetooth/SIM pages.
- [ ] `skipElements` legacy config still removes Help/FAQ elements.
- [ ] `blockedOwnerPackages` still gates `com.bbk.account` pages.
- [ ] `statefulFormPolicy=skip` gates add/create/select account/payment/address/location branches.
- [ ] `statefulFormPolicy=allow` does not gate those branches.
- [ ] `destructiveActionPolicy=skip` filters delete/reset/sign-out/logout actions.
- [ ] `destructiveActionPolicy=allow` allows those actions through the prioritizer.
- [ ] Invalid user regex does not throw during traversal and is reported as a config diagnostic.
- [ ] Academy/Al Nile font detail pages defer `System Fonts` nav-back action and keep `Plain`/`Regular`/`Bold` eligible.
- [ ] Summary JSON records `ruleId`, `category`, `action`, and `reason` for gated pages.
- [ ] Markdown report shows top rule decisions and examples.

### Verification Commands

```bash
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-matcher.test.ts
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-registry.test.ts
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/rules/rule-evaluator.test.ts
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/engine.test.ts tests/page-context-router.test.ts tests/page-context-heuristic.test.ts tests/element-prioritizer.test.ts
pnpm --filter @mobile-e2e-mcp/explorer test -- tests/report/summary.test.ts tests/report/markdown.test.ts
pnpm --filter @mobile-e2e-mcp/explorer test
pnpm typecheck
pnpm build
pnpm test:ci
pnpm validate:architecture-guardrails
```

### Acceptance Criteria

- [ ] A future user can open one doc and one config file example to understand which pages/elements will not be explored.
- [ ] A future user can add a project-specific skip/sampling/gating rule without editing TypeScript.
- [ ] A future user can inspect `summary.json` and know exactly which rule caused a page to be skipped/gated/sampled.
- [ ] Existing explorer behavior remains compatible unless explicitly changed by tests in this phase.
- [ ] The Fonts missed-subpage class is addressed by default navigation-control classification or a documented rule override.

### Success Criteria

- [ ] Rule logic is centralized enough that adding a new default skip/sampling/gating behavior no longer requires editing `engine.ts` directly.
- [ ] Hard-coded risk vocabulary has a migration path into `default-rules.ts` and user overrides.
- [ ] Reports become explainable for both AI agents and human users.
- [ ] The implementation remains deterministic-first and policy-aware.

## Rollout Plan

1. Land registry and compatibility adapters with no behavior change.
2. Migrate one rule family at a time: sampling → skip page/element → pageContext → risk patterns → heuristics.
3. Turn on report rule-decision output after evaluator is stable.
4. Publish docs and examples after tests prove compatibility.
5. Only then consider deprecating legacy top-level `samplingRules`, `skipPages`, and `skipElements` in a future phase.

## Open Questions For Implementation

- Should `--rules <path>` exist immediately, or is `--config <path>` sufficient for v1?
- Should project rules override built-ins by duplicate ID, or should overrides be limited to `rules.overrides` for safety?
- Should element-level skipped decisions be fully enumerated in JSON, or sampled/aggregated to avoid very large reports?
- Should default rule IDs be considered public stable API, or “stable within major version” internal identifiers?
