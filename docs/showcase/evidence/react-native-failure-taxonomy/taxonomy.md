## React Native failure taxonomy

Verdict: `rn_failure_detected`
Run ID: `react-native-failure-taxonomy-2026-06-01`

Classifications:
- RN_METRO_UNAVAILABLE: `environment`, confidence `high`
  - Detail: Metro inspector endpoint is not reachable.
  - Recommendation: `start_metro_or_expo` - Metro must be reachable before RN debug evidence can be collected.
  - Command: `npx react-native start`
- RN_NO_DEBUG_TARGET: `environment`, confidence `high`
  - Detail: No RN/Expo debug target can be selected because Metro is unavailable.
  - Recommendation: `attach_react_native_debug_target` - Launch or reload the RN app so Metro exposes a debuggable JS target.
  - Command: `pnpm run validate:react-native-readiness`

Boundaries:
- RN failure taxonomy groups observed evidence; it is not a root-cause oracle.
- Recommendations are bounded next actions and must not autonomously edit app or test code.
- Metro-only or JS-only evidence cannot promote live success without native verification and intake.
