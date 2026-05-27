import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface ArtifactRef {
  kind?: string;
  path?: string;
}

interface VerificationStep {
  id?: string;
  status?: string;
  reasonCode?: string;
}

interface VerificationBundle {
  schema?: string;
  runId?: string;
  source?: string;
  verdict?: string;
  validationSurface?: {
    platform?: string;
    appId?: string;
    policyProfile?: string;
  };
  readiness?: {
    expectedScreenId?: string;
    expectedAppPhase?: string;
    matched?: boolean;
  };
  workflow?: {
    stepIds?: string[];
    steps?: VerificationStep[];
  };
  evidence?: {
    artifacts?: ArtifactRef[];
  };
  boundaries?: string[];
}

interface FailurePacket {
  schema?: string;
  category?: string;
  reasonCode?: string;
  nextAction?: {
    kind?: string;
  };
}

export interface MobileChangeLiveProofIntake {
  schema: "mobile-change-live-proof-intake/v1";
  sourceDir: string;
  runId: string;
  verdict: "promotable_live_proof_candidate" | "not_promotable_live_proof";
  proofLevel: "physical_or_emulator_candidate" | "no_device_or_controlled_output";
  source: string;
  verificationVerdict: string;
  surface: {
    platform: string;
    appId: string;
    policyProfile: string;
  };
  readiness: {
    expectedScreenId?: string;
    expectedAppPhase?: string;
    matched?: boolean;
  };
  requiredStepIds: string[];
  artifacts: Array<{
    kind: string;
    path: string;
  }>;
  failure?: {
    category: string;
    reasonCode: string;
    nextActionKind: string;
  };
  blockers: Array<{
    reasonCode:
      | "NOT_LIVE_DEVICE_SOURCE"
      | "DEVICE_UNAVAILABLE"
      | "CONTROLLED_OUTPUT"
      | "READINESS_NOT_MATCHED"
      | "REQUIRED_STEP_MISSING";
    detail: string;
  }>;
  nextAction: {
    kind: "promote_live_evidence" | "run_on_connected_device_or_self_hosted_runner" | "inspect_live_proof_output";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

const defaultSourceDir = "docs/showcase/evidence/mobile-change-readiness-failure";
const defaultOutputDir = "docs/showcase/evidence/mobile-change-live-proof-intake";
const intakeJsonPath = `${defaultOutputDir}/intake.json`;
const intakeMarkdownPath = `${defaultOutputDir}/intake.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function compactArtifacts(artifacts: ArtifactRef[] | undefined): Array<{ kind: string; path: string }> {
  const output: Array<{ kind: string; path: string }> = [];
  for (const artifact of artifacts ?? []) {
    if (!artifact.kind || !artifact.path) continue;
    if (!output.some((existing) => existing.kind === artifact.kind && existing.path === artifact.path)) {
      output.push({ kind: artifact.kind, path: artifact.path });
    }
  }
  return output;
}

function hasStep(summary: VerificationBundle, stepId: string): boolean {
  return Boolean(summary.workflow?.stepIds?.includes(stepId));
}

function hasReason(summary: VerificationBundle, reasonCode: string): boolean {
  return Boolean(summary.workflow?.steps?.some((step) => step.reasonCode === reasonCode));
}

function requiredLiveStepsMissing(summary: VerificationBundle): string[] {
  return ["discover-device", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"]
    .filter((stepId) => !hasStep(summary, stepId));
}

function isControlledOutput(summary: VerificationBundle): boolean {
  return Boolean(summary.boundaries?.some((boundary) => /forced|controlled/i.test(boundary)));
}

function nextActionForBlockers(blockers: MobileChangeLiveProofIntake["blockers"]): MobileChangeLiveProofIntake["nextAction"] {
  if (blockers.length === 0) {
    return {
      kind: "promote_live_evidence",
      command: "mkdir -p docs/showcase/evidence/mobile-change-live && cp -R <live-output-dir> docs/showcase/evidence/mobile-change-live/",
      reason: "The live output looks promotable; copy the source proof directory into tracked showcase evidence and review it before committing.",
    };
  }
  if (blockers.some((blocker) => blocker.reasonCode === "DEVICE_UNAVAILABLE")) {
    return {
      kind: "run_on_connected_device_or_self_hosted_runner",
      command: "pnpm run generate:mobile-change-device-readiness && pnpm run proof:mobile-change-verification:live",
      reason: "This output came from a no-device path; rerun on a connected device or self-hosted runner before promotion.",
    };
  }
  return {
    kind: "inspect_live_proof_output",
    command: "pnpm run intake:mobile-change-live-proof -- <live-output-dir>",
    reason: "The proof output is incomplete or not a live-device source; inspect the runner output before promotion.",
  };
}

export function buildMobileChangeLiveProofIntake(input: {
  sourceDir: string;
  summary: VerificationBundle;
  failurePacket?: FailurePacket;
}): MobileChangeLiveProofIntake {
  const blockers: MobileChangeLiveProofIntake["blockers"] = [];
  const missingSteps = requiredLiveStepsMissing(input.summary);

  if (input.summary.source !== "live_device") {
    blockers.push({
      reasonCode: "NOT_LIVE_DEVICE_SOURCE",
      detail: `Expected source live_device, got ${input.summary.source ?? "unknown"}.`,
    });
  }
  if (input.summary.verdict === "device_unavailable" || hasReason(input.summary, "DEVICE_UNAVAILABLE")) {
    blockers.push({
      reasonCode: "DEVICE_UNAVAILABLE",
      detail: "The live runner did not discover an eligible device.",
    });
  }
  if (isControlledOutput(input.summary)) {
    blockers.push({
      reasonCode: "CONTROLLED_OUTPUT",
      detail: "The summary boundary identifies this output as forced or controlled rather than physical-device proof.",
    });
  }
  if (input.summary.readiness?.matched === false && input.summary.verdict === "mobile_change_verified") {
    blockers.push({
      reasonCode: "READINESS_NOT_MATCHED",
      detail: "The proof claims verification success while readiness did not match.",
    });
  }
  for (const stepId of missingSteps) {
    blockers.push({
      reasonCode: "REQUIRED_STEP_MISSING",
      detail: `Missing required live proof step: ${stepId}.`,
    });
  }

  const proofLevel = blockers.some((blocker) => blocker.reasonCode === "DEVICE_UNAVAILABLE" || blocker.reasonCode === "NOT_LIVE_DEVICE_SOURCE" || blocker.reasonCode === "CONTROLLED_OUTPUT")
    ? "no_device_or_controlled_output"
    : "physical_or_emulator_candidate";

  return {
    schema: "mobile-change-live-proof-intake/v1",
    sourceDir: input.sourceDir,
    runId: input.summary.runId ?? "unknown",
    verdict: blockers.length === 0 ? "promotable_live_proof_candidate" : "not_promotable_live_proof",
    proofLevel,
    source: input.summary.source ?? "unknown",
    verificationVerdict: input.summary.verdict ?? "unknown",
    surface: {
      platform: input.summary.validationSurface?.platform ?? "unknown",
      appId: input.summary.validationSurface?.appId ?? "unknown",
      policyProfile: input.summary.validationSurface?.policyProfile ?? "unknown",
    },
    readiness: {
      expectedScreenId: input.summary.readiness?.expectedScreenId,
      expectedAppPhase: input.summary.readiness?.expectedAppPhase,
      matched: input.summary.readiness?.matched,
    },
    requiredStepIds: ["discover-device", "start-session", "launch-app", "inspect-readiness", "check-readiness", "close-session"],
    artifacts: compactArtifacts(input.summary.evidence?.artifacts),
    failure: input.failurePacket
      ? {
          category: input.failurePacket.category ?? "unknown",
          reasonCode: input.failurePacket.reasonCode ?? "unknown",
          nextActionKind: input.failurePacket.nextAction?.kind ?? "unknown",
        }
      : undefined,
    blockers,
    nextAction: nextActionForBlockers(blockers),
    boundaries: [
      "This intake validates a live runner output directory before promotion; it does not execute a device by itself.",
      "Only live_device summaries without no-device blockers can be treated as promotable live proof candidates.",
      "Promotion still requires human review of artifacts before expanding public support claims.",
    ],
  };
}

export function renderMobileChangeLiveProofIntakeMarkdown(intake: MobileChangeLiveProofIntake): string {
  const artifactLines = intake.artifacts.map((artifact) => `- ${artifact.kind}: \`${artifact.path}\``);
  const blockerLines = intake.blockers.length > 0
    ? intake.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const boundaryLines = intake.boundaries.map((boundary) => `- ${boundary}`);
  const failureLines = intake.failure
    ? [
        "Failure:",
        `- Category: \`${intake.failure.category}\``,
        `- Reason code: \`${intake.failure.reasonCode}\``,
        `- Next action: \`${intake.failure.nextActionKind}\``,
        "",
      ]
    : ["Failure:", "- none", ""];

  return [
    "## Mobile change live proof intake",
    "",
    `Verdict: \`${intake.verdict}\``,
    `Proof level: \`${intake.proofLevel}\``,
    `Run ID: \`${intake.runId}\``,
    `Source dir: \`${intake.sourceDir}\``,
    "",
    "Surface:",
    `- Platform: \`${intake.surface.platform}\``,
    `- App: \`${intake.surface.appId}\``,
    `- Policy profile: \`${intake.surface.policyProfile}\``,
    "",
    "Readiness:",
    `- Expected screen: \`${intake.readiness.expectedScreenId ?? "not-specified"}\``,
    `- Expected app phase: \`${intake.readiness.expectedAppPhase ?? "not-specified"}\``,
    `- Matched: \`${intake.readiness.matched ?? "unknown"}\``,
    "",
    ...failureLines,
    "Blockers:",
    ...blockerLines,
    "",
    "Artifacts:",
    ...artifactLines,
    "",
    "Next action:",
    `- \`${intake.nextAction.kind}\`: ${intake.nextAction.reason}`,
    `- Command: \`${intake.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

export async function writeMobileChangeLiveProofIntake(options: {
  sourceDir?: string;
  outputDir?: string;
  check?: boolean;
}): Promise<MobileChangeLiveProofIntake> {
  const root = repoRoot();
  const sourceDir = options.sourceDir ?? process.argv[2] ?? defaultSourceDir;
  const outputDir = options.outputDir ?? defaultOutputDir;
  const absoluteSourceDir = path.isAbsolute(sourceDir) ? sourceDir : path.join(root, sourceDir);
  const summary = await readJson<VerificationBundle>(path.join(absoluteSourceDir, "summary.json"));
  let failurePacket: FailurePacket | undefined;
  try {
    failurePacket = await readJson<FailurePacket>(path.join(absoluteSourceDir, "failure-packet.json"));
  } catch {
    failurePacket = undefined;
  }

  const intake = buildMobileChangeLiveProofIntake({
    sourceDir,
    summary,
    failurePacket,
  });
  const relativeJsonPath = `${outputDir}/intake.json`;
  const relativeMarkdownPath = `${outputDir}/intake.md`;
  const json = `${JSON.stringify(intake, null, 2)}\n`;
  const markdown = renderMobileChangeLiveProofIntakeMarkdown(intake);

  if (options.check) {
    assert.equal(await readFile(path.join(root, relativeJsonPath), "utf8"), json, `${relativeJsonPath} is out of date`);
    assert.equal(await readFile(path.join(root, relativeMarkdownPath), "utf8"), markdown, `${relativeMarkdownPath} is out of date`);
  } else {
    await mkdir(path.join(root, outputDir), { recursive: true });
    await writeFile(path.join(root, relativeJsonPath), json, "utf8");
    await writeFile(path.join(root, relativeMarkdownPath), markdown, "utf8");
  }
  return intake;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const sourceArg = process.argv.find((arg, index) => index > 1 && arg !== "--check");
  const intake = await writeMobileChangeLiveProofIntake({
    sourceDir: sourceArg,
    check,
  });
  console.log(check ? "Mobile change live proof intake is up to date." : `Mobile change live proof intake written to ${intakeJsonPath} and ${intakeMarkdownPath}.`);
  console.log(JSON.stringify({
    verdict: intake.verdict,
    proofLevel: intake.proofLevel,
    blockers: intake.blockers.map((blocker) => blocker.reasonCode),
    nextAction: intake.nextAction.kind,
  }, null, 2));
  if (intake.verdict !== "promotable_live_proof_candidate" && process.env.M2E_LIVE_PROOF_INTAKE_ALLOW_BLOCKED !== "1") {
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
