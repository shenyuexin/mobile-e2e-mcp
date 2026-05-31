## Official Tool Bridge

Generated at: `2026-06-01`

Positioning:
- Mobile E2E MCP: Governed cross-stack mobile verification harness: policy, session, evidence, intake, failure memory, and PR/CI proof boundaries.
- Official tools: Source-native AI tooling that can author journeys, provide project context, or produce upstream execution evidence.
- Replacement claim: `false`

Bridge rules:
- Official-tool outputs are accepted only as evidence or context candidates until mobile-e2e intake assigns proof level.
- Vision/reasoning assertions must be labeled separately from deterministic readiness or native post-condition checks.
- No official-tool bridge entry may claim to replace the harness policy, session, evidence, and failure-memory layer.

### Android CLI support for Journeys

- ID: `android_cli_journeys`
- Source: https://developer.android.com/tools/agents/android-cli/journeys
- Role: `upstream_android_journey_executor`
- Relation: `upstream_evidence_provider`
- Accepted evidence: `journey_definition`, `journey_run_result`, `device_screenshot`, `assertion_result`
- Cannot claim: `standalone_cross_stack_success`, `react_native_or_flutter_profile_maturity`, `policy_session_audit_coverage_inside_this_harness`
- Recommended use: Use as an Android-native upstream journey runner; ingest outputs as evidence candidates, not as automatic mobile-e2e success proof.

### Journeys for Android Studio

- ID: `android_studio_journeys`
- Source: https://developer.android.com/studio/gemini/journeys
- Role: `ide_android_journey_authoring`
- Relation: `upstream_evidence_provider`
- Accepted evidence: `journey_xml`, `ide_run_result`, `reasoning_trace`, `assertion_result`
- Cannot claim: `standalone_cross_stack_success`, `non_android_platform_coverage`, `harness_policy_compliance_without_intake`
- Recommended use: Use for Android IDE journey authoring and exploratory AI testing; treat run output as upstream evidence requiring harness intake.

### Dart and Flutter MCP server

- ID: `dart_flutter_mcp`
- Source: https://docs.flutter.dev/ai/mcp-server
- Role: `framework_project_context_provider`
- Relation: `upstream_context_provider`
- Accepted evidence: `runtime_error`, `widget_tree_context`, `static_analysis_issue`, `dependency_action`
- Cannot claim: `standalone_device_e2e_success`, `android_or_ios_policy_session_coverage`, `react_native_support`
- Recommended use: Use as Flutter project intelligence and runtime context for agents; combine with mobile-e2e device evidence for proof.
