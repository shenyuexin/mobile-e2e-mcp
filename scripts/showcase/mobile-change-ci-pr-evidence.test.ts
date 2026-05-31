import assert from "node:assert/strict";
import test from "node:test";

test("CI/PR evidence keeps repo-owned no-device candidate neutral and blocked", async () => {
  const {
    buildMobileChangeCiPrEvidence,
    validateMobileChangeCiPrEvidence,
  } = await import("./mobile-change-ci-pr-evidence.ts");

  const evidence = buildMobileChangeCiPrEvidence({
    runId: "ci-pr-blocked",
    sources: [{
      kind: "repo_app_success_candidate",
      path: "docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json",
      verdict: "blocked_before_live_success",
      proofLevel: "blocked_before_live",
      successEvidencePromoted: false,
      blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
      nextAction: {
        kind: "connect_device_and_run_repo_app_live_proof",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Connect a device.",
      },
    }],
  });

  assert.equal(evidence.schema, "mobile-change-ci-pr-evidence/v1");
  assert.equal(evidence.reviewStatus, "blocked");
  assert.equal(evidence.ci.conclusion, "neutral");
  assert.equal(evidence.proofLevel, "blocked_before_live");
  assert.equal(evidence.prSummary.includes("blocked_before_live"), true);
  assert.equal(evidence.prSummary.includes("DEVICE_UNAVAILABLE"), true);
  assert.equal(validateMobileChangeCiPrEvidence(evidence).ok, true);
});

test("CI/PR evidence marks promoted live candidate as success only after intake-backed source", async () => {
  const {
    buildMobileChangeCiPrEvidence,
    validateMobileChangeCiPrEvidence,
  } = await import("./mobile-change-ci-pr-evidence.ts");

  const evidence = buildMobileChangeCiPrEvidence({
    runId: "ci-pr-success",
    sources: [{
      kind: "repo_app_success_candidate",
      path: "docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json",
      verdict: "repo_app_live_success_promoted",
      proofLevel: "physical_or_emulator_candidate",
      successEvidencePromoted: true,
      blockers: [],
      nextAction: {
        kind: "attach_repo_app_success_evidence",
        command: "pnpm run validate:mobile-change-repo-app-success-candidate",
        reason: "Attach evidence.",
      },
    }],
  });

  assert.equal(evidence.reviewStatus, "passed");
  assert.equal(evidence.ci.conclusion, "success");
  assert.equal(evidence.proofLevel, "physical_or_emulator_candidate");
  assert.equal(validateMobileChangeCiPrEvidence(evidence).ok, true);
});

test("CI/PR evidence validator rejects blocked proof mislabeled as success", async () => {
  const {
    buildMobileChangeCiPrEvidence,
    validateMobileChangeCiPrEvidence,
  } = await import("./mobile-change-ci-pr-evidence.ts");

  const evidence = buildMobileChangeCiPrEvidence({
    runId: "ci-pr-bad",
    sources: [{
      kind: "repo_app_success_candidate",
      path: "docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json",
      verdict: "blocked_before_live_success",
      proofLevel: "blocked_before_live",
      successEvidencePromoted: false,
      blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
      nextAction: {
        kind: "connect_device_and_run_repo_app_live_proof",
        command: "pnpm run verify:mobile-change -- --live",
        reason: "Connect a device.",
      },
    }],
  });

  assert.throws(
    () => validateMobileChangeCiPrEvidence({
      ...evidence,
      reviewStatus: "passed",
      ci: {
        ...evidence.ci,
        conclusion: "success",
      },
    }),
    /blocked evidence cannot have a success CI conclusion/,
  );
});
