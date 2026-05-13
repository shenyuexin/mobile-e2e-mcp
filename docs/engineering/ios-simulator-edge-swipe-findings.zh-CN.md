# iOS Simulator Edge Swipe Findings

Date: 2026-05-13

## Context

Explorer needs a reliable app-level back capability for iOS Settings traversal. The candidate strategy was `navigate_back` with `iosStrategy: "edge_swipe"` on iOS Simulator, using coordinate swipe injection from the left screen edge.

Manual validation showed that dragging from the simulator screen edge in Settings can return from General/About to the parent Settings page. The question was whether command-line swipe backends can synthesize an equivalent interactive-pop gesture.

## Experiments

The probe script `scripts/dev/ios-swipe-back-probe.ts` launches Settings, opens General, waits for the About marker, captures pre-back state, runs `navigate_back` with `iosStrategy: "edge_swipe"`, and records command history plus before/after page identity.

Evidence runs:

- `output/evidence/probes/ios-swipe-back/ios-swipe-back-probe-2026-05-13T01-58-38-723Z/summary.json`
- `output/evidence/probes/ios-swipe-back/ios-swipe-back-probe-2026-05-13T02-13-41-771Z/summary.json`

AXe variants tested through `navigate_back`:

- `axe swipe --start-x 0 --start-y 466 --end-x 370 --end-y 466 --duration 0.6 --delta 3 --pre-delay 0.2 --post-delay 0.4`
- `axe swipe --start-x 1 --start-y 466 --end-x 370 --end-y 466 --duration 0.7 --delta 4 --pre-delay 0.15 --post-delay 0.35`
- `axe swipe --start-x 3 --start-y 466 --end-x 335 --end-y 466 --duration 0.5 --delta 6 --pre-delay 0.1 --post-delay 0.3`
- `axe swipe --start-x 8 --start-y 466 --end-x 280 --end-y 466 --duration 0.3`

Observed result:

- command execution completed
- `stateChanged` remained `false`
- `pageTreeHashUnchanged` remained `true`
- `reasonCode` was `RETRY_EXHAUSTED_NO_STATE_CHANGE`

IDB validation:

- `idb ui tap` worked
- normal vertical `idb ui swipe` / scroll worked
- horizontal edge swipes from `x=0` with slower duration and smaller delta did not return to the parent page

## Conclusion

Current CLI swipe abstractions are not a reliable implementation of iOS Simulator interactive-pop back navigation.

The evidence separates the failure layers:

- the app and simulator support manual edge back
- AXe can send swipe commands, but the page state does not change
- IDB can inject tap and ordinary swipe input, but edge swipes still do not trigger back

Therefore this should be treated as a backend limitation for iOS Simulator command-line gesture injection, not as a coordinate-tuning issue.

## Product Decision

Do not claim iOS Simulator `edge_swipe` as a reliable Explorer back capability through AXe or IDB.

Current behavior should remain diagnostic and bounded:

- keep `commandHistory` so reports show exactly which gesture variants were attempted
- return `partial` with no-state-change evidence when commands execute but the page does not change
- prefer selector or point-band back paths for Explorer on iOS Simulator
- keep `edge_swipe` as conditional/experimental evidence, not a primary simulator traversal dependency

Future first-class edge back support should use a lower-level backend that can synthesize a real interactive drag gesture, such as a dedicated XCTest/WDA action-chain implementation, and should be validated by the same probe before documentation claims are upgraded.
