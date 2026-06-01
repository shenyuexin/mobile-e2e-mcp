import assert from "node:assert/strict";
import test from "node:test";
import { buildReactNativeReadiness, renderReactNativeReadinessMarkdown } from "./react-native-readiness.ts";

const baseOptions = {
  runId: "rn-readiness-test",
  platform: "android" as const,
  appId: "com.example.rn",
  metroBaseUrl: "http://127.0.0.1:8081",
  policyProfile: "interactive",
  runnerProfile: "react_native_android",
  runtimeMode: "bare_debug" as const,
  expectedReadiness: { screenId: "login", appPhase: "authentication" },
  stableSelectors: ["login.email", "login.submit"],
};

test("RN readiness passes when device Metro target readiness and selectors exist", async () => {
  const result = await buildReactNativeReadiness(baseOptions, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", state: "device", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "success", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 1, targets: [{ id: "rn", title: "React Native Hermes" }] } }),
  });

  assert.equal(result.verdict, "ready_for_react_native_verification");
  assert.equal(result.proofLevel, "readiness_candidate");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.nextAction.kind, "run_react_native_verification");
});

test("RN readiness reports no visible device before live verification", async () => {
  const result = await buildReactNativeReadiness(baseOptions, {
    listDevices: async () => ({ status: "success", data: { android: [], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "success", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 1, targets: [{ id: "rn" }] } }),
  });

  assert.equal(result.verdict, "blocked_before_react_native_verification");
  assert.equal(result.blockers[0]?.reasonCode, "DEVICE_UNAVAILABLE");
  assert.equal(result.nextAction.kind, "connect_device_or_use_self_hosted_runner");
});

test("RN readiness reports Metro unavailable as a setup blocker", async () => {
  const result = await buildReactNativeReadiness(baseOptions, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "failed", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 0, targets: [] } }),
  });

  assert.equal(result.blockers.some((blocker) => blocker.reasonCode === "METRO_UNAVAILABLE"), true);
  assert.equal(result.nextAction.kind, "start_metro_or_expo");
});

test("RN readiness distinguishes reachable Metro with no attached JS target", async () => {
  const result = await buildReactNativeReadiness(baseOptions, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "success", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 0, targets: [] } }),
  });

  assert.equal(result.blockers.some((blocker) => blocker.reasonCode === "NO_JS_DEBUG_TARGET"), true);
  assert.equal(result.nextAction.kind, "attach_react_native_debug_target");
});

test("RN readiness requires stable selector contract", async () => {
  const result = await buildReactNativeReadiness({ ...baseOptions, stableSelectors: [] }, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "success", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 1, targets: [{ id: "rn" }] } }),
  });

  assert.equal(result.blockers.some((blocker) => blocker.reasonCode === "STABLE_SELECTOR_CONTRACT_MISSING"), true);
});

test("RN readiness does not require Metro for bare release mode with artifact", async () => {
  const result = await buildReactNativeReadiness({
    ...baseOptions,
    runtimeMode: "bare_release",
    appArtifact: "app-release.apk",
  }, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "failed", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 0, targets: [] } }),
  });

  assert.equal(result.verdict, "ready_for_react_native_verification");
  assert.equal(result.runtimeRequirements.requiresMetroInspector, false);
  assert.equal(result.checks.find((check) => check.id === "metro-inspector")?.status, "passed");
});

test("RN readiness requires app artifact for bare release mode", async () => {
  const result = await buildReactNativeReadiness({ ...baseOptions, runtimeMode: "bare_release" }, {
    listDevices: async () => ({ status: "success", data: { android: [{ id: "device-1", available: true }], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "success", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 1, targets: [{ id: "rn" }] } }),
  });

  assert.equal(result.blockers.some((blocker) => blocker.reasonCode === "APP_ARTIFACT_REQUIRED"), true);
});

test("RN readiness markdown includes blocker and boundary language", async () => {
  const result = await buildReactNativeReadiness({ ...baseOptions, stableSelectors: [] }, {
    listDevices: async () => ({ status: "success", data: { android: [], ios: [] } }),
    listJsDebugTargets: async () => ({ status: "failed", data: { endpoint: "http://127.0.0.1:8081/json/list", targetCount: 0, targets: [] } }),
  });
  const markdown = renderReactNativeReadinessMarkdown(result);

  assert.match(markdown, /React Native readiness/);
  assert.match(markdown, /DEVICE_UNAVAILABLE/);
  assert.match(markdown, /does not prove app success/);
});
