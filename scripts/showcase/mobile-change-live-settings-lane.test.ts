import assert from "node:assert/strict";
import test from "node:test";

test("settings live success lane defines a no-apk Android proof command", async () => {
  const { buildMobileChangeLiveSettingsLane, renderMobileChangeLiveSettingsLaneMarkdown } = await import("./mobile-change-live-settings-lane.ts");

  const lane = buildMobileChangeLiveSettingsLane({
    deviceId: "10AEA40Z3Y000R5",
    runId: "android-settings-success-2026-05-29",
  });

  assert.equal(lane.schema, "mobile-change-live-settings-lane/v1");
  assert.equal(lane.platform, "android");
  assert.equal(lane.appId, "com.android.settings");
  assert.equal(lane.expectedReadiness.screenId, undefined);
  assert.equal(lane.expectedReadiness.appPhase, undefined);
  assert.equal(lane.deviceId, "10AEA40Z3Y000R5");
  assert.match(lane.command, /M2E_LIVE_MOBILE_CHANGE_APP_ID=com\.android\.settings/);
  assert.match(lane.command, /M2E_DEVICE_ID=10AEA40Z3Y000R5/);
  assert.match(lane.command, /proof:mobile-change-verification:live/);
  assert.equal(lane.successCriteria[0], "Device discovery succeeds for the requested Android device.");

  const markdown = renderMobileChangeLiveSettingsLaneMarkdown(lane);
  assert.match(markdown, /## Mobile change live Settings lane/);
  assert.match(markdown, /App: `com.android.settings`/);
  assert.match(markdown, /No APK build or install is required/);
});

test("settings live success lane can be generated without a fixed device id", async () => {
  const { buildMobileChangeLiveSettingsLane } = await import("./mobile-change-live-settings-lane.ts");

  const lane = buildMobileChangeLiveSettingsLane({
    runId: "android-settings-success-latest",
  });

  assert.equal(lane.deviceId, undefined);
  assert.doesNotMatch(lane.command, /M2E_DEVICE_ID=/);
  assert.match(lane.command, /M2E_LIVE_MOBILE_CHANGE_APP_ID=com\.android\.settings/);
});
