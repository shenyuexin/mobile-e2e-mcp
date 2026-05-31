import assert from "node:assert/strict";
import test from "node:test";

test("repo-owned app candidate records APK and contract readiness without promoting no-device output", async () => {
  const {
    buildRepoOwnedAppSuccessCandidate,
    validateRepoOwnedAppSuccessCandidate,
  } = await import("./mobile-change-repo-app-success-candidate.ts");
  const { buildMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  const contract = buildMobileChangeReadinessContract({
    platform: "android",
    appId: "com.epam.mobitru",
    appArtifact: "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk",
    runnerProfile: "native_android",
    policyProfile: "interactive",
    readiness: {
      screenId: "login",
      appPhase: "authentication",
      selector: {
        strategy: "resource_id",
        value: "com.epam.mobitru:id/login_signin",
      },
    },
  });

  const candidate = await buildRepoOwnedAppSuccessCandidate({
    runId: "repo-app-no-device",
    contract,
    verification: {
      verdict: "blocked",
      proofLevel: "blocked_before_live",
      blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No Android devices were visible." }],
      evidence: { readiness: "docs/showcase/evidence/mobile-change-device-readiness" },
    },
  });

  assert.equal(candidate.schema, "mobile-change-repo-app-success-candidate/v1");
  assert.equal(candidate.repoApp.appId, "com.epam.mobitru");
  assert.equal(candidate.repoApp.artifact.exists, true);
  assert.equal(candidate.contract.strongProofReady, true);
  assert.equal(candidate.verdict, "blocked_before_live_success");
  assert.equal(candidate.successEvidencePromoted, false);
  assert.deepEqual(candidate.blockers.map((blocker) => blocker.reasonCode), ["DEVICE_UNAVAILABLE"]);
  assert.equal(validateRepoOwnedAppSuccessCandidate(candidate).promotable, false);
});

test("repo-owned app candidate rejects success promotion without accepted intake", async () => {
  const {
    buildRepoOwnedAppSuccessCandidate,
    validateRepoOwnedAppSuccessCandidate,
  } = await import("./mobile-change-repo-app-success-candidate.ts");
  const { buildMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  const contract = buildMobileChangeReadinessContract({
    platform: "android",
    appId: "com.epam.mobitru",
    appArtifact: "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk",
    runnerProfile: "native_android",
    policyProfile: "interactive",
    readiness: {
      appPhase: "authentication",
    },
  });

  const candidate = await buildRepoOwnedAppSuccessCandidate({
    runId: "repo-app-false-success",
    contract,
    verification: {
      verdict: "completed",
      proofLevel: "physical_or_emulator_candidate",
      blockers: [],
      evidence: {
        verification: "output/showcase/mobile-change-verification-live/repo-app-false-success",
      },
    },
  });

  assert.equal(candidate.verdict, "live_success_pending_intake");
  assert.throws(
    () => validateRepoOwnedAppSuccessCandidate({
      ...candidate,
      verdict: "repo_app_live_success_promoted",
      successEvidencePromoted: true,
      intake: {
        verdict: "not_promotable_live_proof",
        proofLevel: "no_device_or_controlled_output",
      },
    }),
    /promoted repo app success requires promotable intake/,
  );
});
