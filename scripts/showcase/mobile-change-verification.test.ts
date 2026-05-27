import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("mobile change verification bundle captures workflow steps and PR-ready next action", async () => {
  const { buildMobileChangeVerificationBundle, renderMobileChangeVerificationMarkdown } = await import("./mobile-change-verification.ts");

  const bundle = buildMobileChangeVerificationBundle({
    runId: "fixture-2026-05-27",
    source: "fixture",
    platform: "android",
    appId: "com.example.mobilechange",
    appArtifact: "examples/rn-login-demo/android/app/build/outputs/apk/debug/app-debug.apk",
    policyProfile: "interactive",
    expectedReadiness: {
      screenId: "login",
      appPhase: "authentication",
    },
    steps: [
      { id: "discover-device", tool: "list_devices", status: "success", reasonCode: "OK" },
      { id: "start-session", tool: "start_session", status: "success", reasonCode: "OK" },
      { id: "launch-app", tool: "launch_app", status: "success", reasonCode: "OK" },
      { id: "inspect-readiness", tool: "inspect_ui", status: "success", reasonCode: "OK" },
      { id: "close-session", tool: "end_session", status: "success", reasonCode: "OK" },
    ],
    artifacts: [
      { kind: "ui_tree", path: "output/showcase/mobile-change-verification/fixture/ui-tree.json" },
      { kind: "screenshot", path: "output/showcase/mobile-change-verification/fixture/screenshot.png" },
    ],
  });

  assert.equal(bundle.schema, "mobile-change-verification/v1");
  assert.equal(bundle.verdict, "mobile_change_verified");
  assert.equal(bundle.nextAction.kind, "attach_to_pr");
  assert.deepEqual(bundle.workflow.stepIds, [
    "discover-device",
    "start-session",
    "launch-app",
    "inspect-readiness",
    "close-session",
  ]);
  assert.equal(bundle.readiness.matched, true);

  const markdown = renderMobileChangeVerificationMarkdown(bundle);
  assert.match(markdown, /## Mobile change verification/);
  assert.match(markdown, /Verdict: `mobile_change_verified`/);
  assert.match(markdown, /Validation surface:/);
  assert.match(markdown, /Next action:/);
});

test("failure packet normalizes failure category, evidence, and remediation", async () => {
  const { buildFailurePacket, renderFailurePacketMarkdown } = await import("./mobile-change-verification.ts");

  const packet = buildFailurePacket({
    runId: "failure-fixture-2026-05-27",
    source: "fixture",
    failedStep: {
      id: "tap-login",
      tool: "tap_element",
      status: "failed",
      reasonCode: "NO_MATCH",
    },
    signals: {
      policyDenied: false,
      appNotReady: false,
      networkPolicyFailure: false,
      selectorNoMatch: true,
    },
    artifacts: [
      { kind: "ui_tree", path: "output/showcase/mobile-change-verification/failure/ui-tree.json" },
    ],
  });

  assert.equal(packet.schema, "mobile-verification-failure-packet/v1");
  assert.equal(packet.category, "ui_target");
  assert.equal(packet.confidence, "high");
  assert.equal(packet.nextAction.kind, "refine_selector_or_wait_for_ui");
  assert.equal(packet.evidence.artifacts[0]?.kind, "ui_tree");

  const markdown = renderFailurePacketMarkdown(packet);
  assert.match(markdown, /## Mobile verification failure packet/);
  assert.match(markdown, /Category: `ui_target`/);
  assert.match(markdown, /Next action:/);
});

test("realistic evidence index requires at least two app-oriented scenarios and one failure packet", async () => {
  const { buildRealisticEvidenceIndex } = await import("./mobile-change-verification.ts");

  const index = buildRealisticEvidenceIndex({
    scenarios: [
      {
        id: "rn-login-readiness",
        surface: "react_native_android",
        painPoint: "launch_readiness_regression",
        evidencePath: "docs/showcase/evidence/mobile-change-verification-fixture/summary.json",
        verdict: "mobile_change_verified",
      },
      {
        id: "network-policy-failure",
        surface: "native_android",
        painPoint: "network_policy_failure",
        evidencePath: "docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json",
        verdict: "failure_packet_actionable",
        failurePacketPath: "docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json",
      },
    ],
  });

  assert.equal(index.schema, "realistic-mobile-evidence-breadth/v1");
  assert.equal(index.scenarioCount, 2);
  assert.equal(index.failurePacketCount, 1);
  assert.equal(index.verdict, "realistic_workflow_evidence_available");
});

test("mobile change verification module can be imported without writing or logging", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "await import('./scripts/showcase/mobile-change-verification.ts')",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("validator module rejects malformed evidence shape", async () => {
  const { validateMobileChangeVerificationEvidenceShape } = await import("./validate-mobile-change-verification-evidence.ts");

  assert.throws(
    () => validateMobileChangeVerificationEvidenceShape({
      bundle: {
        schema: "mobile-change-verification/v1",
        verdict: "mobile_change_verified",
        source: "fixture",
        validationSurface: {
          platform: "android",
          appId: "com.example.mobilechange",
          policyProfile: "interactive",
        },
        readiness: {
          matched: true,
        },
        workflow: { stepIds: [] },
      },
      failurePacket: {
        schema: "mobile-verification-failure-packet/v1",
        category: "network",
        nextAction: { kind: "inspect_network_policy" },
      },
      scenarioIndex: {
        schema: "realistic-mobile-evidence-breadth/v1",
        scenarioCount: 1,
        failurePacketCount: 0,
      },
      reportMarkdown: "## Mobile change verification\n",
      failureMarkdown: "## Mobile verification failure packet\n",
      scenarioMarkdown: "## Realistic mobile evidence breadth\n",
    }),
    /workflow must include at least five governed verification steps/,
  );
});

test("live runner maps successful governed tool calls into a verification bundle", async () => {
  const { runLiveMobileChangeVerificationWorkflow } = await import("./mobile-change-verification.ts");
  const invokedTools: string[] = [];
  const invoker = async (tool: string): Promise<unknown> => {
    invokedTools.push(tool);
    if (tool === "list_devices") {
      return { status: "success", reasonCode: "OK", data: { android: [{ id: "emulator-5554", available: true }] } };
    }
    if (tool === "inspect_ui") {
      return {
        status: "success",
        reasonCode: "OK",
        data: {
          outputPath: "output/showcase/mobile-change-verification-live/live-inspect-ui.xml",
          summary: { totalNodes: 42, clickableNodes: 8 },
        },
        artifacts: ["output/showcase/mobile-change-verification-live/live-inspect-ui.xml"],
      };
    }
    if (tool === "get_screen_summary") {
      return {
        status: "success",
        reasonCode: "OK",
        data: {
          screenSummary: {
            appPhase: "authentication",
            readiness: "ready",
            stateConfidence: 0.8,
          },
        },
      };
    }
    return { status: "success", reasonCode: "OK" };
  };

  const result = await runLiveMobileChangeVerificationWorkflow({
    runId: "live-success-fixture",
    platform: "android",
    appId: "com.example.live",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
    skipInstall: true,
  }, invoker);

  assert.equal(result.bundle.source, "live_device");
  assert.equal(result.bundle.verdict, "mobile_change_verified");
  assert.equal(result.bundle.readiness.matched, true);
  assert.equal(result.failurePacket, undefined);
  assert.deepEqual(invokedTools, [
    "list_devices",
    "describe_capabilities",
    "start_session",
    "launch_app",
    "inspect_ui",
    "get_screen_summary",
    "end_session",
  ]);
});

test("live runner produces structured device-unavailable output without throwing", async () => {
  const { runLiveMobileChangeVerificationWorkflow } = await import("./mobile-change-verification.ts");
  const result = await runLiveMobileChangeVerificationWorkflow({
    runId: "live-no-device-fixture",
    platform: "android",
    appId: "com.example.live",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      appPhase: "authentication",
    },
  }, async () => ({ status: "success", reasonCode: "OK", data: { android: [] } }));

  assert.equal(result.bundle.verdict, "device_unavailable");
  assert.equal(result.bundle.nextAction.kind, "inspect_failure_packet");
  assert.equal(result.failurePacket?.category, "environment");
  assert.equal(result.failurePacket?.nextAction.kind, "connect_device_or_use_fixture");
});

test("controlled readiness failure proof is produced through the live runner path", async () => {
  const { buildControlledReadinessFailureProof } = await import("./mobile-change-verification.ts");

  const proof = await buildControlledReadinessFailureProof();

  assert.equal(proof.bundle.source, "live_device");
  assert.equal(proof.bundle.verdict, "mobile_change_verification_failed");
  assert.equal(proof.bundle.readiness.matched, false);
  assert.equal(proof.failurePacket?.category, "app_readiness");
  assert.equal(proof.failurePacket?.reasonCode, "APP_NOT_READY");
  assert.equal(proof.failurePacket?.nextAction.kind, "wait_or_fix_readiness_contract");
});

test("readiness failure validator rejects non-readiness packets", async () => {
  const { validateMobileChangeReadinessFailureShape } = await import("./validate-mobile-change-readiness-failure.ts");

  assert.throws(
    () => validateMobileChangeReadinessFailureShape({
      summary: {
        schema: "mobile-change-verification/v1",
        source: "live_device",
        verdict: "mobile_change_verification_failed",
        readiness: { matched: false, expectedAppPhase: "authentication" },
        workflow: {
          stepIds: ["check-readiness"],
          steps: [{ id: "check-readiness", status: "failed", reasonCode: "APP_NOT_READY" }],
        },
        evidence: {
          artifacts: [{ kind: "failure_packet", path: "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json" }],
        },
      },
      failurePacket: {
        schema: "mobile-verification-failure-packet/v1",
        source: "live_device",
        category: "network",
        reasonCode: "NETWORK_POLICY_BLOCKED",
      },
      reportMarkdown: "## Mobile change verification\n",
      failureMarkdown: "## Mobile verification failure packet\n",
    }),
    /failure packet must classify app readiness/,
  );
});
