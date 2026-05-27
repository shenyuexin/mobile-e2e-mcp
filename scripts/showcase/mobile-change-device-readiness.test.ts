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
  assert.equal(preflight.nextAction.kind, "connect_device_or_use_self_hosted_runner");
  assert.match(preflight.nextAction.command, /proof:mobile-change-verification:live/);
  assert.ok(preflight.boundaries.some((boundary) => boundary.includes("does not claim physical-device proof")));
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
  assert.equal(preflight.nextAction.kind, "define_readiness_contract");
});
