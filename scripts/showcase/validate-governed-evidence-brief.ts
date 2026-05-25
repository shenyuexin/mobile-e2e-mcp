import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface GovernedControlEvidence {
  verdict?: string;
  appId?: string;
  platform?: string;
  device?: {
    model?: string;
  };
  checks?: Record<string, boolean | undefined>;
  inspectUi?: {
    totalNodes?: number;
    clickableNodes?: number;
  };
  policyDeniedStep?: {
    reasonCode?: string;
  };
}

interface GovernedBusinessAppEvidence extends GovernedControlEvidence {
  screenSummary?: {
    appPhase?: string;
  };
  policyDeniedStep?: {
    attemptedText?: string;
    reasonCode?: string;
  };
}

interface GovernedBusinessAppComparison {
  verdict?: string;
  proofBoundaries?: string[];
}

interface EvidenceCard {
  id?: string;
  source?: string;
  proofLevel?: string;
  appId?: string;
  platform?: string;
  deviceModel?: string;
  verdict?: string;
  observedSignals?: string[];
  practicalMeaning?: string;
}

interface GovernedEvidenceBrief {
  schema?: string;
  curatedAt?: string;
  positioning?: {
    primaryWedge?: string;
    currentVerdict?: string;
    bestFitUsers?: string[];
    notClaiming?: string[];
  };
  sourceEvidence?: string[];
  evidenceCards?: EvidenceCard[];
  recommendedCommands?: Array<{
    command?: string;
    purpose?: string;
  }>;
  remainingProofGaps?: Array<{
    gap?: string;
    whyItMatters?: string;
    fastestProof?: string;
  }>;
}

const settingsEvidencePath = "docs/showcase/evidence/governed-control-vivo-2026-05-23/summary.json";
const businessEvidencePath = "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/summary.json";
const comparisonPath = "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/comparison.json";
const briefPath = "docs/showcase/evidence/governed-control-brief/brief.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function findCard(brief: GovernedEvidenceBrief, id: string): EvidenceCard {
  return brief.evidenceCards?.find((card) => card.id === id) ?? {};
}

function hasSignal(card: EvidenceCard, signal: string): boolean {
  return card.observedSignals?.includes(signal) ?? false;
}

function hasCommand(brief: GovernedEvidenceBrief, command: string): boolean {
  return brief.recommendedCommands?.some((entry) => entry.command === command) ?? false;
}

export async function validateGovernedEvidenceBrief(): Promise<void> {
  const settings = await readJson<GovernedControlEvidence>(settingsEvidencePath);
  const business = await readJson<GovernedBusinessAppEvidence>(businessEvidencePath);
  const comparison = await readJson<GovernedBusinessAppComparison>(comparisonPath);
  const brief = await readJson<GovernedEvidenceBrief>(briefPath);

  assert.equal(brief.schema, "governed-control-brief/v1");
  assert.equal(brief.curatedAt, "2026-05-25");
  assert.equal(brief.positioning?.primaryWedge, "AI-safe mobile device control via MCP");
  assert.equal(brief.positioning?.currentVerdict, "practical_for_agent_governed_observation_and_action_mediation");
  assert.ok(brief.positioning?.bestFitUsers?.some((user) => user.includes("AI agents")));
  assert.ok(brief.positioning?.notClaiming?.some((claim) => claim.includes("does not replace Appium")));
  assert.ok(brief.positioning?.notClaiming?.some((claim) => claim.includes("does not prove equal Android and iOS")));

  assert.deepEqual(brief.sourceEvidence, [
    settingsEvidencePath,
    businessEvidencePath,
    comparisonPath
  ]);

  const settingsCard = findCard(brief, "settings-live-governed-control");
  assert.equal(settings.verdict, "live_governed_control_observed");
  assert.equal(settingsCard.source, settingsEvidencePath);
  assert.equal(settingsCard.appId, settings.appId);
  assert.equal(settingsCard.platform, settings.platform);
  assert.equal(settingsCard.deviceModel, settings.device?.model);
  assert.equal(settingsCard.verdict, settings.verdict);
  assert.ok(hasSignal(settingsCard, `inspectUi.totalNodes=${settings.inspectUi?.totalNodes}`));
  assert.ok(hasSignal(settingsCard, `inspectUi.clickableNodes=${settings.inspectUi?.clickableNodes}`));
  assert.ok(hasSignal(settingsCard, `policyDeniedStep.reasonCode=${settings.policyDeniedStep?.reasonCode}`));
  assert.ok(settingsCard.practicalMeaning?.includes("read-only policy"));

  const businessCard = findCard(brief, "business-app-readonly-workflow");
  assert.equal(business.verdict, "business_app_governed_workflow_observed");
  assert.equal(businessCard.source, businessEvidencePath);
  assert.equal(businessCard.appId, business.appId);
  assert.equal(businessCard.platform, business.platform);
  assert.equal(businessCard.deviceModel, business.device?.model);
  assert.equal(businessCard.verdict, business.verdict);
  assert.ok(hasSignal(businessCard, `screenSummary.appPhase=${business.screenSummary?.appPhase}`));
  assert.ok(hasSignal(businessCard, `inspectUi.totalNodes=${business.inspectUi?.totalNodes}`));
  assert.ok(hasSignal(businessCard, `inspectUi.clickableNodes=${business.inspectUi?.clickableNodes}`));
  assert.ok(hasSignal(businessCard, `policyDeniedStep.attemptedText=${business.policyDeniedStep?.attemptedText}`));
  assert.ok(hasSignal(businessCard, `policyDeniedStep.reasonCode=${business.policyDeniedStep?.reasonCode}`));

  const comparisonCard = findCard(brief, "alternative-comparison");
  assert.equal(comparison.verdict, "harness_shows_distinct_agent_safety_value");
  assert.equal(comparisonCard.source, comparisonPath);
  assert.equal(comparisonCard.verdict, comparison.verdict);
  assert.ok(comparisonCard.observedSignals?.some((signal) => signal.includes("policy-bound denial")));
  assert.ok(comparisonCard.observedSignals?.some((signal) => signal.includes("non-replacement boundary")));
  assert.ok(comparison.proofBoundaries?.some((boundary) => boundary.includes("does not claim Maestro")));

  assert.ok(hasCommand(brief, "pnpm run quickstart:governed-control"));
  assert.ok(hasCommand(brief, "pnpm run validate:governed-control-evidence"));
  assert.ok(hasCommand(brief, "pnpm run validate:governed-business-app-evidence"));
  assert.ok(hasCommand(brief, "pnpm run validate:governed-business-app-comparison"));
  assert.ok(hasCommand(brief, "pnpm run validate:governed-evidence-brief"));
  assert.ok(hasCommand(brief, "pnpm run proof:governed-business-app-workflow"));

  assert.ok(brief.remainingProofGaps?.some((gap) => gap.gap === "policy escalation after denial"));
  assert.ok(brief.remainingProofGaps?.some((gap) => gap.gap === "PR/comment consumption surface"));
  assert.ok(brief.remainingProofGaps?.some((gap) => gap.gap === "iOS parity for governed-control proof"));
}

validateGovernedEvidenceBrief().then(() => {
  console.log("Governed evidence brief validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
