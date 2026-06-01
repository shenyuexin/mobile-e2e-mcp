import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";
import {
  buildFixtureEvidence,
  renderFailurePacketMarkdown,
  renderMobileChangeVerificationMarkdown,
  writeLiveMobileChangeVerificationProof,
  type FailurePacket,
  type LiveMobileChangeVerificationResult,
  type MobileChangeVerificationBundle,
  type ToolInvoker,
} from "./mobile-change-verification.ts";
import {
  buildMobileChangeDeviceReadinessPreflight,
  type MobileChangeDeviceReadinessPreflight,
} from "./mobile-change-device-readiness.ts";
import {
  buildMobileChangeHandoffSummary,
  renderMobileChangeHandoffMarkdown,
  type MobileChangeHandoffSummary,
} from "./generate-mobile-change-handoff.ts";
import {
  writeMobileChangeLiveProofIntake,
  type MobileChangeLiveProofIntake,
} from "./generate-mobile-change-live-proof-intake.ts";
import {
  readMobileChangeReadinessContract,
  validateMobileChangeReadinessContract,
  type MobileChangeReadinessContract,
} from "./mobile-change-readiness-contract.ts";

export type MobileChangeOneCommandMode = "fixture" | "live";
export type MobileChangeOneCommandVerdict = "completed" | "blocked" | "verification_failed" | "intake_rejected";
export type MobileChangeOneCommandProofLevel =
  | "fixture_contract"
  | "blocked_before_live"
  | "live_failure"
  | MobileChangeLiveProofIntake["proofLevel"];

export interface MobileChangeOneCommandOptions {
  mode: MobileChangeOneCommandMode;
  runId: string;
  outputDir?: string;
  contractPath?: string;
}

interface CommandNextAction {
  kind: string;
  command: string;
  reason: string;
}

interface CommandBlocker {
  reasonCode: string;
  detail: string;
}

interface CommandStage {
  id: "readiness" | "verify" | "intake" | "handoff";
  status: "passed" | "blocked" | "failed" | "skipped";
  detail: string;
}

interface VerificationOutput {
  outputDir: string;
  bundle: Partial<MobileChangeVerificationBundle> & {
    runId?: string;
    source?: string;
    verdict?: string;
    nextAction?: CommandNextAction;
  };
  failurePacket?: Partial<FailurePacket>;
}

interface HandoffOutput {
  path: string;
  nextCommand: string;
}

export interface MobileChangeOneCommandDependencies {
  runReadiness?: () => Promise<Partial<MobileChangeDeviceReadinessPreflight> & {
    verdict: string;
    blockers?: CommandBlocker[];
    nextAction: CommandNextAction;
  }>;
  runFixtureVerification?: () => Promise<VerificationOutput>;
  runLiveVerification?: () => Promise<VerificationOutput>;
  runIntake?: (outputDir: string) => Promise<Partial<MobileChangeLiveProofIntake> & {
    verdict: string;
    proofLevel: MobileChangeLiveProofIntake["proofLevel"];
    blockers?: CommandBlocker[];
    nextAction: CommandNextAction;
  }>;
  buildHandoff?: (verification: VerificationOutput) => Promise<HandoffOutput>;
}

export interface MobileChangeOneCommandResult {
  schema: "mobile-change-one-command/v1";
  runId: string;
  mode: MobileChangeOneCommandMode;
  verdict: MobileChangeOneCommandVerdict;
  proofLevel: MobileChangeOneCommandProofLevel;
  stages: CommandStage[];
  blockers: CommandBlocker[];
  evidence: {
    readiness?: string;
    verification?: string;
    intake?: string;
    handoff?: string;
  };
  nextAction: CommandNextAction;
  boundaries: string[];
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function defaultOutputDir(runId: string): string {
  return `output/showcase/mobile-change-one-command/${runId}`;
}

function blockedResult(options: MobileChangeOneCommandOptions, readiness: Awaited<ReturnType<NonNullable<MobileChangeOneCommandDependencies["runReadiness"]>>>): MobileChangeOneCommandResult {
  return {
    schema: "mobile-change-one-command/v1",
    runId: options.runId,
    mode: options.mode,
    verdict: "blocked",
    proofLevel: "blocked_before_live",
    stages: [
      {
        id: "readiness",
        status: "blocked",
        detail: "Live verification stopped before UI-affecting actions because readiness preflight reported blockers.",
      },
    ],
    blockers: readiness.blockers ?? [],
    evidence: {
      readiness: "docs/showcase/evidence/mobile-change-device-readiness",
    },
    nextAction: readiness.nextAction,
    boundaries: defaultBoundaries(),
  };
}

function defaultBoundaries(): string[] {
  return [
    "This command orchestrates existing proof steps; it does not weaken proof-level labels.",
    "A blocked readiness result is not a failed app verification.",
    "Live success evidence must pass intake before it is promoted as tracked showcase evidence.",
  ];
}

function nextActionFromVerification(verification: VerificationOutput): CommandNextAction {
  return verification.bundle.nextAction ?? {
    kind: "inspect_verification_output",
    command: "pnpm run validate:mobile-change-verification",
    reason: "Inspect the generated verification output before retrying.",
  };
}

async function maybeBuildHandoff(
  deps: MobileChangeOneCommandDependencies,
  verification: VerificationOutput,
  stages: CommandStage[],
): Promise<HandoffOutput | undefined> {
  if (!deps.buildHandoff) return undefined;
  const handoff = await deps.buildHandoff(verification);
  stages.push({
    id: "handoff",
    status: "passed",
    detail: `Handoff summary available at ${handoff.path}.`,
  });
  return handoff;
}

export async function runMobileChangeOneCommand(
  options: MobileChangeOneCommandOptions,
  deps: MobileChangeOneCommandDependencies,
): Promise<MobileChangeOneCommandResult> {
  const stages: CommandStage[] = [];
  const blockers: CommandBlocker[] = [];

  if (options.mode === "live") {
    const readiness = await deps.runReadiness?.();
    if (!readiness) throw new Error("runReadiness dependency is required for live mode");
    if (readiness.verdict !== "ready_for_live_mobile_change_verification") {
      return blockedResult(options, readiness);
    }
    stages.push({
      id: "readiness",
      status: "passed",
      detail: "Readiness preflight allows live verification to start.",
    });
  }

  const verification = options.mode === "fixture"
    ? await deps.runFixtureVerification?.()
    : await deps.runLiveVerification?.();
  if (!verification) throw new Error(options.mode === "fixture" ? "runFixtureVerification dependency is required" : "runLiveVerification dependency is required");

  const verified = verification.bundle.verdict === "mobile_change_verified";
  stages.push({
    id: "verify",
    status: verified ? "passed" : "failed",
    detail: `Verification verdict: ${verification.bundle.verdict ?? "unknown"}.`,
  });

  if (!verified) {
    const handoff = await maybeBuildHandoff(deps, verification, stages);
    return {
      schema: "mobile-change-one-command/v1",
      runId: options.runId,
      mode: options.mode,
      verdict: "verification_failed",
      proofLevel: options.mode === "fixture" ? "fixture_contract" : "live_failure",
      stages,
      blockers,
      evidence: {
        verification: verification.outputDir,
        handoff: handoff?.path,
      },
      nextAction: nextActionFromVerification(verification),
      boundaries: defaultBoundaries(),
    };
  }

  let proofLevel: MobileChangeOneCommandProofLevel = options.mode === "fixture" ? "fixture_contract" : "live_failure";
  let nextAction = nextActionFromVerification(verification);
  let intake: Awaited<ReturnType<NonNullable<MobileChangeOneCommandDependencies["runIntake"]>>> | undefined;

  if (options.mode === "live") {
    if (!deps.runIntake) throw new Error("runIntake dependency is required for successful live mode");
    intake = await deps.runIntake(verification.outputDir);
    proofLevel = intake.proofLevel;
    stages.push({
      id: "intake",
      status: intake.verdict === "promotable_live_proof_candidate" ? "passed" : "failed",
      detail: `Intake verdict: ${intake.verdict}.`,
    });
    nextAction = intake.nextAction;
    if (intake.verdict !== "promotable_live_proof_candidate") {
      blockers.push(...(intake.blockers ?? []));
      const handoff = await maybeBuildHandoff(deps, verification, stages);
      return {
        schema: "mobile-change-one-command/v1",
        runId: options.runId,
        mode: options.mode,
        verdict: "intake_rejected",
        proofLevel,
        stages,
        blockers,
        evidence: {
          verification: verification.outputDir,
          intake: options.outputDir ?? defaultOutputDir(options.runId),
          handoff: handoff?.path,
        },
        nextAction,
        boundaries: defaultBoundaries(),
      };
    }
  }

  const handoff = await maybeBuildHandoff(deps, verification, stages);
  return {
    schema: "mobile-change-one-command/v1",
    runId: options.runId,
    mode: options.mode,
    verdict: "completed",
    proofLevel,
    stages,
    blockers,
    evidence: {
      verification: verification.outputDir,
      intake: intake ? options.outputDir ?? defaultOutputDir(options.runId) : undefined,
      handoff: handoff?.path,
    },
    nextAction,
    boundaries: defaultBoundaries(),
  };
}

export function renderMobileChangeOneCommandMarkdown(result: MobileChangeOneCommandResult): string {
  const stageLines = result.stages.map((stage) => `- ${stage.id}: \`${stage.status}\` - ${stage.detail}`);
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const evidenceLines = Object.entries(result.evidence)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `- ${key}: \`${value}\``);
  const boundaryLines = result.boundaries.map((boundary) => `- ${boundary}`);
  return [
    "## Mobile change one-command verification",
    "",
    `Verdict: \`${result.verdict}\``,
    `Proof level: \`${result.proofLevel}\``,
    `Run ID: \`${result.runId}\``,
    `Mode: \`${result.mode}\``,
    "",
    "Stages:",
    ...stageLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Evidence:",
    ...evidenceLines,
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

async function writeResultArtifacts(outputDir: string, result: MobileChangeOneCommandResult): Promise<void> {
  const root = repoRoot();
  const absoluteOutputDir = path.isAbsolute(outputDir) ? outputDir : path.join(root, outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  await writeFile(path.join(absoluteOutputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(absoluteOutputDir, "result.md"), renderMobileChangeOneCommandMarkdown(result), "utf8");
}

export async function writeMobileChangeOneCommand(options: MobileChangeOneCommandOptions): Promise<{
  outputDir: string;
  result: MobileChangeOneCommandResult;
}> {
  const outputDir = options.outputDir ?? defaultOutputDir(options.runId);
  const contract = options.contractPath ? await readMobileChangeReadinessContract(options.contractPath) : undefined;
  const result = await runMobileChangeOneCommand({ ...options, outputDir }, defaultDeps(options.runId, outputDir, contract));
  await writeResultArtifacts(outputDir, result);
  return { outputDir, result };
}

async function writeHandoff(outputDir: string, summary: MobileChangeHandoffSummary): Promise<HandoffOutput> {
  const root = repoRoot();
  const handoffPath = path.join(outputDir, "handoff.md");
  const handoffJsonPath = path.join(outputDir, "handoff.json");
  const absoluteHandoffPath = path.join(root, handoffPath);
  await mkdir(path.dirname(absoluteHandoffPath), { recursive: true });
  await writeFile(path.join(root, handoffJsonPath), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(absoluteHandoffPath, renderMobileChangeHandoffMarkdown(summary), "utf8");
  return {
    path: handoffPath,
    nextCommand: summary.nextCommand,
  };
}

export function liveOptionsFromContract(contract: MobileChangeReadinessContract): {
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  runnerProfile: string;
  expectedReadiness: { screenId?: string; appPhase?: string };
} {
  const validation = validateMobileChangeReadinessContract(contract);
  if (!validation.strongProofReady) {
    throw new Error(`Readiness contract is not strong-proof ready: ${validation.warnings.join(",")}`);
  }
  return {
    platform: contract.platform,
    appId: contract.appId,
    appArtifact: contract.appArtifact,
    policyProfile: contract.policyProfile,
    runnerProfile: contract.runnerProfile,
    expectedReadiness: {
      screenId: contract.readiness.screenId,
      appPhase: contract.readiness.appPhase,
    },
  };
}

function liveOptionsFromEnv(runId: string, contract?: MobileChangeReadinessContract): {
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  runnerProfile: string;
  expectedReadiness: { screenId?: string; appPhase?: string };
  deviceId?: string;
} {
  const contractOptions = contract ? liveOptionsFromContract(contract) : undefined;
  return {
    platform: (process.env.M2E_LIVE_MOBILE_CHANGE_PLATFORM as "android" | "ios" | undefined) ?? contractOptions?.platform ?? "android",
    appId: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ID ?? contractOptions?.appId ?? "com.example.mobilechange",
    appArtifact: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT ?? contractOptions?.appArtifact,
    policyProfile: process.env.M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE ?? contractOptions?.policyProfile ?? "interactive",
    runnerProfile: process.env.M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE ?? contractOptions?.runnerProfile ?? "native_android",
    expectedReadiness: {
      screenId: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_SCREEN_ID ?? contractOptions?.expectedReadiness.screenId,
      appPhase: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE ?? contractOptions?.expectedReadiness.appPhase,
    },
    deviceId: process.env.M2E_DEVICE_ID,
  };
}

function applyLiveOptionsToEnv(options: ReturnType<typeof liveOptionsFromEnv>): void {
  process.env.M2E_LIVE_MOBILE_CHANGE_PLATFORM = options.platform;
  process.env.M2E_LIVE_MOBILE_CHANGE_APP_ID = options.appId;
  process.env.M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE = options.policyProfile;
  process.env.M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE = options.runnerProfile;
  if (options.appArtifact) process.env.M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT = options.appArtifact;
  if (options.expectedReadiness.screenId) process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_SCREEN_ID = options.expectedReadiness.screenId;
  if (options.expectedReadiness.appPhase) process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE = options.expectedReadiness.appPhase;
}

function defaultDeps(runId: string, outputDir: string, contract?: MobileChangeReadinessContract): MobileChangeOneCommandDependencies {
  const root = repoRoot();
  return {
    runFixtureVerification: async () => {
      const evidence = buildFixtureEvidence();
      const verificationDir = path.join(outputDir, "fixture");
      const absoluteVerificationDir = path.join(root, verificationDir);
      await mkdir(absoluteVerificationDir, { recursive: true });
      await writeFile(path.join(absoluteVerificationDir, "summary.json"), `${JSON.stringify(evidence.bundle, null, 2)}\n`, "utf8");
      await writeFile(path.join(absoluteVerificationDir, "report.md"), renderMobileChangeVerificationMarkdown(evidence.bundle), "utf8");
      await writeFile(path.join(absoluteVerificationDir, "failure-packet.json"), `${JSON.stringify(evidence.failurePacket, null, 2)}\n`, "utf8");
      await writeFile(path.join(absoluteVerificationDir, "failure-packet.md"), renderFailurePacketMarkdown(evidence.failurePacket), "utf8");
      return {
        outputDir: verificationDir,
        bundle: evidence.bundle,
        failurePacket: evidence.failurePacket,
      };
    },
    runReadiness: async () => {
      const server = createServer();
      const liveOptions = liveOptionsFromEnv(runId, contract);
      const invoke: ToolInvoker = process.env.M2E_LIVE_MOBILE_CHANGE_FORCE_NO_DEVICE === "1"
        ? async (toolName) => toolName === "list_devices"
          ? { status: "success", reasonCode: "OK", data: { android: [], ios: [] } }
          : { status: "skipped", reasonCode: "FORCED_NO_DEVICE" }
        : (toolName, input) => server.invoke(toolName, input);
      return buildMobileChangeDeviceReadinessPreflight({
        runId,
        ...liveOptions,
      }, invoke);
    },
    runLiveVerification: async () => {
      applyLiveOptionsToEnv(liveOptionsFromEnv(runId, contract));
      const proof = await writeLiveMobileChangeVerificationProof();
      return {
        outputDir: path.relative(root, proof.outputDir),
        bundle: proof.result.bundle,
        failurePacket: proof.result.failurePacket,
      };
    },
    runIntake: async (sourceDir) => writeMobileChangeLiveProofIntake({
      sourceDir,
      outputDir: path.join(outputDir, "intake"),
    }),
    buildHandoff: async (verification) => writeHandoff(outputDir, buildMobileChangeHandoffSummary({
      verification: verification.bundle,
      failurePacket: verification.failurePacket,
      sourceVerification: path.join(verification.outputDir, "summary.json"),
      sourceFailurePacket: verification.failurePacket ? path.join(verification.outputDir, "failure-packet.json") : undefined,
    })),
  };
}

function parseArgs(argv: string[]): MobileChangeOneCommandOptions {
  const live = argv.includes("--live");
  const runIdArg = argv.find((arg) => arg.startsWith("--run-id="));
  const outputArg = argv.find((arg) => arg.startsWith("--output-dir="));
  const contractArg = argv.find((arg) => arg.startsWith("--contract="));
  const runId = runIdArg?.slice("--run-id=".length)
    ?? process.env.M2E_VERIFY_MOBILE_CHANGE_RUN_ID
    ?? `mobile-change-one-command-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return {
    mode: live ? "live" : "fixture",
    runId,
    outputDir: outputArg?.slice("--output-dir=".length),
    contractPath: contractArg?.slice("--contract=".length) ?? process.env.M2E_MOBILE_CHANGE_READINESS_CONTRACT,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { outputDir, result } = await writeMobileChangeOneCommand(options);
  console.log(JSON.stringify({
    verdict: result.verdict,
    proofLevel: result.proofLevel,
    outputDir,
    blockers: result.blockers.map((blocker) => blocker.reasonCode),
    nextAction: result.nextAction.kind,
  }, null, 2));
  if (result.verdict === "blocked" && process.env.M2E_VERIFY_MOBILE_CHANGE_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  } else if (result.verdict !== "completed" && result.verdict !== "blocked") {
    process.exitCode = 1;
  }
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
