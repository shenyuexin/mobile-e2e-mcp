# Phase 34 Scenario Kill Test

Date: 2026-05-23
Input: `.planning/phases/33-existence-scenario-validation/33-01-SUMMARY.md`

## Purpose

This file tries to kill each surviving Phase 33 scenario with the strongest practical existing-tool solution. If an alternative plus a small script is enough, the scenario should not become the project wedge.

## External Reference Notes

- Maestro is strong on simple YAML flows and test artifacts. Its docs describe YAML-based mobile/web UI automation and debug outputs including logs, screenshots, videos, commands JSON, and AI reports.
- Appium is strong on broad mobile automation through WebDriver-compatible drivers and language ecosystems.
- Detox remains strong for React Native teams that can use app-owned/gray-box testing.
- Playwright MCP is strong evidence that agent-facing automation benefits from structured accessibility snapshots, but it is browser-focused rather than a universal mobile surface.

## Kill-Test Matrix

| Scenario | Best existing-tool solution | What the alternative solves well | What remains missing | Does `mobile-e2e-mcp` still matter? | Verdict |
|---|---|---|---|---|---|
| AI-safe mobile device control via MCP | Build a small MCP server around adb/simctl/devicectl or Appium/Maestro commands. Add allowlists, per-command logging, screenshots on failure, and a simple session ID. | Covers basic agent invocation, device commands, screenshots, and coarse audit logging quickly. | The wrapper grows into a policy/session/evidence/recovery system: leases, support boundaries, structured result envelopes, reason codes, fallback disclosure, recovery decisions, and reusable tool contracts. | Yes, if the buyer/user needs a maintained agent-governed execution layer rather than a quick internal wrapper. | **keep / strongest** |
| Unknown-app Explorer coverage discovery | Use Appium page source or Android UIAutomator dumps in a crawler script; or use Maestro flows plus manual exploratory notes and screenshots. | Can collect UI trees, tap candidates, screenshots, and a rough navigation map for simple apps. | State graph identity, cycle control, rule registry, skip/risk decisions, page-context metadata, failure review, machine-readable coverage summaries, and bounded traversal safety become custom crawler work. | Yes, if Explorer is positioned as coverage/evidence discovery, not as generic E2E. Needs realistic-app proof beyond Settings. | **keep / narrow** |
| Failure intelligence layer for existing mobile E2E | Use Maestro debug output/AI reports or Appium/Detox hooks with screenshots, logs, videos, and custom failure parsers. Add CI artifact upload and a triage script. | Solves much of the artifact collection and runner-integrated debugging story. Maestro is especially dangerous to this scenario because it already has rich debug artifacts. | Cross-tool structured reason codes, session timeline, policy-aware recovery, ranked candidates, known remediation routing, and agent-consumable envelopes are still differentiated, but only as an augmentation layer. | Somewhat, but not as a standalone wedge. It should support AI-safe execution or Explorer, or target teams with severe triage pain. | **narrow / supporting** |
| Generic mobile E2E platform replacement | Use Maestro for low-friction YAML, Appium for ecosystem breadth, Detox for RN gray-box, XCTest/Espresso for native deterministic tests. | Existing tools are mature, known, well documented, and already fit most primary test-runner needs. | The remaining value is not better raw execution; it is governance, evidence, recovery, and agent contracts. | Not as a primary scenario. | **discard** |

## Scenario Notes

### 1. AI-safe mobile device control via MCP

The strongest alternative is not Appium or Maestro alone; it is a small custom MCP wrapper that exposes a curated set of mobile commands to an agent. That wrapper can get surprisingly far:

- command allowlist
- device ID allowlist
- per-command logging
- screenshots on failure
- simple session IDs
- timeout limits

This does not fully kill the scenario because the wrapper has to recreate the hard parts once it becomes serious:

- policy profiles, not just command allowlists
- leases/scheduling to avoid unsafe concurrent device control
- structured result envelopes instead of stdout/stderr
- support-boundary reporting
- deterministic-first target resolution
- fallback disclosure
- evidence artifacts tied to action outcomes
- recovery and remediation semantics

Verdict: **keep as strongest candidate**, but narrow the claim to "agent-governed mobile execution harness," not "mobile E2E replacement."

### 2. Unknown-app Explorer coverage discovery

The strongest alternative is a custom crawler using Appium page source or UIAutomator XML, plus screenshots and a visited-state hash. A skilled team can build a rough version.

This does not fully kill the scenario because durable traversal is not just a loop over tappable elements:

- state identity and cycle detection
- page-context handling
- skip/risk rules
- external-app boundaries
- circuit breakers
- failure review artifacts
- coverage summaries
- machine-readable report outputs

Verdict: **keep/narrow**. This can be a wedge if validated on a real app with useful coverage artifacts. Settings traversal proves mechanics but not enough product value.

### 3. Failure intelligence layer

This scenario weakens under kill test. Existing runners already provide useful artifacts:

- Maestro can produce screenshots, videos, logs, commands JSON, and AI reports.
- Appium users can attach screenshots/logs/videos through test framework hooks.
- Detox/native test stacks can capture app-owned assertions and logs with strong runtime context.

The remaining gap is still real, but narrower:

- consistent cross-run reason codes
- session timeline across tool calls
- policy-aware recovery attempts
- ranked failure candidates
- known remediation routing
- agent-consumable envelopes

Verdict: **narrow/supporting**. Failure intelligence should strengthen the selected wedge, not become the primary wedge unless external evidence shows acute demand.

## Ranking After Kill Test

1. **AI-safe mobile device control via MCP** — strongest leftover value after alternatives.
2. **Unknown-app Explorer coverage discovery** — promising, but needs real-app proof.
3. **Failure intelligence layer** — useful supporting layer, weak as standalone wedge.
4. **Generic mobile E2E replacement** — discarded.

## Phase 35 Input

Recommended primary wedge candidate:

- **AI-safe mobile device control via MCP**

Recommended supporting capabilities:

- Failure intelligence as the evidence/recovery layer.
- Explorer as a second possible wedge or proof-generating module.

Main Phase 35 question:

- Should the project choose agent-governed execution as the primary wedge and use Explorer/failure intelligence as differentiators, or should Explorer become the primary wedge if "agent-safe device control" proves too infrastructure-heavy?
