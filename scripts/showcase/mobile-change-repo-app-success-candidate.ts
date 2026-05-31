import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  readMobileChangeReadinessContract,
  validateMobileChangeReadinessContract,
  type MobileChangeReadinessContract,
} from "./mobile-change-readiness-contract.ts";

type CandidateVerdict =
  | "blocked_before_live_success"
  | "live_success_pending_intake"
  | "repo_app_live_success_promoted"
  | "not_promotable_repo_app_output";

interface CandidateBlocker {
  reasonCode: string;
  detail: string;
}

interface CandidateVerification {
  verdict: "completed" | "blocked" | "verification_failed" | "intake_rejected";
  proofLevel: string;
  blockers?: CandidateBlocker[];
  evidence?: {
    readiness?: string;
    verification?: string;
    intake?: string;
    handoff?: string;
  };
}

interface CandidateIntake {
  verdict: "promotable_live_proof_candidate" | "not_promotable_live_proof";
  proofLevel: "physical_or_emulator_candidate" | "no_device_or_controlled_output";
}

export interface RepoOwnedAppSuccessCandidate {
  schema: "mobile-change-repo-app-success-candidate/v1";
  runId: string;
  verdict: CandidateVerdict;
  successEvidencePromoted: boolean;
  repoApp: {
    ownership: "repo_owned";
    platform: "android";
    appId: string;
    artifact: {
      path: string;
      exists: boolean;
    };
  };
  contract: {
    path?: string;
    strongProofReady: boolean;
    warnings: string[];
    readiness: MobileChangeReadinessContract["readiness"];
  };
  verification: CandidateVerification;
  intake?: CandidateIntake;
  blockers: CandidateBlocker[];
  nextAction: {
    kind: "connect_device_and_run_repo_app_live_proof" | "run_live_proof_intake" | "attach_repo_app_success_evidence" | "inspect_repo_app_output";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

export interface RepoOwnedAppSuccessCandidateValidation {
  promotable: boolean;
  warnings: string[];
}

const defaultContractPath = "configs/readiness/demo-android-app.android.json";
const defaultOutputDir = "docs/showcase/evidence/mobile-change-repo-app-success-candidate";
const defaultRunId = "repo-owned-demo-android-app-2026-05-31";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function pathExists(relativePath: string | undefined): Promise<boolean> {
  if (!relativePath) return false;
  try {
    await access(path.resolve(repoRoot(), relativePath));
    return true;
  } catch {
    return false;
  }
}

function defaultBoundaries(): string[] {
  return [
    "This candidate is tied to the repo-owned demo Android app and must not be generalized to arbitrary apps.",
    "Blocked no-device output proves the gate and diagnostics, not app-under-test success.",
    "Repo-owned app success can be promoted only after live verification completes and intake accepts physical/emulator evidence.",
  ];
}

function nextActionForCandidate(candidate: {
  verdict: CandidateVerdict;
  runId: string;
  contractPath?: string;
}): RepoOwnedAppSuccessCandidate["nextAction"] {
  const contractArg = candidate.contractPath ? ` --contract=${candidate.contractPath}` : "";
  if (candidate.verdict === "blocked_before_live_success") {
    return {
      kind: "connect_device_and_run_repo_app_live_proof",
      command: `pnpm run verify:mobile-change -- --live${contractArg} --run-id=${candidate.runId}`,
      reason: "Connect an authorized Android device or explicitly labeled emulator, then rerun the repo-owned app live proof.",
    };
  }
  if (candidate.verdict === "live_success_pending_intake") {
    return {
      kind: "run_live_proof_intake",
      command: "pnpm run intake:mobile-change-live-proof -- <repo-app-live-output-dir>",
      reason: "The live run completed, but the output still needs intake before tracked success promotion.",
    };
  }
  if (candidate.verdict === "repo_app_live_success_promoted") {
    return {
      kind: "attach_repo_app_success_evidence",
      command: "pnpm run validate:mobile-change-repo-app-success-candidate",
      reason: "Attach the accepted repo-owned app success evidence to review or release notes.",
    };
  }
  return {
    kind: "inspect_repo_app_output",
    command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
    reason: "Inspect the live output and blockers before retrying or changing the app contract.",
  };
}

function verdictForInput(input: {
  verification: CandidateVerification;
  intake?: CandidateIntake;
}): CandidateVerdict {
  if (input.verification.verdict === "blocked") return "blocked_before_live_success";
  if (
    input.verification.verdict === "completed"
    && input.verification.proofLevel === "physical_or_emulator_candidate"
    && input.intake?.verdict === "promotable_live_proof_candidate"
    && input.intake.proofLevel === "physical_or_emulator_candidate"
  ) {
    return "repo_app_live_success_promoted";
  }
  if (input.verification.verdict === "completed" && input.verification.proofLevel === "physical_or_emulator_candidate") {
    return "live_success_pending_intake";
  }
  return "not_promotable_repo_app_output";
}

export async function buildRepoOwnedAppSuccessCandidate(input: {
  runId: string;
  contract: MobileChangeReadinessContract;
  contractPath?: string;
  verification: CandidateVerification;
  intake?: CandidateIntake;
}): Promise<RepoOwnedAppSuccessCandidate> {
  assert.equal(input.contract.platform, "android", "repo-owned success candidate currently supports Android contracts only");
  const contractValidation = validateMobileChangeReadinessContract(input.contract);
  const artifactExists = await pathExists(input.contract.appArtifact);
  const blockers = [...(input.verification.blockers ?? [])];
  if (!artifactExists) {
    blockers.push({
      reasonCode: "APP_ARTIFACT_UNAVAILABLE",
      detail: `Repo-owned app artifact is missing: ${input.contract.appArtifact ?? "not-specified"}.`,
    });
  }
  if (!contractValidation.strongProofReady) {
    blockers.push({
      reasonCode: "READINESS_CONTRACT_NOT_STRONG",
      detail: `Readiness contract is not strong proof ready: ${contractValidation.warnings.join(",")}`,
    });
  }

  const verdict = blockers.length > 0
    ? input.verification.verdict === "blocked" ? "blocked_before_live_success" : "not_promotable_repo_app_output"
    : verdictForInput(input);
  const successEvidencePromoted = verdict === "repo_app_live_success_promoted";

  return {
    schema: "mobile-change-repo-app-success-candidate/v1",
    runId: input.runId,
    verdict,
    successEvidencePromoted,
    repoApp: {
      ownership: "repo_owned",
      platform: "android",
      appId: input.contract.appId,
      artifact: {
        path: input.contract.appArtifact ?? "",
        exists: artifactExists,
      },
    },
    contract: {
      path: input.contractPath,
      strongProofReady: contractValidation.strongProofReady,
      warnings: contractValidation.warnings,
      readiness: input.contract.readiness,
    },
    verification: input.verification,
    intake: input.intake,
    blockers,
    nextAction: nextActionForCandidate({ verdict, runId: input.runId, contractPath: input.contractPath }),
    boundaries: defaultBoundaries(),
  };
}

export function validateRepoOwnedAppSuccessCandidate(candidate: RepoOwnedAppSuccessCandidate): RepoOwnedAppSuccessCandidateValidation {
  assert.equal(candidate.schema, "mobile-change-repo-app-success-candidate/v1");
  assert.equal(candidate.repoApp.ownership, "repo_owned");
  assert.equal(candidate.repoApp.platform, "android");
  assert.ok(candidate.repoApp.appId.length > 0, "repo app id must be provided");
  assert.ok(candidate.repoApp.artifact.path.length > 0, "repo app artifact path must be provided");
  assert.equal(candidate.repoApp.artifact.exists, true, "repo app artifact must exist before candidate evidence is valid");
  assert.equal(candidate.contract.strongProofReady, true, "repo app readiness contract must be strong-proof ready");
  assert.ok(candidate.contract.readiness.screenId || candidate.contract.readiness.appPhase || candidate.contract.readiness.selector?.value, "repo app readiness signal must be deterministic");

  if (candidate.successEvidencePromoted || candidate.verdict === "repo_app_live_success_promoted") {
    assert.equal(candidate.verification.verdict, "completed", "promoted repo app success requires completed verification");
    assert.equal(candidate.verification.proofLevel, "physical_or_emulator_candidate", "promoted repo app success requires physical/emulator proof level");
    assert.equal(candidate.intake?.verdict, "promotable_live_proof_candidate", "promoted repo app success requires promotable intake");
    assert.equal(candidate.intake?.proofLevel, "physical_or_emulator_candidate", "promoted repo app success requires physical/emulator intake proof");
    assert.equal(candidate.blockers.length, 0, "promoted repo app success must not have blockers");
    return { promotable: true, warnings: [] };
  }

  assert.equal(candidate.successEvidencePromoted, false, "non-promoted repo app candidate must not set successEvidencePromoted");
  return {
    promotable: false,
    warnings: candidate.verdict === "blocked_before_live_success"
      ? ["repo_app_success_blocked_until_device_or_emulator_available"]
      : ["repo_app_success_not_promoted"],
  };
}

export function renderRepoOwnedAppSuccessCandidateMarkdown(candidate: RepoOwnedAppSuccessCandidate): string {
  const blockerLines = candidate.blockers.length > 0
    ? candidate.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const evidenceLines = Object.entries(candidate.verification.evidence ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `- ${key}: \`${value}\``);
  const contractSignal = candidate.contract.readiness.selector
    ? `${candidate.contract.readiness.selector.strategy}:${candidate.contract.readiness.selector.value}`
    : candidate.contract.readiness.screenId ?? candidate.contract.readiness.appPhase ?? "not-specified";
  return [
    "## Repo-owned app success candidate",
    "",
    `Verdict: \`${candidate.verdict}\``,
    `Success evidence promoted: \`${candidate.successEvidencePromoted}\``,
    `Run ID: \`${candidate.runId}\``,
    "",
    "Repo app:",
    `- App ID: \`${candidate.repoApp.appId}\``,
    `- Artifact: \`${candidate.repoApp.artifact.path}\``,
    `- Artifact exists: \`${candidate.repoApp.artifact.exists}\``,
    "",
    "Readiness contract:",
    `- Path: \`${candidate.contract.path ?? "not-specified"}\``,
    `- Strong proof ready: \`${candidate.contract.strongProofReady}\``,
    `- Deterministic signal: \`${contractSignal}\``,
    "",
    "Verification:",
    `- Verdict: \`${candidate.verification.verdict}\``,
    `- Proof level: \`${candidate.verification.proofLevel}\``,
    "",
    "Evidence:",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- none"]),
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Next action:",
    `- \`${candidate.nextAction.kind}\`: ${candidate.nextAction.reason}`,
    `- Command: \`${candidate.nextAction.command}\``,
    "",
    "Boundaries:",
    ...candidate.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-repo-app-success-candidate`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function writeCandidateArtifacts(input: {
  outputDir: string;
  candidate: RepoOwnedAppSuccessCandidate;
  check: boolean;
}): Promise<void> {
  validateRepoOwnedAppSuccessCandidate(input.candidate);
  await writeOrCheck(`${input.outputDir}/candidate.json`, `${JSON.stringify(input.candidate, null, 2)}\n`, input.check);
  await writeOrCheck(`${input.outputDir}/candidate.md`, renderRepoOwnedAppSuccessCandidateMarkdown(input.candidate), input.check);
}

async function buildDefaultCandidate(input: {
  runId: string;
  contractPath: string;
}): Promise<RepoOwnedAppSuccessCandidate> {
  const contract = await readMobileChangeReadinessContract(input.contractPath);
  return buildRepoOwnedAppSuccessCandidate({
    runId: input.runId,
    contract,
    contractPath: input.contractPath,
    verification: {
      verdict: "blocked",
      proofLevel: "blocked_before_live",
      blockers: [
        {
          reasonCode: "DEVICE_UNAVAILABLE",
          detail: "No connected Android device or explicitly labeled emulator was visible when this repo-owned app success candidate was generated.",
        },
      ],
      evidence: {
        readiness: "docs/showcase/evidence/mobile-change-device-readiness",
      },
    },
  });
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const runIdArg = process.argv.find((arg) => arg.startsWith("--run-id="));
  const contractArg = process.argv.find((arg) => arg.startsWith("--contract="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output-dir="));
  const runId = runIdArg?.slice("--run-id=".length) ?? defaultRunId;
  const contractPath = contractArg?.slice("--contract=".length) ?? defaultContractPath;
  const outputDir = outputArg?.slice("--output-dir=".length) ?? defaultOutputDir;
  const candidate = await buildDefaultCandidate({ runId, contractPath });
  const validation = validateRepoOwnedAppSuccessCandidate(candidate);
  await writeCandidateArtifacts({ outputDir, candidate, check });
  console.log(JSON.stringify({
    verdict: candidate.verdict,
    promotable: validation.promotable,
    outputDir,
    blockers: candidate.blockers.map((blocker) => blocker.reasonCode),
    nextAction: candidate.nextAction.kind,
  }, null, 2));
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
