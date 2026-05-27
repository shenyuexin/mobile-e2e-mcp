import assert from "node:assert/strict";
import test from "node:test";

test("live proof intake validator accepts controlled-output blocker evidence", async () => {
  const { validateMobileChangeLiveProofIntakeShape } = await import("./validate-mobile-change-live-proof-intake.ts");

  assert.doesNotThrow(() => validateMobileChangeLiveProofIntakeShape({
    intake: {
      schema: "mobile-change-live-proof-intake/v1",
      verdict: "not_promotable_live_proof",
      proofLevel: "no_device_or_controlled_output",
      source: "live_device",
      verificationVerdict: "mobile_change_verification_failed",
      surface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      blockers: [
        { reasonCode: "CONTROLLED_OUTPUT" },
      ],
      nextAction: {
        kind: "inspect_live_proof_output",
      },
      boundaries: [
        "Only live_device summaries without no-device blockers can be treated as promotable live proof candidates.",
      ],
    },
    markdown: "## Mobile change live proof intake\nVerdict: `not_promotable_live_proof`\nCONTROLLED_OUTPUT\n",
  }));
});

test("live proof intake validator rejects promotable evidence with blockers", async () => {
  const { validateMobileChangeLiveProofIntakeShape } = await import("./validate-mobile-change-live-proof-intake.ts");

  assert.throws(
    () => validateMobileChangeLiveProofIntakeShape({
      intake: {
        schema: "mobile-change-live-proof-intake/v1",
        verdict: "promotable_live_proof_candidate",
        proofLevel: "physical_or_emulator_candidate",
        source: "live_device",
        verificationVerdict: "mobile_change_verified",
        surface: {
          platform: "android",
          appId: "com.example.mobilechange",
          policyProfile: "interactive",
        },
        blockers: [
          { reasonCode: "CONTROLLED_OUTPUT" },
        ],
        nextAction: {
          kind: "promote_live_evidence",
        },
        boundaries: [
          "Only live_device summaries without no-device blockers can be treated as promotable live proof candidates.",
        ],
      },
      markdown: "## Mobile change live proof intake\nVerdict: `promotable_live_proof_candidate`\n",
    }),
    /promotable intake must not include blockers/,
  );
});
