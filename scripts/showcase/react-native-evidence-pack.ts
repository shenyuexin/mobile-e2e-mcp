import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReactNativeReadinessResult } from "./react-native-readiness.ts";

export type ReactNativeEvidencePackReviewStatus = "blocked" | "needs_review" | "ready_for_review";
export type ReactNativeEvidencePackProofLevel = "blocked_before_live" | "rn_evidence_candidate";

export interface ReactNativeEvidencePackSignalSummary {
  available: boolean;
  source: "metro_inspector" | "native_device" | "readiness_artifact";
  status: "captured" | "unavailable" | "not_requested";
  summary: string;
  counters: Record<string, number>;
}

export interface ReactNativeEvidenceReference {
  kind: "readiness" | "native_log" | "screenshot" | "failure_packet" | "handoff";
  path: string;
  status: "available" | "missing" | "not_generated";
  summary: string;
}

export interface ReactNativeEvidencePack {
  schema: "react-native-evidence-pack/v1";
  runId: string;
  reviewStatus: ReactNativeEvidencePackReviewStatus;
  proofLevel: ReactNativeEvidencePackProofLevel;
  readiness: {
    sourcePath: string;
    verdict: ReactNativeReadinessResult["verdict"];
    proofLevel: ReactNativeReadinessResult["proofLevel"];
    blockers: Array<{ reasonCode: string; detail: string }>;
  };
  jsSignals: {
    console: ReactNativeEvidencePackSignalSummary;
    network: ReactNativeEvidencePackSignalSummary;
  };
  nativeEvidence: ReactNativeEvidenceReference[];
  failureSummary: {
    strongestSuspectLayer: "environment" | "rn_runtime" | "native_runtime" | "unknown";
    confidence: "high" | "medium" | "low";
    detail: string;
  };
  nextAction: {
    kind: "fix_readiness_blocker" | "inspect_js_runtime" | "attach_rn_evidence_pack";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

const readinessPath = "docs/showcase/evidence/react-native-readiness/summary.json";
const evidenceDir = "docs/showcase/evidence/react-native-evidence-pack";
const evidenceJsonPath = `${evidenceDir}/evidence-pack.json`;
const evidenceMarkdownPath = `${evidenceDir}/evidence-pack.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function defaultBoundaries(): string[] {
  return [
    "This RN evidence pack is a review artifact; it does not execute the app by itself.",
    "Metro console and network signals are supplemental and cannot promote live success without native readiness and intake-backed verification evidence.",
    "Blocked readiness remains a setup blocker, not an app assertion failure.",
  ];
}

function reviewStatusFor(input: {
  readiness: ReactNativeReadinessResult;
  console: ReactNativeEvidencePackSignalSummary;
  network: ReactNativeEvidencePackSignalSummary;
}): ReactNativeEvidencePackReviewStatus {
  if (input.readiness.verdict !== "ready_for_react_native_verification") return "blocked";
  if ((input.console.counters.exceptionCount ?? 0) > 0 || (input.network.counters.failedRequestCount ?? 0) > 0) return "needs_review";
  return "ready_for_review";
}

function failureSummaryFor(input: {
  readiness: ReactNativeReadinessResult;
  console: ReactNativeEvidencePackSignalSummary;
  network: ReactNativeEvidencePackSignalSummary;
}): ReactNativeEvidencePack["failureSummary"] {
  if (input.readiness.verdict !== "ready_for_react_native_verification") {
    return {
      strongestSuspectLayer: "environment",
      confidence: "high",
      detail: `RN readiness blocked before live verification: ${input.readiness.blockers.map((blocker) => blocker.reasonCode).join(", ")}`,
    };
  }
  if ((input.console.counters.exceptionCount ?? 0) > 0) {
    return {
      strongestSuspectLayer: "rn_runtime",
      confidence: "medium",
      detail: "Metro console evidence contains JS exceptions that need review before promotion.",
    };
  }
  if ((input.network.counters.failedRequestCount ?? 0) > 0) {
    return {
      strongestSuspectLayer: "rn_runtime",
      confidence: "medium",
      detail: "Metro network evidence contains failed requests that need review before promotion.",
    };
  }
  return {
    strongestSuspectLayer: "unknown",
    confidence: "low",
    detail: "No blocking readiness or JS signal issue is present in the evidence pack.",
  };
}

function nextActionFor(input: {
  readiness: ReactNativeReadinessResult;
  reviewStatus: ReactNativeEvidencePackReviewStatus;
}): ReactNativeEvidencePack["nextAction"] {
  if (input.reviewStatus === "blocked") {
    return {
      kind: "fix_readiness_blocker",
      command: input.readiness.nextAction.command,
      reason: input.readiness.nextAction.reason,
    };
  }
  if (input.reviewStatus === "needs_review") {
    return {
      kind: "inspect_js_runtime",
      command: "pnpm run validate:react-native-evidence-pack",
      reason: "Inspect RN JS console/network signals before promoting the mobile evidence.",
    };
  }
  return {
    kind: "attach_rn_evidence_pack",
    command: "pnpm run validate:react-native-evidence-pack",
    reason: "Attach the RN evidence pack to PR or agent handoff review.",
  };
}

export function buildReactNativeEvidencePack(input: {
  runId: string;
  readinessSourcePath: string;
  readiness: ReactNativeReadinessResult;
  consoleSignal?: ReactNativeEvidencePackSignalSummary;
  networkSignal?: ReactNativeEvidencePackSignalSummary;
  nativeEvidence?: ReactNativeEvidenceReference[];
}): ReactNativeEvidencePack {
  const consoleSignal = input.consoleSignal ?? {
    available: false,
    source: "metro_inspector",
    status: "unavailable",
    summary: "Metro console evidence is unavailable in the committed fixture.",
    counters: { totalLogs: 0, exceptionCount: 0 },
  };
  const networkSignal = input.networkSignal ?? {
    available: false,
    source: "metro_inspector",
    status: "unavailable",
    summary: "Metro network evidence is unavailable in the committed fixture.",
    counters: { totalTrackedRequests: 0, failedRequestCount: 0 },
  };
  const reviewStatus = reviewStatusFor({ readiness: input.readiness, console: consoleSignal, network: networkSignal });
  const proofLevel: ReactNativeEvidencePackProofLevel = reviewStatus === "blocked" ? "blocked_before_live" : "rn_evidence_candidate";

  const packWithoutNextAction = {
    schema: "react-native-evidence-pack/v1" as const,
    runId: input.runId,
    reviewStatus,
    proofLevel,
    readiness: {
      sourcePath: input.readinessSourcePath,
      verdict: input.readiness.verdict,
      proofLevel: input.readiness.proofLevel,
      blockers: input.readiness.blockers.map((blocker) => ({
        reasonCode: blocker.reasonCode,
        detail: blocker.detail,
      })),
    },
    jsSignals: {
      console: consoleSignal,
      network: networkSignal,
    },
    nativeEvidence: input.nativeEvidence ?? [
      {
        kind: "readiness" as const,
        path: input.readinessSourcePath,
        status: "available" as const,
        summary: "RN readiness artifact is included as the proof-boundary backbone.",
      },
    ],
    failureSummary: failureSummaryFor({ readiness: input.readiness, console: consoleSignal, network: networkSignal }),
    boundaries: defaultBoundaries(),
  };

  return {
    ...packWithoutNextAction,
    nextAction: nextActionFor({ readiness: input.readiness, reviewStatus }),
  };
}

export function renderReactNativeEvidencePackMarkdown(pack: ReactNativeEvidencePack): string {
  const blockerLines = pack.readiness.blockers.length > 0
    ? pack.readiness.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  const nativeLines = pack.nativeEvidence.map((item) => `- ${item.kind}: \`${item.status}\` - ${item.path} - ${item.summary}`);
  const boundaryLines = pack.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## React Native evidence pack",
    "",
    `Review status: \`${pack.reviewStatus}\``,
    `Proof level: \`${pack.proofLevel}\``,
    `Run ID: \`${pack.runId}\``,
    "",
    "Readiness:",
    `- Verdict: \`${pack.readiness.verdict}\``,
    `- Source: \`${pack.readiness.sourcePath}\``,
    "",
    "Readiness blockers:",
    ...blockerLines,
    "",
    "JS signals:",
    `- Console: \`${pack.jsSignals.console.status}\` - ${pack.jsSignals.console.summary}`,
    `- Network: \`${pack.jsSignals.network.status}\` - ${pack.jsSignals.network.summary}`,
    "",
    "Native evidence:",
    ...nativeLines,
    "",
    "Failure summary:",
    `- Suspect layer: \`${pack.failureSummary.strongestSuspectLayer}\``,
    `- Confidence: \`${pack.failureSummary.confidence}\``,
    `- Detail: ${pack.failureSummary.detail}`,
    "",
    "Next action:",
    `- \`${pack.nextAction.kind}\`: ${pack.nextAction.reason}`,
    `- Command: \`${pack.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

export function validateReactNativeEvidencePack(pack: ReactNativeEvidencePack): void {
  assert.equal(pack.schema, "react-native-evidence-pack/v1");
  assert.ok(pack.readiness.sourcePath.length > 0, "RN evidence pack requires a readiness source path");
  assert.ok(pack.nativeEvidence.length > 0, "RN evidence pack requires at least one native/readiness evidence reference");
  assert.ok(pack.boundaries.some((boundary) => boundary.includes("Metro console and network signals are supplemental")), "RN evidence pack must mark Metro evidence as supplemental");
  if (pack.reviewStatus === "blocked") {
    assert.equal(pack.proofLevel, "blocked_before_live", "blocked RN pack must preserve blocked proof level");
    assert.ok(pack.readiness.blockers.length > 0, "blocked RN pack must include readiness blockers");
  }
  if (pack.proofLevel === "rn_evidence_candidate") {
    assert.notEqual(pack.reviewStatus, "blocked", "candidate RN evidence cannot have blocked review status");
  }
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-evidence-pack`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeReactNativeEvidencePack(check: boolean): Promise<ReactNativeEvidencePack> {
  const readiness = await readJson<ReactNativeReadinessResult>(readinessPath);
  const pack = buildReactNativeEvidencePack({
    runId: process.env.M2E_RN_EVIDENCE_PACK_RUN_ID ?? "react-native-evidence-pack-2026-06-01",
    readinessSourcePath: readinessPath,
    readiness,
  });
  validateReactNativeEvidencePack(pack);
  await writeOrCheck(evidenceJsonPath, `${JSON.stringify(pack, null, 2)}\n`, check);
  await writeOrCheck(evidenceMarkdownPath, renderReactNativeEvidencePackMarkdown(pack), check);
  return pack;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const pack = await writeReactNativeEvidencePack(check);
  console.log(check ? "React Native evidence pack is up to date." : `React Native evidence pack written to ${evidenceDir}`);
  console.log(JSON.stringify({
    reviewStatus: pack.reviewStatus,
    proofLevel: pack.proofLevel,
    blockers: pack.readiness.blockers.map((blocker) => blocker.reasonCode),
    nextAction: pack.nextAction.kind,
  }, null, 2));
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
