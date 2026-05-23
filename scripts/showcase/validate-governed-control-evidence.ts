import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface GovernedControlEvidence {
  schema: string;
  verdict: string;
  platform: string;
  device?: {
    deviceIdRedacted?: string;
    model?: string;
  };
  session?: {
    policyProfile?: string;
  };
  checks?: {
    deviceDetected?: boolean;
    inspectedScreen?: boolean;
    policyDenied?: boolean;
    remediationAvailable?: boolean;
  };
  inspectUi?: {
    status?: string;
    reasonCode?: string;
    totalNodes?: number;
    clickableNodes?: number;
  };
  policyDeniedStep?: {
    status?: string;
    reasonCode?: string;
  };
  remediationStep?: {
    status?: string;
    reasonCode?: string;
  };
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readEvidence(): Promise<GovernedControlEvidence> {
  const evidencePath = path.join(
    repoRoot(),
    "docs/showcase/evidence/governed-control-vivo-2026-05-23/summary.json",
  );
  return JSON.parse(await readFile(evidencePath, "utf8")) as GovernedControlEvidence;
}

export async function validateGovernedControlEvidence(): Promise<void> {
  const evidence = await readEvidence();

  assert.equal(evidence.schema, "governed-control-live-evidence/v1");
  assert.equal(evidence.verdict, "live_governed_control_observed");
  assert.equal(evidence.platform, "android");
  assert.equal(evidence.session?.policyProfile, "read-only");
  assert.match(evidence.device?.deviceIdRedacted ?? "", /\*\*\*/);

  assert.equal(evidence.checks?.deviceDetected, true);
  assert.equal(evidence.checks?.inspectedScreen, true);
  assert.equal(evidence.checks?.policyDenied, true);
  assert.equal(evidence.checks?.remediationAvailable, true);

  assert.equal(evidence.inspectUi?.status, "success");
  assert.equal(evidence.inspectUi?.reasonCode, "OK");
  assert.ok((evidence.inspectUi?.totalNodes ?? 0) > 0, "inspectUi.totalNodes must be positive");
  assert.ok((evidence.inspectUi?.clickableNodes ?? 0) > 0, "inspectUi.clickableNodes must be positive");

  assert.equal(evidence.policyDeniedStep?.status, "failed");
  assert.equal(evidence.policyDeniedStep?.reasonCode, "POLICY_DENIED");
  assert.equal(evidence.remediationStep?.status, "success");
  assert.equal(evidence.remediationStep?.reasonCode, "OK");
}

validateGovernedControlEvidence().then(() => {
  console.log("Governed control evidence validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
