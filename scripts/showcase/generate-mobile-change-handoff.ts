import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface ArtifactRef {
  kind?: string;
  path?: string;
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
  };
  evidence?: {
    artifacts?: ArtifactRef[];
  };
  nextAction?: {
    kind?: string;
    command?: string;
    reason?: string;
  };
  boundaries?: string[];
}

interface FailurePacket {
  schema?: string;
  runId?: string;
  source?: string;
  category?: string;
  confidence?: string;
  failedStep?: {
    id?: string;
    tool?: string;
    status?: string;
    reasonCode?: string;
  };
  reasonCode?: string;
  evidence?: {
    artifacts?: ArtifactRef[];
  };
  nextAction?: {
    kind?: string;
    reason?: string;
  };
  boundaries?: string[];
}

export interface MobileChangeHandoffSummary {
  schema: "mobile-change-handoff/v1";
  intendedSurface: "pull_request_or_agent_handoff";
  title: string;
  sourceVerification: string;
  sourceFailurePacket?: string;
  runId: string;
  source: string;
  verdict: string;
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
  workflowStepIds: string[];
  artifacts: Array<{
    kind: string;
    path: string;
  }>;
  nextAction: {
    kind: string;
    reason: string;
  };
  nextCommand: string;
  failure?: {
    category: string;
    reasonCode: string;
    confidence: string;
    failedStepId: string;
    nextActionKind: string;
    nextActionReason: string;
  };
  boundaries: string[];
}

const sourceVerificationPath = "docs/showcase/evidence/mobile-change-readiness-failure/summary.json";
const sourceFailurePacketPath = "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json";
const handoffJsonPath = "docs/showcase/evidence/mobile-change-readiness-failure/handoff.json";
const handoffMarkdownPath = "docs/showcase/evidence/mobile-change-readiness-failure/handoff.md";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function compactArtifacts(...artifactGroups: Array<ArtifactRef[] | undefined>): Array<{ kind: string; path: string }> {
  const output: Array<{ kind: string; path: string }> = [];
  for (const group of artifactGroups) {
    for (const artifact of group ?? []) {
      if (!artifact.kind || !artifact.path) continue;
      if (!output.some((existing) => existing.kind === artifact.kind && existing.path === artifact.path)) {
        output.push({ kind: artifact.kind, path: artifact.path });
      }
    }
  }
  return output;
}

export function buildMobileChangeHandoffSummary(input: {
  verification: VerificationBundle;
  failurePacket?: FailurePacket;
  sourceVerification?: string;
  sourceFailurePacket?: string;
}): MobileChangeHandoffSummary {
  const verification = input.verification;
  const failurePacket = input.failurePacket;
  const nextCommand = failurePacket
    ? "pnpm run validate:mobile-change-readiness-failure"
    : verification.nextAction?.command ?? "pnpm run validate:mobile-change-verification";

  return {
    schema: "mobile-change-handoff/v1",
    intendedSurface: "pull_request_or_agent_handoff",
    title: "Mobile change verification handoff",
    sourceVerification: input.sourceVerification ?? sourceVerificationPath,
    sourceFailurePacket: failurePacket ? input.sourceFailurePacket ?? sourceFailurePacketPath : undefined,
    runId: verification.runId ?? "unknown",
    source: verification.source ?? "unknown",
    verdict: verification.verdict ?? "unknown",
    surface: {
      platform: verification.validationSurface?.platform ?? "unknown",
      appId: verification.validationSurface?.appId ?? "unknown",
      policyProfile: verification.validationSurface?.policyProfile ?? "unknown",
    },
    readiness: {
      expectedScreenId: verification.readiness?.expectedScreenId,
      expectedAppPhase: verification.readiness?.expectedAppPhase,
      matched: verification.readiness?.matched,
    },
    workflowStepIds: verification.workflow?.stepIds ?? [],
    artifacts: compactArtifacts(verification.evidence?.artifacts, failurePacket?.evidence?.artifacts),
    nextAction: {
      kind: failurePacket?.nextAction?.kind ?? verification.nextAction?.kind ?? "unknown",
      reason: failurePacket?.nextAction?.reason ?? verification.nextAction?.reason ?? "No next action provided.",
    },
    nextCommand,
    failure: failurePacket
      ? {
          category: failurePacket.category ?? "unknown",
          reasonCode: failurePacket.reasonCode ?? "unknown",
          confidence: failurePacket.confidence ?? "unknown",
          failedStepId: failurePacket.failedStep?.id ?? "unknown",
          nextActionKind: failurePacket.nextAction?.kind ?? "unknown",
          nextActionReason: failurePacket.nextAction?.reason ?? "No failure next action provided.",
        }
      : undefined,
    boundaries: [
      ...(verification.boundaries ?? []),
      ...(failurePacket?.boundaries ?? []),
      "This handoff is an offline summary artifact. It does not post to GitHub or change CI status by itself.",
    ],
  };
}

export function renderMobileChangeHandoffMarkdown(summary: MobileChangeHandoffSummary): string {
  const artifactLines = summary.artifacts.map((artifact) => `- ${artifact.kind}: \`${artifact.path}\``);
  const boundaryLines = summary.boundaries.map((boundary) => `- ${boundary}`);
  const failureLines = summary.failure
    ? [
        "Failure excerpt:",
        `- Category: \`${summary.failure.category}\``,
        `- Reason code: \`${summary.failure.reasonCode}\``,
        `- Failed step: \`${summary.failure.failedStepId}\``,
        `- Next action: \`${summary.failure.nextActionKind}\` - ${summary.failure.nextActionReason}`,
        "",
      ]
    : ["Failure excerpt:", "- No failure packet attached.", ""];

  return [
    "## Mobile change handoff",
    "",
    `Verdict: \`${summary.verdict}\``,
    `Run ID: \`${summary.runId}\``,
    "",
    "Surface:",
    `- Platform: \`${summary.surface.platform}\``,
    `- App: \`${summary.surface.appId}\``,
    `- Policy profile: \`${summary.surface.policyProfile}\``,
    "",
    "Readiness:",
    `- Expected screen: \`${summary.readiness.expectedScreenId ?? "not-specified"}\``,
    `- Expected app phase: \`${summary.readiness.expectedAppPhase ?? "not-specified"}\``,
    `- Matched: \`${summary.readiness.matched ?? "unknown"}\``,
    "",
    ...failureLines,
    "Artifacts:",
    ...artifactLines,
    "",
    "Next command:",
    `- \`${summary.nextCommand}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
    `Source verification: \`${summary.sourceVerification}\``,
    summary.sourceFailurePacket ? `Source failure packet: \`${summary.sourceFailurePacket}\`` : undefined,
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    const existing = await readFile(absolutePath, "utf8");
    assert.equal(existing, content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-handoff`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function buildDefaultMobileChangeHandoff(): Promise<MobileChangeHandoffSummary> {
  return buildMobileChangeHandoffSummary({
    verification: await readJson(sourceVerificationPath),
    failurePacket: await readJson(sourceFailurePacketPath),
    sourceVerification: sourceVerificationPath,
    sourceFailurePacket: sourceFailurePacketPath,
  });
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const summary = await buildDefaultMobileChangeHandoff();
  await writeOrCheck(handoffJsonPath, `${JSON.stringify(summary, null, 2)}\n`, check);
  await writeOrCheck(handoffMarkdownPath, renderMobileChangeHandoffMarkdown(summary), check);
  console.log(check
    ? "Mobile change handoff is up to date."
    : `Mobile change handoff written to ${handoffMarkdownPath}`);
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
