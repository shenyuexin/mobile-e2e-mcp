# iOS Simulator Tool Probe Checklist

> Checklist source for `scripts/dev/ios-simulator-tool-probe.ts`.
> Target: iOS Simulator (axe backend), Settings app (`com.apple.Preferences`).

## Environment

- Simulator UDID: from `M2E_SIMULATOR_UDID` or `SIM_UDID` env (default: `ADA078B9-3C6B-4875-8B85-A7789F368816`)
- Platform: `ios`
- Runner profile: `native_ios`
- Backend: `axe` CLI (auto-selected for simulator UDIDs)
- Prerequisites:
  - Xcode installed
  - Simulator booted: `xcrun simctl boot <UDID>`
  - `axe` installed: `brew install cameroncooke/axe/axe`

## Core Probe Scope

These tools form the default probe, covering the main path for iOS simulator E2E:

### Session / lifecycle

- `start_session` — create probe session
- `launch_app` — open Settings app (cold start or relaunch)
- `terminate_app` — force-stop Settings (part of relaunch)

### UI inspect / action / orchestration

- `wait_for_ui` — wait for "Wi-Fi" / "General" visible
- `resolve_ui_target` — resolve "General" / "Developer" position
- `scroll_only` — scroll to find elements below fold
- `scroll_to_top` (via `scroll_only` + verify) — return to top of Settings
- `tap_element` — tap "Search" button
- `tap_cancel` (helper) — tap "Cancel" to exit search
- `type_into_element` — type "bluetooth" in search field
- `execute_intent` — tap "General" via natural language intent
- `navigate_back` (goback helper) — app-level back navigation
- `perform_action_with_evidence` — tap "Bluetooth" with evidence capture
- `complete_task` — multi-step task execution

### Recovery / diagnosis

- `recover_to_known_state` — restore known state
- `replay_last_stable_path` — replay last successful action

### Flow / integration

- `run_flow` — run `ios-settings-smoke.yaml` flow

### Failure context tools

- `perform_action_with_evidence(failure)` — intentional failure to create context
- `explain_last_failure` — explain why last action failed
- `find_similar_failures` — lookup similar historical failures
- `rank_failure_candidates` — rank failure candidates
- `compare_against_baseline` — compare against local baseline
- `resume_interrupted_action` — resume from synthetic checkpoint

### JS debug tools (expected to fail without Metro)

- `capture_js_console_logs` — expected: CONFIGURATION_ERROR
- `capture_js_network_events` — expected: CONFIGURATION_ERROR

### Session teardown

- `end_session` — close session

## iOS Simulator vs Physical Device Differences

| Aspect | Simulator | Physical Device |
|--------|-----------|-----------------|
| Backend | `axe` CLI | WDA (WebDriverAgent) |
| Device ID format | UUID (`ADA078B9-...`) | UDID (`00008101-...`) |
| Back navigation | `target: "app"` only | `target: "app"` only |
| App detection | `get_session_state` only | Same |
| `launch_app` | No `launchUrl` needed | Same for Settings |
| Running app check | No `dumpsys` equivalent | No `dumpsys` equivalent |

## Artifacts

After each run:
- `output/evidence/probes/ios-simulator-tool-probe/<runId>/report.json` — full JSON report
- `output/evidence/probes/ios-simulator-tool-probe/<runId>/summary.md` — Markdown summary
- `output/reports/ios-simulator-tool-probe.json` — latest run (symlink equivalent)
- `output/reports/ios-simulator-tool-probe.md` — latest run (symlink equivalent)
