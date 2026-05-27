import assert from "node:assert/strict";
import test from "node:test";

test("live proof intake accepts a successful live-device verification candidate", async () => {
  const { buildMobileChangeLiveProofIntake, renderMobileChangeLiveProofIntakeMarkdown } = await import("./generate-mobile-change-live-proof-intake.ts");

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir: "output/showcase/mobile-change-verification-live/2026-05-27T14-00-00",
    summary: {
      schema: "mobile-change-verification/v1",
      runId: "live-success-2026-05-27",
      source: "live_device",
      verdict: "mobile_change_verified",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        expectedAppPhase: "authentication",
        matched: true,
      },
      workflow: {
        stepIds: ["discover-device", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"],
        steps: [
          { id: "discover-device", status: "success", reasonCode: "OK" },
          { id: "start-session", status: "success", reasonCode: "OK" },
          { id: "launch-app", status: "success", reasonCode: "OK" },
          { id: "inspect-readiness", status: "success", reasonCode: "OK" },
          { id: "check-readiness", status: "success", reasonCode: "OK" },
          { id: "close-session", status: "success", reasonCode: "OK" },
        ],
      },
      evidence: {
        artifacts: [
          { kind: "summary", path: "output/showcase/mobile-change-verification-live/2026-05-27T14-00-00/summary.json" },
          { kind: "report", path: "output/showcase/mobile-change-verification-live/2026-05-27T14-00-00/report.md" },
          { kind: "ui_tree", path: "output/showcase/mobile-change-verification-live/2026-05-27T14-00-00/inspect-ui.xml" },
        ],
      },
    },
  });

  assert.equal(intake.schema, "mobile-change-live-proof-intake/v1");
  assert.equal(intake.verdict, "promotable_live_proof_candidate");
  assert.equal(intake.proofLevel, "physical_or_emulator_candidate");
  assert.equal(intake.blockers.length, 0);
  assert.equal(intake.nextAction.kind, "promote_live_evidence");
  assert.match(intake.nextAction.command, /docs\/showcase\/evidence\/mobile-change-live/);

  const markdown = renderMobileChangeLiveProofIntakeMarkdown(intake);
  assert.match(markdown, /## Mobile change live proof intake/);
  assert.match(markdown, /Verdict: `promotable_live_proof_candidate`/);
  assert.match(markdown, /Proof level: `physical_or_emulator_candidate`/);
});

test("live proof intake rejects no-device live runner output", async () => {
  const { buildMobileChangeLiveProofIntake } = await import("./generate-mobile-change-live-proof-intake.ts");

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir: "output/showcase/mobile-change-verification-live/no-device",
    summary: {
      schema: "mobile-change-verification/v1",
      runId: "live-no-device-2026-05-27",
      source: "live_device",
      verdict: "device_unavailable",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        expectedAppPhase: "authentication",
        matched: false,
      },
      workflow: {
        stepIds: ["discover-device"],
        steps: [
          { id: "discover-device", status: "failed", reasonCode: "DEVICE_UNAVAILABLE" },
        ],
      },
      evidence: {
        artifacts: [
          { kind: "summary", path: "output/showcase/mobile-change-verification-live/no-device/summary.json" },
        ],
      },
    },
    failurePacket: {
      schema: "mobile-verification-failure-packet/v1",
      category: "environment",
      reasonCode: "DEVICE_UNAVAILABLE",
      nextAction: {
        kind: "connect_device_or_use_fixture",
      },
    },
  });

  assert.equal(intake.verdict, "not_promotable_live_proof");
  assert.equal(intake.proofLevel, "no_device_or_controlled_output");
  assert.equal(intake.blockers[0]?.reasonCode, "DEVICE_UNAVAILABLE");
  assert.equal(intake.nextAction.kind, "run_on_connected_device_or_self_hosted_runner");
});

test("live proof intake rejects fixture summaries before promotion", async () => {
  const { buildMobileChangeLiveProofIntake } = await import("./generate-mobile-change-live-proof-intake.ts");

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir: "docs/showcase/evidence/mobile-change-verification-fixture",
    summary: {
      schema: "mobile-change-verification/v1",
      runId: "fixture",
      source: "fixture",
      verdict: "mobile_change_verified",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        matched: true,
      },
      workflow: {
        stepIds: ["discover-device", "start-session", "launch-app", "inspect-readiness", "close-session"],
        steps: [],
      },
      evidence: {
        artifacts: [],
      },
    },
  });

  assert.equal(intake.verdict, "not_promotable_live_proof");
  assert.equal(intake.blockers[0]?.reasonCode, "NOT_LIVE_DEVICE_SOURCE");
});

test("live proof intake rejects known controlled live-runner output before promotion", async () => {
  const { buildMobileChangeLiveProofIntake } = await import("./generate-mobile-change-live-proof-intake.ts");

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir: "docs/showcase/evidence/mobile-change-readiness-failure",
    summary: {
      schema: "mobile-change-verification/v1",
      runId: "controlled-readiness",
      source: "live_device",
      verdict: "mobile_change_verification_failed",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        expectedAppPhase: "authentication",
        matched: false,
      },
      workflow: {
        stepIds: ["discover-device", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"],
        steps: [
          { id: "check-readiness", status: "failed", reasonCode: "APP_NOT_READY" },
        ],
      },
      evidence: {
        artifacts: [],
      },
    },
  });

  assert.equal(intake.verdict, "not_promotable_live_proof");
  assert.equal(intake.proofLevel, "no_device_or_controlled_output");
  assert.equal(intake.blockers[0]?.reasonCode, "CONTROLLED_OUTPUT");
});

test("live proof intake does not reject promotable output because of generic live-runner boundaries", async () => {
  const { buildMobileChangeLiveProofIntake } = await import("./generate-mobile-change-live-proof-intake.ts");

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir: "output/showcase/mobile-change-verification-live/real-device-success",
    summary: {
      schema: "mobile-change-verification/v1",
      runId: "real-device-success",
      source: "live_device",
      verdict: "mobile_change_verified",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        expectedAppPhase: "authentication",
        matched: true,
      },
      workflow: {
        stepIds: ["discover-device", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"],
        steps: [],
      },
      evidence: {
        artifacts: [],
      },
      boundaries: [
        "Forced or controlled live-runner modes prove failure shaping and evidence structure, not physical-device fidelity.",
      ],
    },
  });

  assert.equal(intake.verdict, "promotable_live_proof_candidate");
  assert.equal(intake.blockers.length, 0);
});
