# Mobile E2E MCP

[![npm version](https://img.shields.io/npm/v/%40shenyuexin%2Fmobile-e2e-mcp)](https://www.npmjs.com/package/@shenyuexin/mobile-e2e-mcp)
[![CI (build + typecheck + unit + smoke)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml)
[![Platform Smoke (iOS sim + Android emulator)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml/badge.svg?branch=main)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml)
[![Real Device Acceptance (self-hosted)](https://img.shields.io/badge/Real%20Device%20Acceptance-self--hosted%20manual-0A66C2)](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)

English | [简体中文](README.zh-CN.md)

> AI-safe mobile device control via MCP: a policy-guarded, session-oriented mobile automation harness for AI agents, with deterministic-first Android/iOS execution, bounded visual fallback, and evidence-rich outcomes.

This repository is a pnpm monorepo that combines MCP tooling, adapter execution, and architecture docs for AI agents that need to inspect, act on, and debug mobile apps without turning raw device commands into ungoverned side effects.

## Quick Start

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest"]
    }
  }
}
```

By default, the MCP stdio server exposes the **`core` toolset (20 high-frequency tools, including `audit_ui_surface`, `perform_gesture`, and `record_screen`)** to minimize agent context overhead (~71% fewer schemas). To enable all **68 MCP tools** (recording, failure intelligence, network policy/diagnosis, performance, JS debug targets), pass `--toolset full` or set `MOBILE_E2E_TOOLSET=full`:

```json
{
  "mcpServers": {
    "mobile-e2e-mcp": {
      "command": "npx",
      "args": ["-y", "@shenyuexin/mobile-e2e-mcp@latest", "--toolset", "full"]
    }
  }
}
```

### Unified CLI Commands

The single package entrypoint supports both MCP stdio serving and local CLI workflows (`stdio`, `doctor`, `init`, `explore`, `run`, `audit`, `diff`, `setup-agent`):

```bash
# Check Android/iOS host tools and connected devices
npx -y @shenyuexin/mobile-e2e-mcp@latest doctor

# Auto-detect Android / iOS / RN / Expo / Flutter and scaffold a starter smoke flow
npx -y @shenyuexin/mobile-e2e-mcp@latest init --no-prompt --with-smoke-flow

# One-command MCP + workflow setup for an AI client (claude|cursor|opencode|codex)
npx -y @shenyuexin/mobile-e2e-mcp@latest setup-agent --target claude --toolset core

# Run a deterministic flow inside a governed session
npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/smoke.yaml --dry-run

# Record only failures and get a proposal-only selector heal diff when a flow breaks
npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/smoke.yaml \
  --record-on-failure --record-output artifacts/run.mp4 --suggest-heal

# Governed UI-surface audit with baseline ratcheting; gate a PR on regressions
npx -y @shenyuexin/mobile-e2e-mcp@latest audit \
  --baseline-path .e2e/ui-baseline.json --fail-on-regression

# Diff two Explorer runs into PR Markdown + a self-contained HTML report
npx -y @shenyuexin/mobile-e2e-mcp@latest diff ./explore-report/base ./explore-report/head \
  --markdown diff.md --html diff.html --fail-on-regression
```

`audit` wraps `audit_ui_surface` in `start_session` → `audit_ui_surface` → `end_session`, inherits defaults from `.e2e/config.yaml` (including an `audit:` section), and exits non-zero on a detected regression when `--fail-on-regression` is set. `diff` reads `summary.json`, `failure-review.json`, and optional `audit*.json` from both run directories; add `--fail-on-regression` for a zero-script CI quality gate.

`run --record-on-failure` starts `record_screen` before `run_flow` and stops it in a `finally` block: the video is discarded on pass and preserved on failure (reported as a path in text and `--json`). Live recording is skipped under `--dry-run`. `run --suggest-heal` combines `explain_last_failure`, `suggest_known_remediation`, and read-only `inspect_ui` into a structured proposal plus a unified diff snippet on failure — it is strictly proposal-only and never edits flow YAML files.

`init` auto-detects Android, iOS, React Native / Expo and Flutter projects and prefills `platform`, `appId`, `runnerProfile`, and an informational `buildCommand`; `--with-smoke-flow` scaffolds `.e2e/flows/smoke.yaml` with a launch step and explicit settle delay. Explicit flags always win over detection. `setup-agent` idempotently merges the `@shenyuexin/mobile-e2e-mcp@latest` MCP entry and concise workflow guidance into the target client's config, preserving unrelated MCP servers. `doctor` parses `axe --version` and warns with a copy-pasteable `brew upgrade cameroncooke/axe/axe` when AXe is older than v2.2.0 (required by `perform_gesture` and `axe serve`). None of these commands add MCP tools — the registry stays at 68 tools / 20 core tools.

## Explorer: Primary Product Surface

Explorer is the main outward-facing product capability of this repository—a DFS-based automatic page traversal engine built into the MCP server. Rather than being a standalone crawler bolted onto the side, it exercises the same core capabilities a mobile AI agent needs in practice: device discovery, auditable sessions, UI inspection, bounded UI actions, rule-based risk gates, interruption/recovery handling, and structured evidence.

Use Explorer to answer product questions such as:

- Which screens are reachable from this app entry point?
- Which flows are blocked by policy, external-app boundaries, risk gates, or repeated failures?
- What changed between two exploration runs?
- Which discovered paths should be promoted into deterministic replay or PR review evidence?

```bash
npx -y @shenyuexin/mobile-e2e-mcp@latest explore \
  --app-id com.example.app \
  --platform android \
  --output ./explore-report \
  --export-flows ./flows/generated
```

Key features:

- **DFS-based traversal**: systematically explores reachable screens from a starting point
- **State graph tracking**: records visited states and detects cycles to avoid infinite loops
- **Circuit breaker**: stops when exploration hits diminishing returns or configured limits
- **Rule-based gating**: respects skip-page, skip-element, sampling, and risk-gating rules
- **Interruption-aware evidence**: records blocked, interrupted, skipped, and failed traversal decisions with explicit reasons
- **Experimental horizontal fallback**: after vertical segments are exhausted, Explorer can probe horizontally scrollable content with bounded page-identity checks
- **iOS/iPad hardening & project config**: SplitView/Popover presentation scoping, foreground pre-flight guard against SpringBoard/Dock/Spotlight drift, repeatable `--launch-env KEY=VALUE` injection, `.e2e/config.yaml` auto-loading, and read-only `--no-prompt --config` protection
- **Deterministic flow export**: `--export-flows <dir>` turns the deepest reachable, non-failed, non-blocked paths into Maestro-compatible YAML smoke flows with explicit settle delays

### Output

Explorer writes fixed, reviewable artifacts:

| File | Description |
|------|-------------|
| `tree.txt` | ASCII tree of all discovered pages and navigation paths |
| `report.md` | Human-readable coverage report with module breakdown |
| `report.html` | Self-contained single-file HTML report (inline CSS/JS, no CDN dependencies) |
| `failure-review.md` | Human-readable failure triage with grouped patterns and suggested next actions |
| `failure-review.json` | Machine-consumable failure triage summary |
| `summary.json` | Machine-consumable metrics and page metadata |
| `config.json` | Runtime configuration and rule settings used for the run |

Example output from a real run against iOS Settings (181 pages, max depth 5):

- [`tree.txt`](docs/showcase/explorer/tree.txt) — full page hierarchy
- [`report.md`](docs/showcase/explorer/report.md) — module breakdown and paths
- [`summary.json`](docs/showcase/explorer/summary.json) — metrics and metadata

Local real-device runs are written under `output/evidence/explorer/`. Architecture and rule configuration references:

- [Explorer hybrid traversal design](docs/architecture/explorer-hybrid-traversal-ascii.md)
- [Explorer rule registry](docs/engineering/explorer-rule-registry.zh-CN.md)

## Core Wedge: Governed Agent Control

The strongest use case for this project is not "replace every mobile E2E framework." It is: give an AI agent a safer control plane for mobile devices.

Compared with a thin `adb` or platform-command wrapper, this harness adds:

- **Policy boundaries**: actions are checked against policy profiles before execution.
- **Auditable sessions**: actions run inside session, lease, audit, and evidence context.
- **Capability disclosure**: agents can query supported platforms and boundaries before acting.
- **Structured outcomes**: failures, denials, and evidence are machine-consumable instead of log-only.

Reproduce the dry-run proof:

```bash
pnpm run proof:governed-agent-mobile-control
```

The proof writes a timestamped bundle under `output/showcase/governed-agent-mobile-control/<run-id>/` and verifies that a read-only session blocks an interactive action with structured `POLICY_DENIED`. See [Governed Agent Mobile Control Proof](docs/showcase/governed-agent-mobile-control.md).

## Positioning: AI Mobile E2E Harness

This repository combines **executable implementation** (MCP server, adapters, contracts, core orchestration) with an **architecture and delivery knowledge base** (design principles, capability model, phased rollout docs). It is designed as an **Explorer-led, governed mobile control layer for AI agents**—a policy-aware, session-oriented, deterministic-first harness rather than a thin single-framework test runner.

Why teams use this harness:

- **Deterministic-first**: stable selectors and structured retries before bounded OCR/CV fallback
- **Failure-intelligence**: reason codes, evidence artifacts, candidate root causes, and remediation hints
- **Governance-aware**: policy profiles, auditable sessions, and controlled tool surfaces
- **Evidence-first**: real-device Explorer/probe artifacts alongside historical video demos and CI-validated smoke bundles

## Capability Showcase

### Quick GIF Preview

| Happy path GIF | Interruption recovery GIF |
|---|---|
| ![Happy path preview](docs/showcase/assets/happy-preview.gif) | ![Interruption recovery preview](docs/showcase/assets/interruption-preview.gif) |

Start here for runnable demos, real-device verification, and tracked CI proof:

- **Real-device videos & Explorer/probe evidence**:
  - Historical recordings: [`m2e-happy-path-scroll-pause-40s.mp4`](docs/showcase/videos/m2e-happy-path-scroll-pause-40s.mp4), [`m2e-interruption-home-recovery-35s.mp4`](docs/showcase/videos/m2e-interruption-home-recovery-35s.mp4)
  - Android Explorer evidence (45 pages, max depth 4, 0 failures): `docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20/` (`pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4`)
  - Device probe entrypoints: `pnpm run validate:android-tool-probe` (latest Vivo V2405A run: 20/23 success, 0 partial, 3 expected diagnostic failures) and `pnpm run validate:ios-tool-probe`
- **Governed-control & mobile-change proofs**:
  - `pnpm run quickstart:governed-control` (first-run readiness guide)
  - `pnpm run proof:governed-agent-mobile-control` / `pnpm run proof:governed-policy-escalation`
  - `pnpm run verify:mobile-change` (one-command mobile change verification; use `-- --live --contract=configs/readiness/mobile-change.android.json` for contract-backed live mode)
  - `pnpm run verify:react-native-change` (experimental RN lane with readiness + evidence-pack orchestration; blocked output is not live success evidence until a connected device, Metro/debug target, and intake pass)
- **Drop-in CI gate & real-app showcase**:
  - [Reusable GitHub Action](.github/actions/mobile-e2e-gate/action.yml) — `audit` / `explore` / `run` / `diff` gate with `actions/upload-artifact@v4` and optional `gh pr comment`; inputs reach shell steps only via `env:` variables
  - [Real Open-Source App Killer Demo](docs/showcase/killer-demo-real-app.md) — two 60s workflows on Wikipedia/Mastodon, explicitly labeled `reproducible-demo` (a template, not live-device proof)
- **Full evidence index & AI agent guides**:
  - [Showcase & Evidence Index](docs/showcase/README.md) — complete catalog of `generate:*` / `validate:*` commands, failure-memory/handoff packets, and tracked evidence reports
  - [CI Evidence and Boundary Guide](docs/showcase/ci-evidence.md), [CI runs](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/ci.yml), [Platform Smoke](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/platform-smoke.yml), [Real-Device Acceptance](https://github.com/shenyuexin/mobile-e2e-mcp/actions/workflows/real-device-acceptance.yml)
  - Guides: [AI Agent Invocation (zh-CN)](docs/guides/ai-agent-invocation.zh-CN.md), [Golden Path](docs/guides/golden-path.md), [Flow Generation](docs/guides/flow-generation.md)

## FAQ

### What is a mobile E2E harness for AI agents?

It is an execution layer that lets AI agents run mobile test actions safely and reproducibly. This harness adds session control, policy boundaries, deterministic action routing, and structured evidence beyond basic command execution.

### Can this harness run on real Android devices?

Yes. Current real-device evidence is centered on Explorer/probe artifacts, with historical showcase scripts under `scripts/legacy/dev/*` and recordings under `docs/showcase/*`. The latest Android Vivo probe verified the core Settings UI action path and `resume_interrupted_action` with `native_android`; a few diagnostic/negative-path checks remain intentionally non-green unless their prerequisites, such as Metro, are present.

### How does interruption recovery work in this harness?

It detects interruption signals, classifies likely interruption type, and applies bounded recovery actions (for example `recover_to_known_state`) before continuing the flow.

### Is this a replacement for Appium or Maestro?

Not necessarily. It is better understood as an orchestration harness that can coexist with existing execution ecosystems while adding AI-oriented governance and diagnostics.

### Which scenarios are the best fit?

AI agents that need safe mobile device access, release-gate mobile regression, flaky-flow triage, AI-driven exploratory checks, and real-device CI workflows that require auditable, evidence-rich outcomes.

### What is the Explorer and when should I use it?

Explorer automatically traverses your app's screens without predefined flows. Use it when you need broad coverage discovery, want to map an unfamiliar app's navigation structure, or need to identify all reachable screens before writing targeted test flows. It is available via the `explore` CLI command.

Android physical-device Explorer evidence is tracked under `docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20/`: a full Settings traversal completed in 33m 50s with 45 pages, max depth 4, and 0 failures.

Validate that evidence offline with `pnpm run validate:explorer-android-evidence -- --min-pages 45 --min-depth 4`.

## Appium / Maestro vs This Harness

| Dimension | Appium / Maestro | Mobile E2E MCP Harness |
|---|---|---|
| Core role | Automation framework / flow runner | AI-facing orchestration harness |
| Execution strategy | Action execution centric | Deterministic-first + policy/session governance |
| Failure handling | Assertion/command failure outputs | Structured diagnostics + ranked causes + remediation hints |
| AI integration | Possible but not primary abstraction | Primary design target (tools for AI agents) |
| Evidence model | Varies by setup | Built-in evidence-first action outcomes |
| Helper app dependency | Required for iOS/Android replay | Android: owned-adb primary (no helper app needed for common commands); iOS simulator: axe CLI; iOS physical: WDA (one-time setup, see [External Tools Guide](docs/guides/external-tools.md)) |

## Official AI Mobile Tools vs This Harness

Android CLI/Journeys, Android Studio Journeys, and the Dart/Flutter MCP server are complementary upstream tools, not replacements for this harness. Treat them as source-native journey execution, authoring, or framework-context providers; feed their outputs into mobile-e2e evidence intake only when proof boundaries are explicit.

The machine-readable bridge contract is generated by:

```bash
pnpm run validate:official-tool-bridge
```

See `docs/showcase/evidence/official-tool-bridge/bridge.md` for the current relationship matrix.

## How It Works (End-to-End)

Typical runtime path:

1. Agent/client invokes an MCP tool via stdio or dev CLI.
2. MCP server validates input and applies policy checks.
3. Session context is resolved (or created), with lease/scheduling guardrails.
4. Adapter router selects deterministic execution path first.
5. Action executes and returns a structured result envelope.
6. Artifacts/evidence (screens, logs, summaries) are attached for audit/debug.
7. If deterministic resolution fails and policy allows it, bounded OCR/CV fallback is attempted.

This is why the project emphasizes **session + policy + evidence**, not only UI actions.

## High-Level Architecture

Reference split:

- **Control plane**: tool contracts, policy checks, session orchestration, audit/evidence indexing
- **Execution plane**: platform actions, UI resolution, retries, interruption handling, visual fallback

Architecture references:

- [System architecture & contracts (01)](docs/architecture/01-system-architecture.md)
- [Platform adapters & framework profiles (02)](docs/architecture/02-platform-adapters.md)
- [Architecture index (EN)](docs/architecture/README.md) | [Architecture index (zh-CN)](docs/architecture/README.zh-CN.md)

Source-of-truth note:

- Architecture docs describe both current baseline and target-state design.
- If a doc statement conflicts with strict validation behavior, prefer `packages/contracts/*.schema.json` and `configs/policies/*.yaml` for current enforced behavior.

## Capability Map (Current Scope)

- **Environment & device control** — discovery, lease/isolation, environment shaping
- **App lifecycle** — install/launch/terminate/reset/deep-link entry
- **Perception & interaction** — inspect/query UI, tap/type/wait, flow execution
- **Diagnostics & evidence** — logs, crash signals, performance, screenshot/timeline artifacts
- **Reliability & remediation** — reason-coded failures, bounded retries, remediation helpers

Tool registry/signature dispatch live in `packages/mcp-server/src/server.ts`, while descriptor metadata and wrapper composition live in `packages/mcp-server/src/index.ts`.

## Complete MCP Tool Catalog (Current)

The server exposes **20 `core` tools by default** and **68 tools in `--toolset full`** (via `--toolset full` or `MOBILE_E2E_TOOLSET=full`).

<details>
<summary>View all 68 MCP tools (9 categories)</summary>

### 1) Session & lifecycle

`start_session`, `request_manual_handoff`, `end_session`, `run_flow`, `reset_app_state`

### 2) Task orchestration & flow capture

`execute_intent`, `complete_task`, `start_record_session`, `get_record_session_status`, `end_record_session`, `cancel_record_session`, `export_session_flow`, `record_task_flow`, `validate_flow`

### 3) Device & app control

`list_devices`, `install_app`, `launch_app` (supports iOS Simulator `launchEnv`, `launchArgs`, and `terminateRunning`), `terminate_app`, `describe_capabilities`, `doctor`

### 4) UI perception, targeting, and interaction

`inspect_ui`, `query_ui`, `resolve_ui_target`, `audit_ui_surface` (with optional baseline ratchet diffing via `baselinePath` / `baselineMode`), `scroll_only`, `perform_gesture` (iOS simulator full via AXe v2.2+ `draw` / `drag` / `pinch` / `double_tap` / `two_finger_tap`; Android partial via `adb` `drag` / 2-point `draw` / `double_tap`), `scroll_and_resolve_ui_target`, `wait_for_ui`, `wait_for_ui_stable`, `tap`, `tap_element`, `scroll_and_tap_element`, `type_text`, `type_into_element`, `navigate_back` (iOS simulator AXe read/capture commands `describe-ui`, `displays`, `screenshot`, and `ping` reuse a per-UDID persistent `axe serve` transport pool with idle shutdown and `M2E_DISABLE_AXE_SERVE=1` opt-out; HID input commands remain one-shot to avoid `dtuhidd` virtual HID service accumulation)

### 5) Evidence, observability, and diagnostics

`take_screenshot`, `record_screen` (fixed-duration or non-blocking `start`/`stop` with `discardOnStop` and 180s cap; iOS simulator via `axe record-video` with `simctl` fallback, Android via `adb shell screenrecord`, iOS physical device returns `UNSUPPORTED_OPERATION`), `get_logs`, `get_crash_signals`, `collect_diagnostics`, `collect_debug_evidence`, `get_screen_summary`, `get_session_state`, `get_page_context`, `capture_js_console_logs`, `capture_js_network_events`, `list_js_debug_targets`, `capture_element_screenshot`, `compare_visual_baseline`

### 6) Interruption handling

`detect_interruption`, `classify_interruption`, `resolve_interruption`, `resume_interrupted_action`

### 7) Failure analysis, recovery, and remediation

`perform_action_with_evidence`, `get_action_outcome`, `explain_last_failure`, `rank_failure_candidates`, `find_similar_failures`, `compare_against_baseline`, `recover_to_known_state`, `replay_last_stable_path`, `suggest_known_remediation`, `replay_checkpoint_chain`

### 8) Performance profiling

`measure_android_performance`, `measure_ios_performance`

### 9) Network diagnostics

`probe_network_readiness`, `diagnose_network_failure`, `inspect_network_policy`

`probe_network_readiness` checks runtime connectivity, DNS, latency, and optional backend reachability. `diagnose_network_failure` starts from an observed failed request and attributes likely Android cleartext or iOS ATS release-policy blockers. `inspect_network_policy` remains the lower-level static checker for plain HTTP endpoints using decoded manifest, network-security-config, Info.plist, or readable APK/IPA ZIP artifact evidence. These tools do not proxy traffic or mutate app configuration.

</details>

For exact signatures and supported inputs/outputs, use `packages/mcp-server/src/server.ts` (the tool registry source of truth).

## Deterministic Ladder and Fallback Policy

Action resolution order is intentional and strict:

1. Stable ID/resource-id/testID/accessibility identifier
2. Semantic tree match (text/label/role)
3. OCR text-region fallback (bounded)
4. CV/template fallback (bounded)
5. Fail with reason code + artifacts

Prohibited behavior:

- OCR/CV as the default first path
- Unbounded retries without state-change evidence
- Silent downgrade from deterministic to probabilistic execution

## Repository-Wide Principles

- **Deterministic-first**: use stable IDs/tree/native capabilities first; OCR/CV is bounded fallback.
- **Structured tool contracts**: return machine-consumable result envelopes (`status`, `reasonCode`, artifacts).
- **Session-oriented execution**: actions run in auditable sessions with explicit policy profiles.
- **Evidence-rich failures**: failures should carry enough context for explain/replay/remediation.

## Session, Policy, and Governance Model

- Sessions are auditable execution units with timeline and artifact references.
- Policy profiles can restrict tool classes (for example read-only vs interactive/full-control).
- Lease/scheduler constraints prevent unsafe concurrent execution on the same target.
- Redaction/governance paths exist to keep evidence useful while respecting data boundaries.

Key policy/config locations:

- `configs/policies/*.yaml`
- `configs/profiles/*.yaml`
- [Policy profile guide](docs/guides/policy-profiles.md)

## Non-Goals (Important for Correct Expectations)

- This is not a replacement for every mobile framework internals.
- This is not OCR-first automation.
- This does not imply separate full RN or Flutter backends, or immediate parity across all native/RN/Flutter edge cases.
- This is not a single abstraction that erases all platform differences.

## Selected Docs

- [README.zh-CN.md](README.zh-CN.md) — Chinese overview
- [docs/README.md](docs/README.md) — public documentation index and publication policy
- [docs/guides/ai-agent-invocation.zh-CN.md](docs/guides/ai-agent-invocation.zh-CN.md) — canonical AI-agent invocation guide
- [docs/guides/policy-profiles.md](docs/guides/policy-profiles.md) — policy profile usage and escalation boundaries
- [docs/engineering/ai-first-capability-expansion-guideline.md](docs/engineering/ai-first-capability-expansion-guideline.md) — feature expansion rules for AI-first harness capabilities
- [docs/architecture/01-system-architecture.md](docs/architecture/01-system-architecture.md) — system topology, contracts, and reliability
- [docs/architecture/02-platform-adapters.md](docs/architecture/02-platform-adapters.md) — Android/iOS backend adapters
- [docs/architecture/03-capability-model.md](docs/architecture/03-capability-model.md) — capability taxonomy and maturity levels
- [docs/architecture/04-runtime-architecture.md](docs/architecture/04-runtime-architecture.md) — execution coordinator, fallback, and recovery
- [docs/architecture/05-governance-security.md](docs/architecture/05-governance-security.md) — governance, policy, and security model
- [docs/architecture/README.zh-CN.md](docs/architecture/README.zh-CN.md) — architecture navigation index (zh-CN)
- [docs/architecture/session-orchestration-architecture.zh-CN.md](docs/architecture/session-orchestration-architecture.zh-CN.md) — session lease/scheduler/runtime orchestration
- [docs/architecture/policy-engine-runtime-architecture.zh-CN.md](docs/architecture/policy-engine-runtime-architecture.zh-CN.md) — policy runtime/guard/scope mapping
- [docs/architecture/platform-implementation-matrix.zh-CN.md](docs/architecture/platform-implementation-matrix.zh-CN.md) — cross-platform support matrix
- [docs/delivery/roadmap.md](docs/delivery/roadmap.md) — delivery phases
- [docs/delivery/npm-release-and-git-tagging.zh-CN.md](docs/delivery/npm-release-and-git-tagging.zh-CN.md) — npm release and Git tagging integration guide (includes layered doc-sync rules for PR/pre-tag/tag stages)
- [docs/showcase/README.md](docs/showcase/README.md) — real-device demo evidence and repro scripts
- [.github/actions/mobile-e2e-gate/action.yml](.github/actions/mobile-e2e-gate/action.yml) — drop-in CI gate (no new MCP tools; 68 total / 20 core)
- [docs/showcase/killer-demo-real-app.md](docs/showcase/killer-demo-real-app.md) — two 60s real open-source app demos with proof-level boundaries
- [tests/README.md](tests/README.md) — test layers and CI scope

## Roadmap Snapshot (Short)

- Near term: harden deterministic session/action reliability and evidence model.
- Mid term: broaden framework/profile maturity and real-run coverage.
- Long term: stronger agentic remediation/governance and enterprise controls.

Detailed public planning references are maintained in `docs/delivery/roadmap.md` and `docs/architecture/*`.

## Open Source Collaboration

- License: [MIT](LICENSE)
- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## Support This Project

If this project helps your team, you can support it by:

1. Starring and sharing the repository
2. Opening issues/PRs with reproducible evidence
3. Sponsoring the project

Donation note:

- [![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/shenyuexin)
