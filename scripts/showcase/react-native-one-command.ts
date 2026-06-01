import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  writeReactNativeEvidencePack,
  type ReactNativeEvidencePack,
} from "./react-native-evidence-pack.ts";
import {
  writeReactNativeReadiness,
  type ReactNativeReadinessResult,
} from "./react-native-readiness.ts";
import {
  writeMobileChangeOneCommand,
  type MobileChangeOneCommandResult,
} from "./mobile-change-one-command.ts";

export type ReactNativeOneCommandVerdict = "completed" | "blocked" | "needs_review" | "verification_failed" | "intake_rejected";

export interface ReactNativeOneCommandStage {
  id: "readiness" | "evidence-pack" | "live-bridge" | "review";
  status: "passed" | "blocked" | "needs_review" | "failed" | "skipped";
  detail: string;
}

export interface ReactNativeLiveBridgeResult {
  mode: "skipped" | "live";
  status: "skipped" | MobileChangeOneCommandResult["verdict"];
  proofLevel?: MobileChangeOneCommandResult["proofLevel"];
  outputDir?: string;
  evidence?: MobileChangeOneCommandResult["evidence"];
  blockers?: MobileChangeOneCommandResult["blockers"];
  detail: string;
}

export interface ReactNativeOneCommandResult {
  schema: "react-native-one-command/v2";
  runId: string;
  verdict: ReactNativeOneCommandVerdict;
  proofLevel: ReactNativeEvidencePack["proofLevel"] | MobileChangeOneCommandResult["proofLevel"];
  stages: ReactNativeOneCommandStage[];
  liveBridge: ReactNativeLiveBridgeResult;
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
  runLiveBridge?: () => Promise<{ outputDir: string; result: MobileChangeOneCommandResult }>;
}

export interface ReactNativeOneCommandOptions {
  enableLiveBridge?: boolean;
  resultPath?: string;
}

export interface ReactNativeOneCommandWriteOptions {
  check: boolean;
  runId: string;
  outputDir: string;
  enableLiveBridge: boolean;
  liveBridgeRunId: string;
  liveBridgeOutputDir?: string;
  liveBridgeContractPath?: string;
}

const defaultOutputDir = "docs/showcase/evidence/react-native-one-command";
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
    "The live bridge is explicit and only runs after RN readiness passes.",
  ];
}

function verdictFor(pack: ReactNativeEvidencePack): ReactNativeOneCommandVerdict {
  if (pack.reviewStatus === "blocked") return "blocked";
  if (pack.reviewStatus === "needs_review") return "needs_review";
  return "completed";
}

function bridgeStageStatus(status: ReactNativeLiveBridgeResult["status"]): ReactNativeOneCommandStage["status"] {
  if (status === "skipped") return "skipped";
  if (status === "completed") return "passed";
  if (status === "blocked") return "blocked";
  return "failed";
}

function verdictWithBridge(packVerdict: ReactNativeOneCommandVerdict, bridge: ReactNativeLiveBridgeResult): ReactNativeOneCommandVerdict {
  if (bridge.status === "skipped") return packVerdict;
  if (bridge.status === "completed") return packVerdict === "blocked" ? "blocked" : "completed";
  return bridge.status;
}

function proofLevelWithBridge(pack: ReactNativeEvidencePack, bridge: ReactNativeLiveBridgeResult): ReactNativeOneCommandResult["proofLevel"] {
  return bridge.status === "skipped" ? pack.proofLevel : bridge.proofLevel ?? pack.proofLevel;
}

export async function runReactNativeOneCommand(
  runId: string,
  deps: ReactNativeOneCommandDependencies,
  options: ReactNativeOneCommandOptions = {},
): Promise<ReactNativeOneCommandResult> {
  const readiness = await deps.runReadiness();
  const evidencePack = await deps.runEvidencePack();
  const packVerdict = verdictFor(evidencePack.result);
  let liveBridge: ReactNativeLiveBridgeResult = {
    mode: "skipped",
    status: "skipped",
    detail: options.enableLiveBridge
      ? "Live bridge skipped because RN readiness did not pass."
      : "Live bridge was not requested.",
  };

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
  ];

  if (options.enableLiveBridge && readiness.result.verdict === "ready_for_react_native_verification") {
    if (!deps.runLiveBridge) throw new Error("runLiveBridge dependency is required when RN live bridge is enabled");
    const bridge = await deps.runLiveBridge();
    liveBridge = {
      mode: "live",
      status: bridge.result.verdict,
      proofLevel: bridge.result.proofLevel,
      outputDir: bridge.outputDir,
      evidence: bridge.result.evidence,
      blockers: bridge.result.blockers,
      detail: `Mobile-change live bridge verdict: ${bridge.result.verdict}.`,
    };
  }

  stages.push({
    id: "live-bridge",
    status: bridgeStageStatus(liveBridge.status),
    detail: liveBridge.detail,
  });

  const verdict = verdictWithBridge(packVerdict, liveBridge);

  stages.push({
    id: "review",
    status: verdict === "completed" ? "passed" : verdict === "blocked" ? "blocked" : verdict === "needs_review" ? "needs_review" : "failed",
    detail: `RN one-command verdict: ${verdict}.`,
  });

  return {
    schema: "react-native-one-command/v2",
    runId,
    verdict,
    proofLevel: proofLevelWithBridge(evidencePack.result, liveBridge),
    stages,
    liveBridge,
    blockers: [
      ...evidencePack.result.readiness.blockers,
      ...(liveBridge.blockers ?? []),
    ],
    evidence: {
      readiness: readiness.path,
      evidencePack: evidencePack.path,
      result: options.resultPath ?? `${defaultOutputDir}/result.json`,
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
    `- live bridge: \`${result.liveBridge.outputDir ?? "not-run"}\``,
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
  assert.equal(result.schema, "react-native-one-command/v2");
  assert.equal(result.stages.length, 4, "RN one-command result must include readiness, evidence-pack, live-bridge, and review stages");
  assert.ok(result.evidence.readiness.length > 0, "RN one-command result requires readiness evidence path");
  assert.ok(result.evidence.evidencePack.length > 0, "RN one-command result requires evidence pack path");
  assert.ok(result.boundaries.some((boundary) => boundary.includes("does not weaken proof-level labels")), "RN one-command result must preserve proof labels");
  assert.ok(result.boundaries.some((boundary) => boundary.includes("live bridge is explicit")), "RN one-command result must keep live bridge explicit");
  if (result.verdict === "blocked") {
    assert.equal(result.proofLevel, "blocked_before_live", "blocked RN one-command result must preserve blocked proof level");
    assert.ok(result.blockers.length > 0, "blocked RN one-command result must include blockers");
  }
  if (result.liveBridge.status !== "skipped") {
    assert.equal(result.liveBridge.mode, "live", "non-skipped bridge result must be live");
    assert.ok(result.liveBridge.outputDir, "live bridge result requires an output directory");
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

function defaultDeps(options: ReactNativeOneCommandWriteOptions): ReactNativeOneCommandDependencies {
  return {
    runReadiness: async () => {
      const result = await writeReactNativeReadiness(options.check);
      return { path: readinessOutputPath, result };
    },
    runEvidencePack: async () => {
      const result = await writeReactNativeEvidencePack(options.check);
      return { path: evidencePackOutputPath, result };
    },
    runLiveBridge: async () => writeMobileChangeOneCommand({
      mode: "live",
      runId: options.liveBridgeRunId,
      outputDir: options.liveBridgeOutputDir,
      contractPath: options.liveBridgeContractPath,
    }),
  };
}

export async function writeReactNativeOneCommand(options: boolean | ReactNativeOneCommandWriteOptions): Promise<ReactNativeOneCommandResult> {
  const resolved = typeof options === "boolean" ? defaultWriteOptions(options) : options;
  const resultJsonPath = `${resolved.outputDir}/result.json`;
  const resultMarkdownPath = `${resolved.outputDir}/result.md`;
  const result = await runReactNativeOneCommand(resolved.runId, defaultDeps(resolved), {
    enableLiveBridge: resolved.enableLiveBridge,
    resultPath: resultJsonPath,
  });
  validateReactNativeOneCommand(result);
  await writeOrCheck(resultJsonPath, `${JSON.stringify(result, null, 2)}\n`, resolved.check);
  await writeOrCheck(resultMarkdownPath, renderReactNativeOneCommandMarkdown(result), resolved.check);
  return result;
}

export function parseReactNativeOneCommandArgs(argv: string[], check: boolean): ReactNativeOneCommandWriteOptions {
  const runIdArg = argv.find((arg) => arg.startsWith("--run-id="));
  const outputDirArg = argv.find((arg) => arg.startsWith("--output-dir="));
  const bridgeRunIdArg = argv.find((arg) => arg.startsWith("--bridge-run-id="));
  const bridgeOutputDirArg = argv.find((arg) => arg.startsWith("--bridge-output-dir="));
  const contractArg = argv.find((arg) => arg.startsWith("--contract=") || arg.startsWith("--bridge-contract="));
  const runId = runIdArg?.slice("--run-id=".length)
    ?? process.env.M2E_RN_ONE_COMMAND_RUN_ID
    ?? "react-native-one-command-2026-06-01";
  const liveBridgeRunId = bridgeRunIdArg?.slice("--bridge-run-id=".length)
    ?? process.env.M2E_RN_LIVE_BRIDGE_RUN_ID
    ?? runId;
  const liveBridgeOutputDir = bridgeOutputDirArg?.slice("--bridge-output-dir=".length)
    ?? process.env.M2E_RN_LIVE_BRIDGE_OUTPUT_DIR;
  const liveBridgeContractPath = contractArg?.startsWith("--contract=")
    ? contractArg.slice("--contract=".length)
    : contractArg?.slice("--bridge-contract=".length) ?? process.env.M2E_MOBILE_CHANGE_READINESS_CONTRACT;

  return {
    check,
    runId,
    outputDir: outputDirArg?.slice("--output-dir=".length) ?? defaultOutputDir,
    enableLiveBridge: argv.includes("--live-bridge") || argv.includes("--live") || process.env.M2E_RN_ENABLE_LIVE_BRIDGE === "1",
    liveBridgeRunId,
    liveBridgeOutputDir,
    liveBridgeContractPath,
  };
}

function defaultWriteOptions(check: boolean): ReactNativeOneCommandWriteOptions {
  return parseReactNativeOneCommandArgs([], check);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const options = parseReactNativeOneCommandArgs(process.argv.slice(2), check);
  const result = await writeReactNativeOneCommand(options);
  console.log(check ? "React Native one-command result is up to date." : `React Native one-command result written to ${options.outputDir}`);
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
