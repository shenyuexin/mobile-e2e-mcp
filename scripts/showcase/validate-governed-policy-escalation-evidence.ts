import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PolicyEscalationEvidence {
  schema?: string;
  capturedAt?: string;
  sourceRunId?: string;
  sourceOutputDir?: string;
  executionMode?: string;
  platform?: string;
  runnerProfile?: string;
  appId?: string;
  sessions?: {
    readOnlyPolicyProfile?: string;
    interactivePolicyProfile?: string;
    readOnlySessionIdRedacted?: string;
    interactiveSessionIdRedacted?: string;
  };
  action?: {
    actionType?: string;
    targetAppId?: string;
    dryRun?: boolean;
  };
  verdict?: string;
  checks?: {
    deviceDetected?: boolean;
    dryRunDeviceSelected?: boolean;
    readOnlyDenied?: boolean;
    remediationAvailable?: boolean;
    interactiveSessionStarted?: boolean;
    interactiveRetryAllowed?: boolean;
    interactiveRetryExecuted?: boolean;
  };
  readOnlyDeniedStep?: {
    tool?: string;
    status?: string;
    reasonCode?: string;
  };
  interactiveRetryStep?: {
    tool?: string;
    status?: string;
    reasonCode?: string;
    lowLevelStatus?: string;
    lowLevelReasonCode?: string;
  };
  proofBoundaries?: string[];
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

export async function validateGovernedPolicyEscalationEvidence(): Promise<void> {
  const evidencePath = "docs/showcase/evidence/governed-policy-escalation-dry-run-2026-05-25/summary.json";
  const evidence = await readJson<PolicyEscalationEvidence>(evidencePath);

  assert.equal(evidence.schema, "governed-policy-escalation-evidence/v1");
  assert.equal(evidence.executionMode, "dry-run");
  assert.equal(evidence.platform, "android");
  assert.equal(evidence.runnerProfile, "native_android");
  assert.equal(evidence.appId, "com.android.settings");
  assert.equal(evidence.verdict, "policy_escalation_retry_dry_run_observed");

  assert.equal(evidence.sessions?.readOnlyPolicyProfile, "read-only");
  assert.equal(evidence.sessions?.interactivePolicyProfile, "interactive");
  assert.match(evidence.sessions?.readOnlySessionIdRedacted ?? "", /^policy-escalation-readonly-/);
  assert.match(evidence.sessions?.interactiveSessionIdRedacted ?? "", /^policy-escalation-interactive-/);

  assert.equal(evidence.action?.actionType, "launch_app");
  assert.equal(evidence.action?.targetAppId, evidence.appId);
  assert.equal(evidence.action?.dryRun, true);

  assert.equal(evidence.checks?.deviceDetected, false);
  assert.equal(evidence.checks?.dryRunDeviceSelected, true);
  assert.equal(evidence.checks?.readOnlyDenied, true);
  assert.equal(evidence.checks?.remediationAvailable, true);
  assert.equal(evidence.checks?.interactiveSessionStarted, true);
  assert.equal(evidence.checks?.interactiveRetryAllowed, true);
  assert.equal(evidence.checks?.interactiveRetryExecuted, true);

  assert.equal(evidence.readOnlyDeniedStep?.tool, "perform_action_with_evidence");
  assert.equal(evidence.readOnlyDeniedStep?.status, "failed");
  assert.equal(evidence.readOnlyDeniedStep?.reasonCode, "POLICY_DENIED");

  assert.equal(evidence.interactiveRetryStep?.tool, "perform_action_with_evidence");
  assert.notEqual(evidence.interactiveRetryStep?.reasonCode, "POLICY_DENIED");
  assert.notEqual(evidence.interactiveRetryStep?.lowLevelReasonCode, "POLICY_DENIED");
  assert.ok(["success", "passed"].includes(evidence.interactiveRetryStep?.status ?? ""));
  assert.ok(["success", "passed"].includes(evidence.interactiveRetryStep?.lowLevelStatus ?? ""));

  assert.ok(evidence.proofBoundaries?.some((boundary) => boundary.includes("does not prove arbitrary action approval")));
  assert.ok(evidence.proofBoundaries?.some((boundary) => boundary.includes("does not bypass policy")));
  assert.ok(evidence.proofBoundaries?.some((boundary) => boundary.includes("does not replace live-device evidence")));
}

validateGovernedPolicyEscalationEvidence().then(() => {
  console.log("Governed policy escalation evidence validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
