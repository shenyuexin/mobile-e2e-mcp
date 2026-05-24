import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface GovernedBusinessAppEvidence {
  verdict?: string;
  appId?: string;
  checks?: {
    setupLaunched?: boolean;
    inspectedScreen?: boolean;
    policyDenied?: boolean;
    remediationAvailable?: boolean;
  };
  inspectUi?: {
    totalNodes?: number;
    clickableNodes?: number;
  };
  screenSummary?: {
    appPhase?: string;
  };
  policyDeniedStep?: {
    attemptedText?: string;
    reasonCode?: string;
  };
}

interface ComparisonAlternative {
  name?: string;
  canDo?: string[];
  cannotProveFromThisEvidence?: string[];
  evidenceBackedSignals?: string[];
}

interface GovernedBusinessAppComparison {
  schema?: string;
  sourceEvidence?: string;
  scenario?: {
    appId?: string;
    screenPhase?: string;
    agentIntent?: string;
    risk?: string;
  };
  verdict?: string;
  alternatives?: ComparisonAlternative[];
  decisionMatrix?: Array<Record<string, string>>;
  proofBoundaries?: string[];
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function findAlternative(comparison: GovernedBusinessAppComparison, name: string): ComparisonAlternative {
  return comparison.alternatives?.find((item) => item.name === name) ?? {};
}

export async function validateGovernedBusinessAppComparison(): Promise<void> {
  const evidencePath = "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/summary.json";
  const comparisonPath = "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/comparison.json";
  const evidence = await readJson<GovernedBusinessAppEvidence>(evidencePath);
  const comparison = await readJson<GovernedBusinessAppComparison>(comparisonPath);

  assert.equal(comparison.schema, "governed-business-app-comparison/v1");
  assert.equal(comparison.sourceEvidence, evidencePath);
  assert.equal(comparison.verdict, "harness_shows_distinct_agent_safety_value");

  assert.equal(evidence.verdict, "business_app_governed_workflow_observed");
  assert.equal(comparison.scenario?.appId, evidence.appId);
  assert.equal(comparison.scenario?.screenPhase, evidence.screenSummary?.appPhase);
  assert.match(comparison.scenario?.agentIntent ?? "", /Login/);
  assert.match(comparison.scenario?.risk ?? "", /read-only/);

  assert.equal(evidence.checks?.setupLaunched, true);
  assert.equal(evidence.checks?.inspectedScreen, true);
  assert.equal(evidence.checks?.policyDenied, true);
  assert.equal(evidence.checks?.remediationAvailable, true);
  assert.equal(evidence.policyDeniedStep?.attemptedText, "Login");
  assert.equal(evidence.policyDeniedStep?.reasonCode, "POLICY_DENIED");

  const harness = findAlternative(comparison, "mobile-e2e-mcp governed harness");
  assert.ok(harness.canDo?.some((item) => item.includes("read-only")), "harness comparison must mention read-only control");
  assert.ok(harness.evidenceBackedSignals?.includes("policyDenied=true"));
  assert.ok(harness.evidenceBackedSignals?.includes(`screenSummary.appPhase=${evidence.screenSummary?.appPhase}`));
  assert.ok(harness.evidenceBackedSignals?.includes(`inspectUi.totalNodes=${evidence.inspectUi?.totalNodes}`));
  assert.ok(harness.evidenceBackedSignals?.includes(`inspectUi.clickableNodes=${evidence.inspectUi?.clickableNodes}`));

  const adb = findAlternative(comparison, "ad-hoc adb wrapper");
  assert.ok(adb.cannotProveFromThisEvidence?.some((item) => item.includes("policy-bound denial")));
  const maestro = findAlternative(comparison, "Maestro flow");
  assert.ok(maestro.cannotProveFromThisEvidence?.some((item) => item.includes("POLICY_DENIED")));

  assert.ok((comparison.decisionMatrix?.length ?? 0) >= 4, "comparison must include decision matrix rows");
  assert.ok(comparison.proofBoundaries?.some((item) => item.includes("does not claim Maestro")));
}

validateGovernedBusinessAppComparison().then(() => {
  console.log("Governed business app comparison validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
