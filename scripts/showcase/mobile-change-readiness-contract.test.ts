import assert from "node:assert/strict";
import test from "node:test";

test("readiness contract scaffold creates a deterministic Android contract", async () => {
  const { buildMobileChangeReadinessContract, validateMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  const contract = buildMobileChangeReadinessContract({
    platform: "android",
    appId: "com.example.mobilechange",
    runnerProfile: "native_android",
    policyProfile: "interactive",
    readiness: {
      appPhase: "authentication",
      screenId: "login",
    },
  });

  assert.equal(contract.schema, "mobile-change-readiness-contract/v1");
  assert.equal(contract.appId, "com.example.mobilechange");
  assert.equal(contract.readiness.proofLevel, "deterministic");
  assert.equal(validateMobileChangeReadinessContract(contract).strongProofReady, true);
});

test("readiness contract validator rejects missing app id", async () => {
  const { validateMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  assert.throws(
    () => validateMobileChangeReadinessContract({
      schema: "mobile-change-readiness-contract/v1",
      platform: "android",
      appId: "",
      runnerProfile: "native_android",
      policyProfile: "interactive",
      deterministicEntry: { kind: "launch_app" },
      reset: { kind: "none" },
      readiness: { proofLevel: "deterministic", appPhase: "authentication" },
    }),
    /appId must be provided/,
  );
});

test("readiness contract validator rejects deterministic contracts without ready-state signal", async () => {
  const { validateMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  assert.throws(
    () => validateMobileChangeReadinessContract({
      schema: "mobile-change-readiness-contract/v1",
      platform: "android",
      appId: "com.example.mobilechange",
      runnerProfile: "native_android",
      policyProfile: "interactive",
      deterministicEntry: { kind: "launch_app" },
      reset: { kind: "none" },
      readiness: { proofLevel: "deterministic" },
    }),
    /deterministic readiness requires/,
  );
});

test("visual-only readiness contract remains weak proof", async () => {
  const { validateMobileChangeReadinessContract } = await import("./mobile-change-readiness-contract.ts");

  const result = validateMobileChangeReadinessContract({
    schema: "mobile-change-readiness-contract/v1",
    platform: "android",
    appId: "com.example.mobilechange",
    runnerProfile: "native_android",
    policyProfile: "interactive",
    deterministicEntry: { kind: "launch_app" },
    reset: { kind: "none" },
    readiness: {
      proofLevel: "visual_only",
      visualHint: "Login screen is visible",
    },
  });

  assert.equal(result.strongProofReady, false);
  assert.deepEqual(result.warnings, ["visual_only_readiness_cannot_promote_strong_proof"]);
});
