## React Native runtime contract

Run ID: `react-native-runtime-contract-2026-06-01`
Default mode: `bare_debug`

Modes:
- expo_go: `conditional`
  - Entry: `expo_url`
  - Requires Metro: `true`; JS target: `true`; app artifact: `false`
  - Evidence: `Metro console snapshot`, `Metro network snapshot`
- expo_dev_client: `experimental`
  - Entry: `dev_client_deep_link`
  - Requires Metro: `true`; JS target: `true`; app artifact: `false`
  - Evidence: `Metro console snapshot`, `Metro network snapshot`, `native logs`
- bare_debug: `experimental`
  - Entry: `native_app_launch`
  - Requires Metro: `true`; JS target: `true`; app artifact: `false`
  - Evidence: `Metro console snapshot`, `Metro network snapshot`, `native logs`, `screenshots`
- bare_release: `conditional`
  - Entry: `release_artifact_launch`
  - Requires Metro: `false`; JS target: `false`; app artifact: `true`
  - Evidence: `native logs`, `screenshots`, `crash evidence`

Boundaries:
- Runtime mode clarifies prerequisites; it does not start Metro, build apps, or install artifacts by itself.
- Native UI post-condition evidence remains the proof backbone for every RN mode.
- Metro and JS debug target evidence are required only for debug/dev modes and remain supplemental.
