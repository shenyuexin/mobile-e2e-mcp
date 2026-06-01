import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReactNativeOneCommandResult } from "./react-native-one-command.ts";

export type ReactNativeLiveSuccessCandidateVerdict =
  | "blocked_before_rn_live_success"
  | "rn_live_success_pending_promotion"
  | "rn_live_success_promoted"
  | "not_promotable_rn_live_output";

export interface ReactNativeLiveSuccessCandidate {
  schema: "react-native-live-success-candidate/v1";
  runId: string;
  verdict: ReactNativeLiveSuccessCandidateVerdict;
  successEvidencePromoted: boolean;
  source: {
    oneCommandResultPath: string;
    oneCommandRunId: string;
    oneCommandVerdict: ReactNativeOneCommandResult["verdict"];
    proofLevel: ReactNativeOneCommandResult["proofLevel"];
  };
  liveBridge: {
    status: ReactNativeOneCommandResult["liveBridge"]["status"];
    outputDir?: string;
    verification?: string;
    intake?: string;
  };
  blockers: Array<{
    reasonCode: string;
    detail: string;
  }>;
  nextAction: {
    kind: "connect_device_and_run_rn_live_bridge" | "run_rn_live_bridge_intake_review" | "attach_rn_live_success_evidence" | "inspect_rn_live_output";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

const defaultOneCommandPath = "docs/showcase/evidence/react-native-one-command/result.json";
const defaultOutputDir = "docs/showcase/evidence/react-native-live-success-candidate";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function candidateBoundaries(): string[] {
  return [
    "This candidate gates RN live success promotion; it does not execute a device by itself.",
    "Blocked RN output is readiness or environment evidence, not app-under-test success.",
    "RN live success requires a completed live bridge with physical/emulator proof and intake evidence.",
  ];
}

function hasPhysicalProof(result: ReactNativeOneCommandResult): boolean {
  return result.proofLevel === "physical_or_emulator_candidate";
}

function hasBridgeEvidence(result: ReactNativeOneCommandResult): boolean {
  return Boolean(result.liveBridge.outputDir && result.liveBridge.evidence?.verification && result.liveBridge.evidence?.intake);
}

function nextActionFor(candidate: {
  verdict: ReactNativeLiveSuccessCandidateVerdict;
  sourcePath: string;
}): ReactNativeLiveSuccessCandidate["nextAction"] {
  if (candidate.verdict === "blocked_before_rn_live_success") {
    return {
      kind: "connect_device_and_run_rn_live_bridge",
      command: "pnpm run verify:react-native-change -- --live-bridge --contract=configs/readiness/demo-android-app.android.json --output-dir=output/showcase/react-native-one-command-live/<run-id>",
      reason: "Connect an authorized Android device or emulator, start Metro/debug target, then rerun the RN live bridge.",
    };
  }
  if (candidate.verdict === "rn_live_success_pending_promotion") {
    return {
      kind: "run_rn_live_bridge_intake_review",
      command: `pnpm run validate:react-native-live-success-candidate -- --source=${candidate.sourcePath}`,
      reason: "The RN live bridge completed but lacks enough verification/intake evidence for promotion.",
    };
  }
  if (candidate.verdict === "rn_live_success_promoted") {
    return {
      kind: "attach_rn_live_success_evidence",
      command: "pnpm run validate:react-native-live-success-candidate",
      reason: "Attach the promoted RN live success candidate to review or release notes.",
    };
  }
  return {
    kind: "inspect_rn_live_output",
    command: `pnpm run verify:react-native-change -- --live-bridge --output-dir=output/showcase/react-native-one-command-live/<run-id>`,
    reason: "Inspect the RN live bridge output before retrying or promoting evidence.",
  };
}

function verdictFor(result: ReactNativeOneCommandResult): ReactNativeLiveSuccessCandidateVerdict {
  if (result.verdict === "blocked" || result.liveBridge.status === "skipped") return "blocked_before_rn_live_success";
  if (result.verdict !== "completed" || result.liveBridge.status !== "completed") return "not_promotable_rn_live_output";
  if (hasPhysicalProof(result) && hasBridgeEvidence(result)) return "rn_live_success_promoted";
  if (hasPhysicalProof(result)) return "rn_live_success_pending_promotion";
  return "not_promotable_rn_live_output";
}

export function buildReactNativeLiveSuccessCandidate(input: {
  runId: string;
  oneCommandResultPath: string;
  oneCommand: ReactNativeOneCommandResult;
}): ReactNativeLiveSuccessCandidate {
  const verdict = verdictFor(input.oneCommand);
  const blockers = input.oneCommand.blockers.map((blocker) => ({
    reasonCode: blocker.reasonCode,
    detail: blocker.detail,
  }));
  if (input.oneCommand.liveBridge.status === "skipped") {
    blockers.push({
      reasonCode: "RN_LIVE_BRIDGE_NOT_RUN",
      detail: input.oneCommand.liveBridge.detail,
    });
  } else if (input.oneCommand.liveBridge.status !== "completed") {
    blockers.push({
      reasonCode: "RN_LIVE_BRIDGE_NOT_COMPLETED",
      detail: `RN live bridge status is ${input.oneCommand.liveBridge.status}.`,
    });
  }
  if (input.oneCommand.liveBridge.status === "completed" && !hasPhysicalProof(input.oneCommand)) {
    blockers.push({
      reasonCode: "RN_LIVE_PROOF_NOT_PHYSICAL_OR_EMULATOR",
      detail: `RN proof level is ${input.oneCommand.proofLevel}.`,
    });
  }
  if (input.oneCommand.liveBridge.status === "completed" && hasPhysicalProof(input.oneCommand) && !hasBridgeEvidence(input.oneCommand)) {
    blockers.push({
      reasonCode: "RN_LIVE_INTAKE_EVIDENCE_MISSING",
      detail: "RN live bridge completed but verification or intake evidence path is missing.",
    });
  }

  return {
    schema: "react-native-live-success-candidate/v1",
    runId: input.runId,
    verdict,
    successEvidencePromoted: verdict === "rn_live_success_promoted",
    source: {
      oneCommandResultPath: input.oneCommandResultPath,
      oneCommandRunId: input.oneCommand.runId,
      oneCommandVerdict: input.oneCommand.verdict,
      proofLevel: input.oneCommand.proofLevel,
    },
    liveBridge: {
      status: input.oneCommand.liveBridge.status,
      outputDir: input.oneCommand.liveBridge.outputDir,
      verification: input.oneCommand.liveBridge.evidence?.verification,
      intake: input.oneCommand.liveBridge.evidence?.intake,
    },
    blockers,
    nextAction: nextActionFor({ verdict, sourcePath: input.oneCommandResultPath }),
    boundaries: candidateBoundaries(),
  };
}

export function validateReactNativeLiveSuccessCandidate(candidate: ReactNativeLiveSuccessCandidate): void {
  assert.equal(candidate.schema, "react-native-live-success-candidate/v1");
  assert.ok(candidate.source.oneCommandResultPath.length > 0, "RN live success candidate requires source one-command path");
  assert.ok(candidate.boundaries.some((boundary) => boundary.includes("Blocked RN output")), "candidate must prevent blocked-output success claims");
  if (candidate.successEvidencePromoted) {
    assert.equal(candidate.verdict, "rn_live_success_promoted", "successEvidencePromoted requires promoted verdict");
    assert.equal(candidate.source.proofLevel, "physical_or_emulator_candidate", "promoted RN success requires physical/emulator proof");
    assert.equal(candidate.liveBridge.status, "completed", "promoted RN success requires completed live bridge");
    assert.ok(candidate.liveBridge.verification, "promoted RN success requires verification evidence");
    assert.ok(candidate.liveBridge.intake, "promoted RN success requires intake evidence");
    assert.equal(candidate.blockers.length, 0, "promoted RN success cannot include blockers");
  } else {
    assert.notEqual(candidate.verdict, "rn_live_success_promoted", "unpromoted candidate cannot use promoted verdict");
    assert.ok(candidate.blockers.length > 0 || candidate.verdict === "rn_live_success_pending_promotion", "unpromoted candidates need blockers or pending-promotion state");
  }
}

export function renderReactNativeLiveSuccessCandidateMarkdown(candidate: ReactNativeLiveSuccessCandidate): string {
  const blockerLines = candidate.blockers.length > 0
    ? candidate.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];
  return [
    "## React Native live success candidate",
    "",
    `Verdict: \`${candidate.verdict}\``,
    `Promoted: \`${candidate.successEvidencePromoted}\``,
    `Run ID: \`${candidate.runId}\``,
    "",
    "Source:",
    `- One-command result: \`${candidate.source.oneCommandResultPath}\``,
    `- One-command verdict: \`${candidate.source.oneCommandVerdict}\``,
    `- Proof level: \`${candidate.source.proofLevel}\``,
    "",
    "Live bridge:",
    `- Status: \`${candidate.liveBridge.status}\``,
    `- Output: \`${candidate.liveBridge.outputDir ?? "not-run"}\``,
    `- Verification: \`${candidate.liveBridge.verification ?? "missing"}\``,
    `- Intake: \`${candidate.liveBridge.intake ?? "missing"}\``,
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

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-live-success-candidate`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function parseArg(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function writeReactNativeLiveSuccessCandidate(options: {
  sourcePath?: string;
  outputDir?: string;
  check?: boolean;
}): Promise<ReactNativeLiveSuccessCandidate> {
  const sourcePath = options.sourcePath ?? defaultOneCommandPath;
  const outputDir = options.outputDir ?? defaultOutputDir;
  const oneCommand = await readJson<ReactNativeOneCommandResult>(sourcePath);
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: process.env.M2E_RN_LIVE_SUCCESS_CANDIDATE_RUN_ID ?? "react-native-live-success-candidate-2026-06-01",
    oneCommandResultPath: sourcePath,
    oneCommand,
  });
  validateReactNativeLiveSuccessCandidate(candidate);
  await writeOrCheck(`${outputDir}/candidate.json`, `${JSON.stringify(candidate, null, 2)}\n`, Boolean(options.check));
  await writeOrCheck(`${outputDir}/candidate.md`, renderReactNativeLiveSuccessCandidateMarkdown(candidate), Boolean(options.check));
  return candidate;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const sourcePath = parseArg("--source");
  const outputDir = parseArg("--output-dir");
  const candidate = await writeReactNativeLiveSuccessCandidate({ sourcePath, outputDir, check });
  console.log(check ? "React Native live success candidate is up to date." : "React Native live success candidate written.");
  console.log(JSON.stringify({
    verdict: candidate.verdict,
    promoted: candidate.successEvidencePromoted,
    blockers: candidate.blockers.map((blocker) => blocker.reasonCode),
    nextAction: candidate.nextAction.kind,
  }, null, 2));
  if (!candidate.successEvidencePromoted && process.env.M2E_RN_LIVE_SUCCESS_CANDIDATE_ALLOW_BLOCKED !== "1") {
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
