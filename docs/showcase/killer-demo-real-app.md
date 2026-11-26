# Killer Demo — Real Open-Source Apps in 60 Seconds

> **Proof level: `reproducible-demo`.** The command sequences, the reusable CI
> gate, and this document's links are verified by dry-run/structure tests. The
> on-device steps below are **not live proof**: they require you to install a
> real app on a connected device or emulator and run them yourself. No real
> device run numbers are claimed here. See
> [`reproducible-demo` in the capability guideline](../engineering/ai-first-capability-expansion-guideline.md)
> and the [CI evidence boundary guide](ci-evidence.md).

This guide goes beyond system Settings: both demos target real, open-source
Android apps with stable package ids, so an external team can paste the same
commands into its own PR pipeline.

## Targets (real open-source apps)

| Demo | App | Package id | Why it is a fair target |
| --- | --- | --- | --- |
| 1 | Wikipedia (Android) | `org.wikipedia` | Stable package id, public release, deterministic search entry, real content hierarchy |
| 2 | Mastodon (Android) | `org.joinmastodon.android` | Stable package id, real login/timeline states, realistic failure/recovery surface |

Prerequisites: `adb devices` shows a device, the app is installed, `npx` is
available, and a known-good baseline has been captured once. Every UI-affecting
action needs a settle delay before capture; see
[UI stabilization timing](../guides/ui-stabilization-timing.md). The 60-second
budgets below are for a **capped smoke pass** (`--mode smoke --max-depth 2`),
not a full traversal.

## Demo 1 — Zero-script UI Inspection (60s)

Demo id: `zero-script-ui-inspection`

Goal: inspect → audit against a baseline → diff two runs, producing PR-ready
Markdown plus a self-contained `report.html`, without authoring a single flow.

| Time | Step | Command |
| --- | --- | --- |
| 0–10s | Install/launch | Install Wikipedia and leave it on its search entry screen |
| 10–30s | Explore base | `npx -y @shenyuexin/mobile-e2e-mcp@latest explore --platform android-device --app-id org.wikipedia --mode smoke --max-depth 2 --output output/showcase/killer-demo/base --export-flows output/showcase/killer-demo/flows --no-prompt` |
| 30–45s | Audit | `npx -y @shenyuexin/mobile-e2e-mcp@latest audit --platform android --app-id org.wikipedia --baseline-path output/showcase/killer-demo/baseline.json --output output/showcase/killer-demo/audit --fail-on-regression` |
| 45–60s | Diff | `npx -y @shenyuexin/mobile-e2e-mcp@latest diff output/showcase/killer-demo/base output/showcase/killer-demo/head --markdown output/showcase/killer-demo/diff.md --html output/showcase/killer-demo/report.html --fail-on-regression` |

Capture the baseline once from a known-good run with
`audit --baseline-mode update --baseline-path output/showcase/killer-demo/baseline.json`.
The `head` run is a second capped exploration after the UI change under review.

Artifacts: `diff.md` (PR-ready narrative), `report.html` (self-contained, no
external assets), `summary.json`, `failure-review.md`, and exported Maestro
flows under `output/showcase/killer-demo/flows/`.

Drop the same gate into CI with the
[reusable composite action](../../.github/actions/mobile-e2e-gate/action.yml):

```yaml
- uses: shenyuexin/mobile-e2e-mcp/.github/actions/mobile-e2e-gate@main
  with:
    mode: diff
    base-report-dir: output/showcase/killer-demo/base
    head-report-dir: output/showcase/killer-demo/head
    output-dir: output/showcase/killer-demo/gate
    fail-on-regression: "true"
    upload-artifacts: "true"
```

Inputs reach shell steps only through `env:` variables; no input is
interpolated into shell source. `comment-pr: "true"` additionally posts a
summary with `gh pr comment` when the job runs in a PR context (the caller must
grant `pull-requests: write`). The action's `platform` input is `android|ios`;
the unified CLI maps `android` to the emulator backend, so use the direct CLI
with `--platform android-device` when you specifically need a physical device.

## Demo 2 — AI Coding Agent Closed Loop (60s)

Demo id: `agent-closed-loop`

Goal: an agent using only the default `core` toolset (20 tools) reproduces a UI
defect, gets proposal-only healing guidance, fixes the source, and proves a
green regression pass.

| Time | Step | Command / tool |
| --- | --- | --- |
| 0–10s | Start core-only agent | `npx -y @shenyuexin/mobile-e2e-mcp@latest stdio --toolset core` (20 of 68 tools; no tool added for this demo) |
| 10–30s | Reproduce with evidence | `npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/mastodon-timeline.yaml --record-on-failure --suggest-heal --record-output output/showcase/killer-demo/failure.mp4 --json` |
| 30–45s | Diagnose | `audit_ui_surface` + `explain_last_failure` + `suggest_known_remediation` from the core toolset; read the preserved video and structured logs from the failed run |
| 45–60s | Fix and re-verify | Edit the app's selector/testID source, then re-run the same flow and `audit --fail-on-regression`; the video is discarded automatically on the green pass |

`--suggest-heal` is strictly proposal-only: it emits a structured suggestion
and a unified diff snippet and **never edits** `flows/mastodon-timeline.yaml`.
`--record-on-failure` discards the recording when the run passes and preserves
it as evidence when the run fails. Neither flag registers a new MCP tool.

## Verify this guide without a device

```bash
node --import tsx scripts/validate-github-gate-assets.ts
node --import tsx scripts/showcase/killer-demo-real-app.ts --check
```

`--check` confirms that this document still contains both 60-second plans, the
required command flags, and the `reproducible-demo` boundary label. It does not
claim that a device run happened.

## Proof-level boundaries

- **Verified here (offline):** action.yml inputs/structure, `shell: bash` on
  every shell step, upload-artifact@v4 wiring, PR-comment gating, command
  scaffolds, and Markdown link integrity across the root READMEs and all docs.
- **Not verified here:** app installation, live UI state, real selector
  stability, audit regression results, and any timing measurement. These become
  evidence only after you execute the commands against a device and commit the
  resulting artifacts.
- **Never claim:** that demos authored as templates are `ci-verified` or
  physical-device proof; that the agent edited source autonomously in a
  sandbox; or that a green `run --dry-run` equals a green on-device run.
