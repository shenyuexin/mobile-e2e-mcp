import assert from "node:assert/strict";
import test from "node:test";
import { buildReactNativeEvidencePack, renderReactNativeEvidencePackMarkdown, validateReactNativeEvidencePack } from "./react-native-evidence-pack.ts";
import type { ReactNativeReadinessResult } from "./react-native-readiness.ts";

function readiness(overrides: Partial<ReactNativeReadinessResult> = {}): ReactNativeReadinessResult {
  return {
    schema: "react-native-readiness/v1",
    runId: "rn-readiness",
    verdict: "ready_for_react_native_verification",
    proofLevel: "readiness_candidate",
    platform: "android",
    appId: "com.example.rn",
    metroBaseUrl: "http://127.0.0.1:8081",
    policyProfile: "interactive",
    runnerProfile: "react_native_android",
    selectedDeviceId: "device-1",
    expectedReadiness: { screenId: "login", appPhase: "authentication" },
    stableSelectors: ["login.submit"],
    checks: [],
    blockers: [],
    nextAction: { kind: "run_react_native_verification", command: "pnpm run verify:react-native-change", reason: "Ready." },
    boundaries: ["RN readiness is a preflight and does not prove app success by itself."],
    ...overrides,
  };
}

test("RN evidence pack preserves blocked readiness proof level", () => {
  const pack = buildReactNativeEvidencePack({
    runId: "pack-blocked",
    readinessSourcePath: "docs/showcase/evidence/react-native-readiness/summary.json",
    readiness: readiness({
      verdict: "blocked_before_react_native_verification",
      proofLevel: "blocked_before_live",
      blockers: [{ id: "metro-inspector", status: "blocked", reasonCode: "METRO_UNAVAILABLE", detail: "Metro down.", evidence: [], nextActions: [] }],
      nextAction: { kind: "start_metro_or_expo", command: "npx react-native start", reason: "Start Metro." },
    }),
  });

  assert.equal(pack.reviewStatus, "blocked");
  assert.equal(pack.proofLevel, "blocked_before_live");
  assert.equal(pack.nextAction.kind, "fix_readiness_blocker");
  validateReactNativeEvidencePack(pack);
});

test("RN evidence pack marks JS exceptions as needs review, not success", () => {
  const pack = buildReactNativeEvidencePack({
    runId: "pack-js-exception",
    readinessSourcePath: "ready.json",
    readiness: readiness(),
    consoleSignal: {
      available: true,
      source: "metro_inspector",
      status: "captured",
      summary: "Captured one JS exception.",
      counters: { totalLogs: 4, exceptionCount: 1 },
    },
  });

  assert.equal(pack.reviewStatus, "needs_review");
  assert.equal(pack.proofLevel, "rn_evidence_candidate");
  assert.equal(pack.nextAction.kind, "inspect_js_runtime");
});

test("RN evidence pack can be ready for review when readiness is clean and JS signals are quiet", () => {
  const pack = buildReactNativeEvidencePack({
    runId: "pack-ready",
    readinessSourcePath: "ready.json",
    readiness: readiness(),
    consoleSignal: {
      available: true,
      source: "metro_inspector",
      status: "captured",
      summary: "No JS exceptions.",
      counters: { totalLogs: 2, exceptionCount: 0 },
    },
    networkSignal: {
      available: true,
      source: "metro_inspector",
      status: "captured",
      summary: "No failed requests.",
      counters: { totalTrackedRequests: 3, failedRequestCount: 0 },
    },
  });

  assert.equal(pack.reviewStatus, "ready_for_review");
  assert.equal(pack.nextAction.kind, "attach_rn_evidence_pack");
});

test("RN evidence pack markdown includes supplemental Metro boundary", () => {
  const pack = buildReactNativeEvidencePack({
    runId: "pack-markdown",
    readinessSourcePath: "ready.json",
    readiness: readiness(),
  });
  const markdown = renderReactNativeEvidencePackMarkdown(pack);

  assert.match(markdown, /React Native evidence pack/);
  assert.match(markdown, /Metro console and network signals are supplemental/);
});
