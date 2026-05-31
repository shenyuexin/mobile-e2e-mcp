import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  renderReactNativeEvidencePackMarkdown,
  writeReactNativeEvidencePack,
  type ReactNativeEvidencePack,
} from "./react-native-evidence-pack.ts";
import {
  renderReactNativeReadinessMarkdown,
  writeReactNativeReadiness,
  type ReactNativeReadinessResult,
} from "./react-native-readiness.ts";

export type ReactNativeOneCommandVerdict = "completed" | "blocked" | "needs_review";

export interface ReactNativeOneCommandStage {
  id: "readiness" | "evidence-pack" | "review";
  status: "passed" | "blocked" | "needs_review";
  detail: string;
}

export interface ReactNativeOneCommandResult {
  schema: "react-native-one-command/v1";
  runId: string;
  verdict: ReactNativeOneCommandVerdict;
  proofLevel: ReactNativeEvidencePack["proofLevel"];
  stages: ReactNativeOneCommandStage[];
  blockers: Array<{ reasonCode: string; detail: string }>;
  evidence: {
    readiness: string;
    evidencePack: string;
    result: string;
  };
  nextAction: ReactNativeEvidencePack["nextAction"];
  boundaries: string[];
}

export interface ReactNativeOneCommandDependencies {
  runReadiness: () => Promise<{ path: string; result: ReactNativeReadinessResult }>;
  runEvidencePack: () => Promise<{ path: string; result: ReactNativeEvidencePack }>;
}

const outputDir = "docs/showcase/evidence/react-native-one-command";
const resultJsonPath = `${outputDir}/result.json`;
const resultMarkdownPath = `${outputDir}/result.md`;
const readinessOutputPath = "docs/showcase/evidence/react-native-readiness/summary.json";
const evidencePackOutputPath = "docs/showcase/evidence/react-native-evidence-pack/evidence-pack.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function defaultBoundaries(): string[] {
  return [
    "This RN command orchestrates readiness and evidence packaging; it does not weaken proof-level labels.",
    "A blocked RN result is not an app assertion failure.",
    "Live RN success still requires device-backed verification and intake-backed promotion evidence.",
  ];
}

function verdictFor(pack: ReactNativeEvidencePack): ReactNativeOneCommandVerdict {
  if (pack.reviewStatus === "blocked") return "blocked";
  if (pack.reviewStatus === "needs_review") return "needs_review";
  return "completed";
}

export async function runReactNativeOneCommand(
  runId: string,
  deps: ReactNativeOneCommandDependencies,
): Promise<ReactNativeOneCommandResult> {
  const readiness = await deps.runReadiness();
  const evidencePack = await deps.runEvidencePack();
  const verdict = verdictFor(evidencePack.result);
  const stages: ReactNativeOneCommandStage[] = [
    {
      id: "readiness",
      status: readiness.result.verdict === "ready_for_react_native_verification" ? "passed" : "blocked",
      detail: `Readiness verdict: ${readiness.result.verdict}.`,
    },
    {
      id: "evidence-pack",
      status: evidencePack.result.reviewStatus === "blocked" ? "blocked" : evidencePack.result.reviewStatus === "needs_review" ? "needs_review" : "passed",
      detail: `Evidence pack review status: ${evidencePack.result.reviewStatus}.`,
    },
    {
      id: "review",
      status: verdict === "completed" ? "passed" : verdict,
      detail: `RN one-command verdict: ${verdict}.`,
    },
  ];

  return {
    schema: "react-native-one-command/v1",
    runId,
    verdict,
    proofLevel: evidencePack.result.proofLevel,
    stages,
    blockers: evidencePack.result.readiness.blockers,
    evidence: {
      readiness: readiness.path,
      evidencePack: evidencePack.path,
      result: resultJsonPath,
    },
    nextAction: evidencePack.result.nextAction,
    boundaries: defaultBoundaries(),
  };
}

export function renderReactNativeOneCommandMarkdown(result: ReactNativeOneCommandResult): string {
  const stageLines = result.stages.map((stage) => `- ${stage.id}: \`${stage.status}\` - ${stage.detail}`);
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const boundaryLines = result.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## React Native one-command verification",
    "",
    `Verdict: \`${result.verdict}\``,
    `Proof level: \`${result.proofLevel}\``,
    `Run ID: \`${result.runId}\``,
    "",
    "Stages:",
    ...stageLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Evidence:",
    `- readiness: \`${result.evidence.readiness}\``,
    `- evidence pack: \`${result.evidence.evidencePack}\``,
    `- result: \`${result.evidence.result}\``,
    "",
    "Next action:",
    `- \`${result.nextAction.kind}\`: ${result.nextAction.reason}`,
    `- Command: \`${result.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

export function validateReactNativeOneCommand(result: ReactNativeOneCommandResult): void {
  assert.equal(result.schema, "react-native-one-command/v1");
  assert.equal(result.stages.length, 3, "RN one-command result must include readiness, evidence-pack, and review stages");
  assert.ok(result.evidence.readiness.length > 0, "RN one-command result requires readiness evidence path");
  assert.ok(result.evidence.evidencePack.length > 0, "RN one-command result requires evidence pack path");
  assert.ok(result.boundaries.some((boundary) => boundary.includes("does not weaken proof-level labels")), "RN one-command result must preserve proof labels");
  if (result.verdict === "blocked") {
    assert.equal(result.proofLevel, "blocked_before_live", "blocked RN one-command result must preserve blocked proof level");
    assert.ok(result.blockers.length > 0, "blocked RN one-command result must include blockers");
  }
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-one-command`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function defaultDeps(): ReactNativeOneCommandDependencies {
  return {
    runReadiness: async () => {
      const result = await writeReactNativeReadiness(false);
      await writeFile(path.join(repoRoot(), "docs/showcase/evidence/react-native-readiness/report.md"), renderReactNativeReadinessMarkdown(result), "utf8");
      return { path: readinessOutputPath, result };
    },
    runEvidencePack: async () => {
      const result = await writeReactNativeEvidencePack(false);
      await writeFile(path.join(repoRoot(), "docs/showcase/evidence/react-native-evidence-pack/evidence-pack.md"), renderReactNativeEvidencePackMarkdown(result), "utf8");
      return { path: evidencePackOutputPath, result };
    },
  };
}

export async function writeReactNativeOneCommand(check: boolean): Promise<ReactNativeOneCommandResult> {
  const runId = process.env.M2E_RN_ONE_COMMAND_RUN_ID ?? "react-native-one-command-2026-06-01";
  const result = await runReactNativeOneCommand(runId, defaultDeps());
  validateReactNativeOneCommand(result);
  await writeOrCheck(resultJsonPath, `${JSON.stringify(result, null, 2)}\n`, check);
  await writeOrCheck(resultMarkdownPath, renderReactNativeOneCommandMarkdown(result), check);
  return result;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const result = await writeReactNativeOneCommand(check);
  console.log(check ? "React Native one-command result is up to date." : `React Native one-command result written to ${outputDir}`);
  console.log(JSON.stringify({
    verdict: result.verdict,
    proofLevel: result.proofLevel,
    blockers: result.blockers.map((blocker) => blocker.reasonCode),
    nextAction: result.nextAction.kind,
  }, null, 2));
  if (result.verdict !== "completed" && process.env.M2E_RN_ONE_COMMAND_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  }
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
