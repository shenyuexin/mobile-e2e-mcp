import assert from "node:assert/strict";
import test from "node:test";

test("device readiness validator accepts blocked no-device preflight evidence", async () => {
  const { validateMobileChangeDeviceReadinessShape } = await import("./validate-mobile-change-device-readiness.ts");

  assert.doesNotThrow(() => validateMobileChangeDeviceReadinessShape({
    summary: {
      schema: "mobile-change-device-readiness/v1",
      verdict: "blocked_before_live_verification",
      platform: "android",
      appId: "com.example.mobilechange",
      checks: [
        { id: "device-inventory", status: "blocked", reasonCode: "DEVICE_UNAVAILABLE" },
        { id: "readiness-contract", status: "passed", reasonCode: "OK" },
      ],
      blockers: [
        { id: "device-inventory", status: "blocked", reasonCode: "DEVICE_UNAVAILABLE" },
      ],
      nextAction: {
        kind: "connect_device_or_use_self_hosted_runner",
      },
      boundaries: [
        "This preflight only proves local readiness to attempt live verification; it does not claim physical-device proof by itself.",
      ],
    },
    reportMarkdown: "## Mobile change device readiness\nVerdict: `blocked_before_live_verification`\n",
  }));
});

test("device readiness validator rejects ready verdicts with blockers", async () => {
  const { validateMobileChangeDeviceReadinessShape } = await import("./validate-mobile-change-device-readiness.ts");

  assert.throws(
    () => validateMobileChangeDeviceReadinessShape({
      summary: {
        schema: "mobile-change-device-readiness/v1",
        verdict: "ready_for_live_mobile_change_verification",
        platform: "android",
        appId: "com.example.mobilechange",
        checks: [
          { id: "device-inventory", status: "blocked", reasonCode: "DEVICE_UNAVAILABLE" },
          { id: "readiness-contract", status: "passed", reasonCode: "OK" },
        ],
        blockers: [
          { id: "device-inventory", status: "blocked", reasonCode: "DEVICE_UNAVAILABLE" },
        ],
        nextAction: {
          kind: "run_live_mobile_change_verification",
        },
        boundaries: [
          "This preflight only proves local readiness to attempt live verification; it does not claim physical-device proof by itself.",
        ],
      },
      reportMarkdown: "## Mobile change device readiness\n",
    }),
    /ready preflight must not include blockers/,
  );
});
