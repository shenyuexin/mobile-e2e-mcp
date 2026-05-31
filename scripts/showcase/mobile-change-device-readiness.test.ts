import assert from "node:assert/strict";
import test from "node:test";

test("device readiness preflight blocks live proof when no eligible device is available", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-no-device",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({ status: "success", reasonCode: "OK", data: { android: [], ios: [] } }));

  assert.equal(preflight.schema, "mobile-change-device-readiness/v1");
  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "DEVICE_UNAVAILABLE");
  assert.equal(preflight.blockers[0]?.diagnostic.blockerType, "no_device");
  assert.equal(preflight.nextAction.kind, "connect_device_or_use_self_hosted_runner");
  assert.match(preflight.nextAction.command, /proof:mobile-change-verification:live/);
  assert.ok(preflight.boundaries.some((boundary) => boundary.includes("does not claim physical-device proof")));
});

test("device readiness preflight distinguishes unauthorized Android devices", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-unauthorized",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "10AEA40Z3Y000R5", available: false, state: "unauthorized" }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "DEVICE_UNAUTHORIZED");
  assert.equal(preflight.blockers[0]?.diagnostic.blockerType, "unauthorized");
  assert.equal(preflight.nextAction.kind, "authorize_device");
  assert.match(preflight.nextAction.reason, /USB debugging authorization/);
});

test("device readiness preflight distinguishes offline Android devices", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-offline",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "10AEA40Z3Y000R5", available: false, state: "offline" }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "DEVICE_OFFLINE");
  assert.equal(preflight.blockers[0]?.diagnostic.blockerType, "offline");
  assert.equal(preflight.nextAction.kind, "restart_or_select_online_device");
});

test("device readiness preflight distinguishes requested missing devices", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-wrong-device",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
    deviceId: "10AEA40Z3Y000R5",
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "emulator-5554", available: true }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "REQUESTED_DEVICE_UNAVAILABLE");
  assert.equal(preflight.blockers[0]?.diagnostic.blockerType, "wrong_device");
  assert.equal(preflight.nextAction.kind, "select_requested_device");
});

test("device readiness preflight distinguishes platform inventory failures", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-platform-tool",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({ status: "failed", reasonCode: "ADB_NOT_FOUND" }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "PLATFORM_TOOL_UNAVAILABLE");
  assert.equal(preflight.blockers[0]?.diagnostic?.blockerType, "platform_tool_unavailable");
  assert.equal(preflight.nextAction.kind, "install_or_repair_platform_tooling");
});

test("device readiness preflight adds diagnostics for missing app artifacts", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-missing-app",
    platform: "android",
    appId: "com.example.mobilechange",
    appArtifact: "missing/app-debug.apk",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "emulator-5554", available: true }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "APP_ARTIFACT_UNAVAILABLE");
  assert.equal(preflight.blockers[0]?.diagnostic?.blockerType, "missing_app");
  assert.equal(preflight.nextAction.kind, "build_or_provide_app_artifact");
});

test("device readiness preflight passes when device and readiness contract are present", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-ready",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      screenId: "login",
      appPhase: "authentication",
    },
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "emulator-5554", available: true }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "ready_for_live_mobile_change_verification");
  assert.equal(preflight.selectedDeviceId, "emulator-5554");
  assert.equal(preflight.blockers.length, 0);
  assert.equal(preflight.nextAction.kind, "run_live_mobile_change_verification");
  assert.equal(preflight.nextAction.command, "pnpm run proof:mobile-change-verification:live");
});

test("device readiness preflight requires at least one deterministic readiness expectation", async () => {
  const { buildMobileChangeDeviceReadinessPreflight } = await import("./mobile-change-device-readiness.ts");

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: "device-readiness-missing-contract",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {},
  }, async () => ({
    status: "success",
    reasonCode: "OK",
    data: {
      android: [{ id: "emulator-5554", available: true }],
      ios: [],
    },
  }));

  assert.equal(preflight.verdict, "blocked_before_live_verification");
  assert.equal(preflight.blockers[0]?.reasonCode, "READINESS_CONTRACT_MISSING");
  assert.equal(preflight.blockers[0]?.diagnostic.blockerType, "missing_readiness_contract");
  assert.equal(preflight.nextAction.kind, "define_readiness_contract");
});
