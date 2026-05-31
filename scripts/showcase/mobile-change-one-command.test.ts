import assert from "node:assert/strict";
import test from "node:test";

test("one-command fixture run produces a compact completed verdict", async () => {
  const { runMobileChangeOneCommand } = await import("./mobile-change-one-command.ts");

  const result = await runMobileChangeOneCommand({
    mode: "fixture",
    runId: "one-command-fixture",
  }, {
    runFixtureVerification: async () => ({
      outputDir: "docs/showcase/evidence/mobile-change-verification-fixture",
      bundle: {
        runId: "one-command-fixture",
        source: "fixture",
        verdict: "mobile_change_verified",
        nextAction: { kind: "attach_to_pr", command: "pnpm run validate:mobile-change-verification", reason: "Attach evidence." },
      },
    }),
    buildHandoff: async () => ({
      path: "output/showcase/mobile-change-one-command/one-command-fixture/handoff.md",
      nextCommand: "pnpm run validate:mobile-change-verification",
    }),
  });

  assert.equal(result.schema, "mobile-change-one-command/v1");
  assert.equal(result.verdict, "completed");
  assert.equal(result.proofLevel, "fixture_contract");
  assert.equal(result.stages.map((stage) => stage.id).join(","), "verify,handoff");
  assert.equal(result.evidence.verification, "docs/showcase/evidence/mobile-change-verification-fixture");
  assert.equal(result.nextAction.command, "pnpm run validate:mobile-change-verification");
});

test("one-command live run stops before verification when readiness is blocked", async () => {
  const { runMobileChangeOneCommand } = await import("./mobile-change-one-command.ts");

  let verificationAttempted = false;
  const result = await runMobileChangeOneCommand({
    mode: "live",
    runId: "one-command-no-device",
  }, {
    runReadiness: async () => ({
      verdict: "blocked_before_live_verification",
      blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
      nextAction: {
        kind: "connect_device_or_use_self_hosted_runner",
        command: "pnpm run verify:mobile-change -- --live --allow-blocked",
        reason: "Connect a device.",
      },
    }),
    runLiveVerification: async () => {
      verificationAttempted = true;
      throw new Error("verification should not run when readiness blocks");
    },
  });

  assert.equal(verificationAttempted, false);
  assert.equal(result.verdict, "blocked");
  assert.equal(result.proofLevel, "blocked_before_live");
  assert.deepEqual(result.blockers.map((blocker) => blocker.reasonCode), ["DEVICE_UNAVAILABLE"]);
  assert.equal(result.stages.at(-1)?.id, "readiness");
});

test("one-command live run rejects proof promotion when intake rejects output", async () => {
  const { runMobileChangeOneCommand } = await import("./mobile-change-one-command.ts");

  const result = await runMobileChangeOneCommand({
    mode: "live",
    runId: "one-command-intake-rejected",
  }, {
    runReadiness: async () => ({
      verdict: "ready_for_live_mobile_change_verification",
      blockers: [],
      nextAction: { kind: "run_live_mobile_change_verification", command: "pnpm run proof:mobile-change-verification:live", reason: "Run live proof." },
    }),
    runLiveVerification: async () => ({
      outputDir: "output/showcase/mobile-change-verification-live/one-command-intake-rejected",
      bundle: {
        runId: "one-command-intake-rejected",
        source: "live_device",
        verdict: "mobile_change_verified",
        nextAction: { kind: "attach_to_pr", command: "pnpm run validate:mobile-change-verification", reason: "Attach evidence." },
      },
    }),
    runIntake: async () => ({
      verdict: "not_promotable_live_proof",
      proofLevel: "no_device_or_controlled_output",
      blockers: [{ reasonCode: "REQUIRED_STEP_MISSING", detail: "Missing launch-app." }],
      nextAction: { kind: "inspect_live_proof_output", command: "pnpm run intake:mobile-change-live-proof -- <live-output-dir>", reason: "Inspect output." },
    }),
    buildHandoff: async () => ({
      path: "output/showcase/mobile-change-one-command/one-command-intake-rejected/handoff.md",
      nextCommand: "pnpm run intake:mobile-change-live-proof -- <live-output-dir>",
    }),
  });

  assert.equal(result.verdict, "intake_rejected");
  assert.equal(result.proofLevel, "no_device_or_controlled_output");
  assert.deepEqual(result.blockers.map((blocker) => blocker.reasonCode), ["REQUIRED_STEP_MISSING"]);
  assert.equal(result.nextAction.kind, "inspect_live_proof_output");
});

test("one-command live success keeps intake and handoff evidence paths", async () => {
  const { runMobileChangeOneCommand } = await import("./mobile-change-one-command.ts");

  const result = await runMobileChangeOneCommand({
    mode: "live",
    runId: "one-command-success",
  }, {
    runReadiness: async () => ({
      verdict: "ready_for_live_mobile_change_verification",
      blockers: [],
      nextAction: { kind: "run_live_mobile_change_verification", command: "pnpm run proof:mobile-change-verification:live", reason: "Run live proof." },
    }),
    runLiveVerification: async () => ({
      outputDir: "output/showcase/mobile-change-verification-live/one-command-success",
      bundle: {
        runId: "one-command-success",
        source: "live_device",
        verdict: "mobile_change_verified",
        nextAction: { kind: "attach_to_pr", command: "pnpm run validate:mobile-change-verification", reason: "Attach evidence." },
      },
    }),
    runIntake: async () => ({
      verdict: "promotable_live_proof_candidate",
      proofLevel: "physical_or_emulator_candidate",
      blockers: [],
      nextAction: { kind: "promote_live_evidence", command: "cp -R <live-output-dir> docs/showcase/evidence/mobile-change-live/", reason: "Promote evidence." },
    }),
    buildHandoff: async () => ({
      path: "output/showcase/mobile-change-one-command/one-command-success/handoff.md",
      nextCommand: "cp -R <live-output-dir> docs/showcase/evidence/mobile-change-live/",
    }),
  });

  assert.equal(result.verdict, "completed");
  assert.equal(result.proofLevel, "physical_or_emulator_candidate");
  assert.equal(result.evidence.verification, "output/showcase/mobile-change-verification-live/one-command-success");
  assert.equal(result.evidence.handoff, "output/showcase/mobile-change-one-command/one-command-success/handoff.md");
  assert.equal(result.nextAction.kind, "promote_live_evidence");
});
