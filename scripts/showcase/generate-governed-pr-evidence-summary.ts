import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface EvidenceCard {
  id?: string;
  proofLevel?: string;
  verdict?: string;
}

interface GovernedEvidenceBrief {
  positioning?: {
    primaryWedge?: string;
    currentVerdict?: string;
    notClaiming?: string[];
  };
  evidenceCards?: EvidenceCard[];
  recommendedCommands?: Array<{
    command?: string;
  }>;
  remainingProofGaps?: Array<{
    gap?: string;
  }>;
}

interface GovernedPrEvidenceSummary {
  schema: "governed-pr-evidence-summary/v1";
  sourceBrief: string;
  intendedSurface: "pull_request_comment";
  title: string;
  verdict: string;
  positioning: string;
  evidenceCardIds: string[];
  evidenceVerdicts: string[];
  commands: string[];
  boundaries: string[];
  nextProofGaps: string[];
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

function definedStrings(values: Array<string | undefined> | undefined): string[] {
  return values?.filter((value): value is string => Boolean(value)) ?? [];
}

function selectCommands(brief: GovernedEvidenceBrief): string[] {
  const commands = definedStrings(brief.recommendedCommands?.map((entry) => entry.command));
  const preferred = [
    "pnpm run quickstart:governed-control",
    "pnpm run validate:governed-control-evidence",
    "pnpm run validate:governed-business-app-evidence",
    "pnpm run validate:governed-business-app-comparison",
    "pnpm run validate:governed-policy-escalation-evidence",
    "pnpm run validate:governed-evidence-brief",
    "pnpm run validate:governed-pr-evidence-summary",
  ];
  return preferred.filter((command) => commands.includes(command));
}

export function buildGovernedPrEvidenceSummary(brief: GovernedEvidenceBrief): GovernedPrEvidenceSummary {
  const evidenceCards = brief.evidenceCards ?? [];
  return {
    schema: "governed-pr-evidence-summary/v1",
    sourceBrief: briefPath,
    intendedSurface: "pull_request_comment",
    title: "Governed mobile control evidence",
    verdict: brief.positioning?.currentVerdict ?? "unknown",
    positioning: brief.positioning?.primaryWedge ?? "unknown",
    evidenceCardIds: definedStrings(evidenceCards.map((card) => card.id)),
    evidenceVerdicts: definedStrings(evidenceCards.map((card) => card.verdict)),
    commands: selectCommands(brief),
    boundaries: brief.positioning?.notClaiming ?? [],
    nextProofGaps: definedStrings(brief.remainingProofGaps?.map((gap) => gap.gap)),
  };
}

export function renderPrComment(summary: GovernedPrEvidenceSummary): string {
  const evidenceLines = summary.evidenceVerdicts.map((verdict) => `- \`${verdict}\``);
  const commandLines = summary.commands.map((command) => `- \`${command}\``);
  const boundaryLines = summary.boundaries.map((boundary) => `- ${boundary}`);
  const gapLines = summary.nextProofGaps.map((gap) => `- ${gap}`);

  return [
    "## Governed mobile control evidence",
    "",
    `Verdict: \`${summary.verdict}\``,
    "",
    `Positioning: ${summary.positioning}`,
    "",
    "Evidence:",
    ...evidenceLines,
    "",
    "Validation commands:",
    ...commandLines,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
    "Next proof gaps:",
    ...gapLines,
    "",
    `Source: \`${summary.sourceBrief}\``,
    "",
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    const existing = await readFile(absolutePath, "utf8");
    assert.equal(existing, content, `${relativePath} is out of date; rerun pnpm run generate:governed-pr-evidence-summary`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const brief = await readJson<GovernedEvidenceBrief>(briefPath);
  const summary = buildGovernedPrEvidenceSummary(brief);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  const markdown = renderPrComment(summary);

  await writeOrCheck(summaryJsonPath, json, check);
  await writeOrCheck(summaryMarkdownPath, markdown, check);

  console.log(check
    ? "Governed PR evidence summary is up to date."
    : `Governed PR evidence summary written to ${summaryMarkdownPath}`);
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
