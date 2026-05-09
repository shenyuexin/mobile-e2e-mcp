# iOS Owned Runner (Repository-owned scaffold)

This directory contains the repository-owned iOS XCTest runner scaffold used for physical-device action execution and experimental hierarchy capture.

## Purpose

- Keep iOS physical runner startup/control under `mobile-e2e-mcp` ownership.
- Reduce dependence on external runner apps as the primary lane.
- Make startup failures (`preflight`, `code74`, `dtxproxy`) observable and attributable.

## Structure

- `project.yml` — XcodeGen spec for generating local Xcode project files.
- `OwnedRunnerApp/` — minimal host app.
- `OwnedRunnerUITests/` — XCTest target (tap/type/hierarchy execution entrypoint scaffold).

## Build notes

1. Generate project (XcodeGen):
   - `xcodegen generate --spec packages/adapter-maestro/runner/project.yml`
2. Build-for-testing to produce `.xctestrun` artifacts.
3. Run through script:
   - `scripts/dev/run-ios-owned-physical-runner.sh execute-flow`

Current scaffold is intentionally minimal; runtime flow parsing and command dispatch will be implemented in follow-up slices.

## Runtime action protocol (MVP)

The adapter injects these environment variables when invoking the owned runner:

- `IOS_OWNED_RUNNER_FLOW_PATH` (original generated flow artifact path)
- `IOS_OWNED_RUNNER_ACTION_TYPE` (`tap` or `type_text`)
- `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` (optional target AUT bundle id)
- `IOS_OWNED_RUNNER_ACTION_X` / `IOS_OWNED_RUNNER_ACTION_Y` (for `tap`)
- `IOS_OWNED_RUNNER_ACTION_TEXT` (for `type_text`)

Current UITest scaffold consumes the protocol and executes deterministic in-app actions to prove end-to-end command wiring.
For `tap`, when `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` is provided, the UITest lane attempts coordinate tap on the target app.
For `type_text`, when `IOS_OWNED_RUNNER_TARGET_BUNDLE_ID` is provided, the UITest lane tries first editable field/text-view in target app and types the payload.

## Capability status

| Capability | Owned runner status | Notes |
|---|---|---|
| tap coordinate | experimental MVP | XCTest coordinate tap through target app activation. |
| type text | experimental MVP | First editable element fallback; target resolution is not complete. |
| UI source/query | experimental opt-in | `IOS_EXECUTION_BACKEND=owned-runner` can emit a bounded XCTest accessibility tree; WDA remains the default physical backend. |
| screenshot evidence | planned P0 | Required for Explorer reports and failure attribution; screenshot routing is unchanged in the current action-only slice. |
| app lifecycle | planned P1 | Launch/activate exists narrowly; terminate/state/open URL still needed. |
| alerts/interruption | planned P1 | Must be policy-gated before use in Explorer traversal. |

The runner now emits structured stdout lines prefixed with `MOBILE_E2E_OWNED_RUNNER_RESULT=` for supported tap/type outcomes. Adapter-side execution treats this structured result as the action outcome source of truth when the owned runner path is explicitly required.
