import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface GovernedBusinessAppEvidence {
  schema: string;
  verdict: string;
  platform: string;
  appId: string;
  device?: {
    deviceIdRedacted?: string;
  };
  sessions?: {
    setupPolicyProfile?: string;
    readOnlyPolicyProfile?: string;
  };
  checks?: {
    deviceDetected?: boolean;
    appArtifactAvailable?: boolean;
    setupSessionStarted?: boolean;
    setupLaunched?: boolean;
    readOnlySessionStarted?: boolean;
    inspectedScreen?: boolean;
    policyDenied?: boolean;
    remediationAvailable?: boolean;
  };
  setup?: {
    launchApp?: {
      status?: string;
      reasonCode?: string;
    };
  };
  inspectUi?: {
    status?: string;
    reasonCode?: string;
    totalNodes?: number;
    clickableNodes?: number;
  };
  screenSummary?: {
    appPhase?: string;
  };
  policyDeniedStep?: {
    status?: string;
    reasonCode?: string;
    attemptedText?: string;
  };
  remediationStep?: {
    status?: string;
    reasonCode?: string;
  };
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readEvidence(): Promise<GovernedBusinessAppEvidence> {
  const evidencePath = path.join(
    repoRoot(),
    "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/summary.json",
  );
  return JSON.parse(await readFile(evidencePath, "utf8")) as GovernedBusinessAppEvidence;
}

export async function validateGovernedBusinessAppEvidence(): Promise<void> {
  const evidence = await readEvidence();

  assert.equal(evidence.schema, "governed-business-app-workflow-evidence/v1");
  assert.equal(evidence.verdict, "business_app_governed_workflow_observed");
  assert.equal(evidence.platform, "android");
  assert.equal(evidence.appId, "com.epam.mobitru");
  assert.match(evidence.device?.deviceIdRedacted ?? "", /\*\*\*/);

  assert.equal(evidence.sessions?.setupPolicyProfile, "sample-harness-default");
  assert.equal(evidence.sessions?.readOnlyPolicyProfile, "read-only");

  assert.equal(evidence.checks?.deviceDetected, true);
  assert.equal(evidence.checks?.appArtifactAvailable, true);
  assert.equal(evidence.checks?.setupSessionStarted, true);
  assert.equal(evidence.checks?.setupLaunched, true);
  assert.equal(evidence.checks?.readOnlySessionStarted, true);
  assert.equal(evidence.checks?.inspectedScreen, true);
  assert.equal(evidence.checks?.policyDenied, true);
  assert.equal(evidence.checks?.remediationAvailable, true);

  assert.equal(evidence.setup?.launchApp?.status, "success");
  assert.equal(evidence.setup?.launchApp?.reasonCode, "OK");
  assert.equal(evidence.inspectUi?.status, "success");
  assert.equal(evidence.inspectUi?.reasonCode, "OK");
  assert.ok((evidence.inspectUi?.totalNodes ?? 0) > 0, "inspectUi.totalNodes must be positive");
  assert.ok((evidence.inspectUi?.clickableNodes ?? 0) > 0, "inspectUi.clickableNodes must be positive");
  assert.equal(evidence.screenSummary?.appPhase, "authentication");

  assert.equal(evidence.policyDeniedStep?.attemptedText, "Login");
  assert.equal(evidence.policyDeniedStep?.status, "failed");
  assert.equal(evidence.policyDeniedStep?.reasonCode, "POLICY_DENIED");
  assert.equal(evidence.remediationStep?.status, "success");
  assert.equal(evidence.remediationStep?.reasonCode, "OK");
}

validateGovernedBusinessAppEvidence().then(() => {
  console.log("Governed business app evidence validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
