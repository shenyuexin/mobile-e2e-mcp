import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface GovernedEvidenceBrief {
  schema?: string;
  positioning?: {
    primaryWedge?: string;
    currentVerdict?: string;
    notClaiming?: string[];
  };
  evidenceCards?: Array<{
    id?: string;
    proofLevel?: string;
    verdict?: string;
  }>;
  recommendedCommands?: Array<{
    command?: string;
  }>;
  remainingProofGaps?: Array<{
    gap?: string;
  }>;
}

interface GovernedPrEvidenceSummary {
  schema?: string;
  sourceBrief?: string;
  intendedSurface?: string;
  title?: string;
  verdict?: string;
  positioning?: string;
  evidenceCardIds?: string[];
  commands?: string[];
  boundaries?: string[];
  nextProofGaps?: string[];
}

const briefPath = "docs/showcase/evidence/governed-control-brief/brief.json";
const summaryJsonPath = "docs/showcase/evidence/governed-control-brief/pr-comment.json";
const summaryMarkdownPath = "docs/showcase/evidence/governed-control-brief/pr-comment.md";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

export async function validateGovernedPrEvidenceSummary(): Promise<void> {
  const brief = await readJson<GovernedEvidenceBrief>(briefPath);
  const summary = await readJson<GovernedPrEvidenceSummary>(summaryJsonPath);
  const markdown = await readFile(path.join(repoRoot(), summaryMarkdownPath), "utf8");

  assert.equal(summary.schema, "governed-pr-evidence-summary/v1");
  assert.equal(summary.sourceBrief, briefPath);
  assert.equal(summary.intendedSurface, "pull_request_comment");
  assert.equal(summary.title, "Governed mobile control evidence");
  assert.equal(summary.verdict, brief.positioning?.currentVerdict);
  assert.equal(summary.positioning, brief.positioning?.primaryWedge);

  const cardIds = brief.evidenceCards?.map((card) => card.id).filter((id): id is string => Boolean(id)) ?? [];
  assert.deepEqual(summary.evidenceCardIds, cardIds);
  assert.ok(summary.evidenceCardIds?.includes("settings-live-governed-control"));
  assert.ok(summary.evidenceCardIds?.includes("business-app-readonly-workflow"));
  assert.ok(summary.evidenceCardIds?.includes("policy-escalation-dry-run"));

  const commands = brief.recommendedCommands?.map((entry) => entry.command).filter((command): command is string => Boolean(command)) ?? [];
  assert.ok(summary.commands?.includes("pnpm run validate:governed-evidence-brief"));
  assert.ok(summary.commands?.includes("pnpm run validate:governed-policy-escalation-evidence"));
  assert.ok(summary.commands?.every((command) => commands.includes(command)), "summary commands must be drawn from the brief");

  assert.ok(summary.boundaries?.some((boundary) => boundary.includes("does not replace Appium")));
  assert.ok(summary.boundaries?.some((boundary) => boundary.includes("does not prove equal Android and iOS")));
  assert.deepEqual(
    summary.nextProofGaps,
    brief.remainingProofGaps?.map((gap) => gap.gap).filter((gap): gap is string => Boolean(gap)),
  );

  assert.match(markdown, /## Governed mobile control evidence/);
  assert.match(markdown, /Verdict:/);
  assert.match(markdown, /Evidence:/);
  assert.match(markdown, /Boundaries:/);
  assert.match(markdown, /Next proof gaps:/);
  assert.match(markdown, /pnpm run validate:governed-evidence-brief/);
  assert.match(markdown, /policy_escalation_retry_dry_run_observed/);
}

validateGovernedPrEvidenceSummary().then(() => {
  console.log("Governed PR evidence summary validation passed.");
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
