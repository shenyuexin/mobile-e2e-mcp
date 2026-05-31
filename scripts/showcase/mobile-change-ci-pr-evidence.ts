import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ReviewStatus = "passed" | "blocked" | "failed" | "needs_review";
type CiConclusion = "success" | "neutral" | "failure";

interface SourceBlocker {
  reasonCode: string;
  detail: string;
}

interface SourceNextAction {
  kind: string;
  command: string;
  reason: string;
}

export interface MobileChangeCiPrEvidenceSource {
  kind:
    | "one_command_result"
    | "repo_app_success_candidate"
    | "live_proof_intake"
    | "handoff";
  path: string;
  verdict: string;
  proofLevel: string;
  successEvidencePromoted?: boolean;
  blockers: SourceBlocker[];
  nextAction: SourceNextAction;
}

export interface MobileChangeCiPrEvidence {
  schema: "mobile-change-ci-pr-evidence/v1";
  runId: string;
  reviewStatus: ReviewStatus;
  proofLevel: string;
  sources: MobileChangeCiPrEvidenceSource[];
  blockers: SourceBlocker[];
  ci: {
    conclusion: CiConclusion;
    artifactName: string;
    uploadPath: string;
    requiredByDefault: false;
  };
  prSummary: string;
  nextAction: SourceNextAction;
  boundaries: string[];
}

export interface MobileChangeCiPrEvidenceValidation {
  ok: boolean;
  reviewStatus: ReviewStatus;
  ciConclusion: CiConclusion;
}

interface RepoOwnedAppCandidate {
  runId?: string;
  verdict?: string;
  successEvidencePromoted?: boolean;
  verification?: {
    proofLevel?: string;
  };
  intake?: {
    proofLevel?: string;
  };
  blockers?: SourceBlocker[];
  nextAction?: SourceNextAction;
}

const defaultRunId = "mobile-change-ci-pr-evidence-2026-05-31";
const defaultOutputDir = "docs/showcase/evidence/mobile-change-ci-pr-evidence";
const defaultRepoAppCandidatePath = "docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function defaultBoundaries(): string[] {
  return [
    "This artifact is designed for CI upload and PR review; it does not execute a device by itself.",
    "Blocked and no-device outputs use neutral CI conclusions and must not be treated as successful app verification.",
    "A success CI conclusion requires an intake-backed physical/emulator proof candidate with no blockers.",
  ];
}

function chooseProofLevel(sources: MobileChangeCiPrEvidenceSource[]): string {
  if (sources.some((source) => source.proofLevel === "blocked_before_live" || source.verdict.includes("blocked"))) {
    return "blocked_before_live";
  }
  if (sources.some((source) => source.proofLevel === "live_failure" || source.verdict.includes("failed"))) {
    return "live_failure";
  }
  if (sources.every((source) => source.proofLevel === "physical_or_emulator_candidate" && source.successEvidencePromoted === true)) {
    return "physical_or_emulator_candidate";
  }
  if (sources.some((source) => source.proofLevel === "no_device_or_controlled_output")) {
    return "no_device_or_controlled_output";
  }
  return sources[0]?.proofLevel ?? "unknown";
}

function chooseReviewStatus(sources: MobileChangeCiPrEvidenceSource[], blockers: SourceBlocker[], proofLevel: string): ReviewStatus {
  if (blockers.length > 0 || proofLevel === "blocked_before_live") return "blocked";
  if (sources.some((source) => source.verdict.includes("failed") || source.verdict === "intake_rejected")) return "failed";
  if (proofLevel === "physical_or_emulator_candidate" && sources.every((source) => source.successEvidencePromoted === true)) return "passed";
  return "needs_review";
}

function conclusionForStatus(status: ReviewStatus): CiConclusion {
  if (status === "passed") return "success";
  if (status === "failed") return "failure";
  return "neutral";
}

function chooseNextAction(sources: MobileChangeCiPrEvidenceSource[], status: ReviewStatus): SourceNextAction {
  if (status === "passed") {
    return {
      kind: "attach_mobile_change_ci_evidence",
      command: "pnpm run validate:mobile-change-ci-pr-evidence",
      reason: "Attach the generated CI/PR evidence artifact to review.",
    };
  }
  return sources[0]?.nextAction ?? {
    kind: "inspect_mobile_change_ci_evidence",
    command: "pnpm run validate:mobile-change-ci-pr-evidence",
    reason: "Inspect the mobile change CI evidence artifact.",
  };
}

export function renderMobileChangeCiPrSummary(evidence: Omit<MobileChangeCiPrEvidence, "prSummary">): string {
  const blockerLines = evidence.blockers.length > 0
    ? evidence.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const sourceLines = evidence.sources.map((source) => `- ${source.kind}: verdict \`${source.verdict}\`, proof \`${source.proofLevel}\`, source \`${source.path}\``);
  return [
    "## Mobile Change CI Evidence",
    "",
    `Review status: \`${evidence.reviewStatus}\``,
    `CI conclusion: \`${evidence.ci.conclusion}\``,
    `Proof level: \`${evidence.proofLevel}\``,
    `Run ID: \`${evidence.runId}\``,
    "",
    "Sources:",
    ...sourceLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Next action:",
    `- \`${evidence.nextAction.kind}\`: ${evidence.nextAction.reason}`,
    `- Command: \`${evidence.nextAction.command}\``,
    "",
    "Boundaries:",
    ...evidence.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

export function buildMobileChangeCiPrEvidence(input: {
  runId: string;
  sources: MobileChangeCiPrEvidenceSource[];
  artifactName?: string;
  uploadPath?: string;
}): MobileChangeCiPrEvidence {
  assert.ok(input.sources.length > 0, "at least one mobile change evidence source is required");
  const blockers = input.sources.flatMap((source) => source.blockers);
  const proofLevel = chooseProofLevel(input.sources);
  const reviewStatus = chooseReviewStatus(input.sources, blockers, proofLevel);
  const ciConclusion = conclusionForStatus(reviewStatus);
  const withoutSummary = {
    schema: "mobile-change-ci-pr-evidence/v1" as const,
    runId: input.runId,
    reviewStatus,
    proofLevel,
    sources: input.sources,
    blockers,
    ci: {
      conclusion: ciConclusion,
      artifactName: input.artifactName ?? "ci-mobile-change-pr-evidence",
      uploadPath: input.uploadPath ?? defaultOutputDir,
      requiredByDefault: false as const,
    },
    nextAction: chooseNextAction(input.sources, reviewStatus),
    boundaries: defaultBoundaries(),
  };
  return {
    ...withoutSummary,
    prSummary: renderMobileChangeCiPrSummary(withoutSummary),
  };
}

export function validateMobileChangeCiPrEvidence(evidence: MobileChangeCiPrEvidence): MobileChangeCiPrEvidenceValidation {
  assert.equal(evidence.schema, "mobile-change-ci-pr-evidence/v1");
  assert.ok(evidence.sources.length > 0, "CI/PR evidence requires at least one source");
  assert.equal(evidence.ci.requiredByDefault, false, "mobile change CI evidence must remain optional by default");
  assert.ok(evidence.prSummary.includes(evidence.proofLevel), "PR summary must include the proof level");

  const hasBlockedProof = evidence.sources.some((source) => source.proofLevel === "blocked_before_live" || source.verdict.includes("blocked")) || evidence.proofLevel === "blocked_before_live";
  if (hasBlockedProof) {
    assert.notEqual(evidence.ci.conclusion, "success", "blocked evidence cannot have a success CI conclusion");
    assert.equal(evidence.reviewStatus, "blocked", "blocked evidence must keep a blocked review status");
  }

  if (evidence.ci.conclusion === "success" || evidence.reviewStatus === "passed") {
    assert.equal(evidence.reviewStatus, "passed", "success CI conclusion requires passed review status");
    assert.equal(evidence.proofLevel, "physical_or_emulator_candidate", "success CI conclusion requires physical/emulator proof");
    assert.equal(evidence.blockers.length, 0, "success CI conclusion must not have blockers");
    assert.ok(evidence.sources.every((source) => source.successEvidencePromoted === true), "success CI conclusion requires promoted evidence sources");
  }

  if (evidence.reviewStatus === "failed") {
    assert.equal(evidence.ci.conclusion, "failure", "failed review status requires failure CI conclusion");
  }

  return {
    ok: true,
    reviewStatus: evidence.reviewStatus,
    ciConclusion: evidence.ci.conclusion,
  };
}

export function sourceFromRepoOwnedAppCandidate(input: {
  path: string;
  candidate: RepoOwnedAppCandidate;
}): MobileChangeCiPrEvidenceSource {
  const promoted = input.candidate.successEvidencePromoted === true;
  const proofLevel = promoted
    ? input.candidate.intake?.proofLevel ?? "physical_or_emulator_candidate"
    : input.candidate.verdict?.includes("blocked")
      ? "blocked_before_live"
      : input.candidate.verification?.proofLevel ?? "unknown";
  return {
    kind: "repo_app_success_candidate",
    path: input.path,
    verdict: input.candidate.verdict ?? "unknown",
    proofLevel,
    successEvidencePromoted: promoted,
    blockers: input.candidate.blockers ?? [],
    nextAction: input.candidate.nextAction ?? {
      kind: "inspect_repo_app_success_candidate",
      command: "pnpm run validate:mobile-change-repo-app-success-candidate",
      reason: "Inspect the repo-owned app success candidate.",
    },
  };
}

async function buildDefaultEvidence(input: {
  runId: string;
  sourceCandidatePath: string;
  outputDir: string;
}): Promise<MobileChangeCiPrEvidence> {
  const candidate = await readJson<RepoOwnedAppCandidate>(input.sourceCandidatePath);
  return buildMobileChangeCiPrEvidence({
    runId: input.runId,
    sources: [sourceFromRepoOwnedAppCandidate({
      path: input.sourceCandidatePath,
      candidate,
    })],
    uploadPath: input.outputDir,
  });
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-ci-pr-evidence`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function writeEvidence(input: {
  outputDir: string;
  evidence: MobileChangeCiPrEvidence;
  check: boolean;
}): Promise<void> {
  validateMobileChangeCiPrEvidence(input.evidence);
  await writeOrCheck(`${input.outputDir}/summary.json`, `${JSON.stringify(input.evidence, null, 2)}\n`, input.check);
  await writeOrCheck(`${input.outputDir}/pr-summary.md`, input.evidence.prSummary, input.check);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const runIdArg = process.argv.find((arg) => arg.startsWith("--run-id="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output-dir="));
  const sourceArg = process.argv.find((arg) => arg.startsWith("--source-candidate="));
  const outputDir = outputArg?.slice("--output-dir=".length) ?? defaultOutputDir;
  const evidence = await buildDefaultEvidence({
    runId: runIdArg?.slice("--run-id=".length) ?? defaultRunId,
    sourceCandidatePath: sourceArg?.slice("--source-candidate=".length) ?? defaultRepoAppCandidatePath,
    outputDir,
  });
  const validation = validateMobileChangeCiPrEvidence(evidence);
  await writeEvidence({ outputDir, evidence, check });
  console.log(JSON.stringify({
    reviewStatus: validation.reviewStatus,
    ciConclusion: validation.ciConclusion,
    proofLevel: evidence.proofLevel,
    outputDir,
    artifactName: evidence.ci.artifactName,
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
