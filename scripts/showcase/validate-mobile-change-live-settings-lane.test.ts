import assert from "node:assert/strict";
import test from "node:test";

test("settings lane validator accepts tracked no-apk success lane", async () => {
  const { validateMobileChangeLiveSettingsLaneShape } = await import("./validate-mobile-change-live-settings-lane.ts");

  assert.doesNotThrow(() => validateMobileChangeLiveSettingsLaneShape({
    lane: {
      schema: "mobile-change-live-settings-lane/v1",
      platform: "android",
      appId: "com.android.settings",
      deviceId: "10AEA40Z3Y000R5",
      runId: "android-settings-live-success-2026-05-29",
      command: "M2E_DEVICE_ID=10AEA40Z3Y000R5 M2E_LIVE_MOBILE_CHANGE_APP_ID=com.android.settings pnpm run proof:mobile-change-verification:live",
      successCriteria: [
        "Device discovery succeeds for the requested Android device.",
        "The verification bundle verdict is mobile_change_verified.",
      ],
      boundaries: [
        "No APK build or install is required.",
        "The lane is a runnable proof recipe. It does not claim live success until the command is executed and the resulting bundle passes intake.",
      ],
    },
    markdown: "## Mobile change live Settings lane\nApp: `com.android.settings`\nNo APK build or install is required.\n",
  }));
});

test("settings lane validator rejects app-specific success claims", async () => {
  const { validateMobileChangeLiveSettingsLaneShape } = await import("./validate-mobile-change-live-settings-lane.ts");

  assert.throws(
    () => validateMobileChangeLiveSettingsLaneShape({
      lane: {
        schema: "mobile-change-live-settings-lane/v1",
        platform: "android",
        appId: "com.example.mobilechange",
        runId: "bad",
        command: "pnpm run proof:mobile-change-verification:live",
        successCriteria: [
          "The verification bundle verdict is mobile_change_verified.",
        ],
        boundaries: [
          "No APK build or install is required.",
        ],
      },
      markdown: "## Mobile change live Settings lane\n",
    }),
    /settings lane must target Android Settings/,
  );
});
