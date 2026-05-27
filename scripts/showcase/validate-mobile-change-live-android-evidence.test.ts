import assert from "node:assert/strict";
import test from "node:test";

test("live android evidence validator accepts a real-device app-readiness failure", async () => {
  const { validateMobileChangeLiveAndroidEvidenceShape } = await import("./validate-mobile-change-live-android-evidence.ts");

  assert.doesNotThrow(() => validateMobileChangeLiveAndroidEvidenceShape({
    summary: {
      schema: "mobile-change-verification/v1",
      source: "live_device",
      verdict: "mobile_change_verification_failed",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        matched: false,
        expectedAppPhase: "authentication",
      },
      workflow: {
        stepIds: ["discover-device", "describe-capabilities", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"],
        steps: [
          { id: "discover-device", status: "success", reasonCode: "OK" },
          { id: "start-session", status: "success", reasonCode: "OK" },
          { id: "launch-app", status: "failed", reasonCode: "ADAPTER_ERROR" },
          { id: "inspect-readiness", status: "success", reasonCode: "OK" },
          { id: "check-readiness", status: "failed", reasonCode: "APP_NOT_READY" },
        ],
      },
      evidence: {
        artifacts: [
          { kind: "ui_tree", path: "docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/inspect-ui.xml" },
          { kind: "failure_packet", path: "docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json" },
        ],
      },
    },
    failurePacket: {
      schema: "mobile-verification-failure-packet/v1",
      source: "live_device",
      category: "app_readiness",
      reasonCode: "ADAPTER_ERROR",
      failedStep: {
        id: "launch-app",
        reasonCode: "ADAPTER_ERROR",
      },
      evidence: {
        signals: {
          deviceUnavailable: false,
          appNotReady: true,
        },
      },
      nextAction: {
        kind: "wait_or_fix_readiness_contract",
      },
    },
    reportMarkdown: "## Mobile change verification\nVerdict: `mobile_change_verification_failed`\n",
    failureMarkdown: "## Mobile verification failure packet\nCategory: `app_readiness`\n",
    inspectUiXml: "<hierarchy></hierarchy>",
  }));
});

test("live android evidence validator rejects no-device summaries", async () => {
  const { validateMobileChangeLiveAndroidEvidenceShape } = await import("./validate-mobile-change-live-android-evidence.ts");

  assert.throws(
    () => validateMobileChangeLiveAndroidEvidenceShape({
      summary: {
        schema: "mobile-change-verification/v1",
        source: "live_device",
        verdict: "device_unavailable",
        validationSurface: {
          platform: "android",
          appId: "com.example.mobilechange",
          policyProfile: "interactive",
        },
        readiness: {
          matched: false,
        },
        workflow: {
          stepIds: ["discover-device"],
          steps: [
            { id: "discover-device", status: "failed", reasonCode: "DEVICE_UNAVAILABLE" },
          ],
        },
        evidence: {
          artifacts: [],
        },
      },
      failurePacket: {
        schema: "mobile-verification-failure-packet/v1",
        source: "live_device",
        category: "environment",
        reasonCode: "DEVICE_UNAVAILABLE",
        failedStep: {
          id: "discover-device",
          reasonCode: "DEVICE_UNAVAILABLE",
        },
        evidence: {
          signals: {
            deviceUnavailable: true,
          },
        },
        nextAction: {
          kind: "connect_device_or_use_fixture",
        },
      },
      reportMarkdown: "## Mobile change verification\n",
      failureMarkdown: "## Mobile verification failure packet\n",
      inspectUiXml: "",
    }),
    /live Android evidence must not be a no-device proof/,
  );
});
