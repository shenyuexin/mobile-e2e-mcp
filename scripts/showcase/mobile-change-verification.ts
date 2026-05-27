import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type VerificationSource = "fixture" | "dry_run" | "live_device" | "simulator";
export type StepStatus = "success" | "failed" | "skipped";
export type ArtifactKind = "summary" | "report" | "ui_tree" | "screenshot" | "logs" | "crash_signals" | "timeline" | "failure_packet";

export interface VerificationStep {
  id: string;
  tool: string;
  status: StepStatus;
  reasonCode: string;
  detail?: string;
}

export interface VerificationArtifact {
  kind: ArtifactKind;
  path: string;
}

export interface MobileChangeVerificationInput {
  runId: string;
  source: VerificationSource;
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  steps: VerificationStep[];
  artifacts: VerificationArtifact[];
}

export interface MobileChangeVerificationBundle {
  schema: "mobile-change-verification/v1";
  runId: string;
  source: VerificationSource;
  verdict: "mobile_change_verified" | "mobile_change_verification_failed";
  validationSurface: {
    platform: "android" | "ios";
    appId: string;
    appArtifact?: string;
    policyProfile: string;
  };
  readiness: {
    expectedScreenId?: string;
    expectedAppPhase?: string;
    matched: boolean;
  };
  workflow: {
    stepIds: string[];
    steps: VerificationStep[];
  };
  evidence: {
    artifacts: VerificationArtifact[];
  };
  nextAction: {
    kind: "attach_to_pr" | "inspect_failure_packet";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

export interface FailureSignals {
  policyDenied?: boolean;
  appNotReady?: boolean;
  networkPolicyFailure?: boolean;
  selectorNoMatch?: boolean;
  crashDetected?: boolean;
  interruptionDetected?: boolean;
  keyboardFocusAmbiguous?: boolean;
}

export interface FailurePacketInput {
  runId: string;
  source: VerificationSource;
  failedStep: VerificationStep;
  signals: FailureSignals;
  artifacts: VerificationArtifact[];
  policyGuidance?: {
    currentProfile?: string;
    recommendedProfile?: string;
    toolSequence?: string[];
  };
}

export type FailureCategory =
  | "policy"
  | "app_readiness"
  | "network"
  | "ui_target"
  | "app_crash"
  | "interruption"
  | "keyboard_focus"
  | "unknown";

export interface FailurePacket {
  schema: "mobile-verification-failure-packet/v1";
  runId: string;
  source: VerificationSource;
  category: FailureCategory;
  confidence: "high" | "medium" | "low";
  failedStep: VerificationStep;
  reasonCode: string;
  evidence: {
    artifacts: VerificationArtifact[];
    signals: FailureSignals;
  };
  policyGuidance?: FailurePacketInput["policyGuidance"];
  nextAction: {
    kind:
      | "escalate_policy_profile"
      | "wait_or_fix_readiness_contract"
      | "inspect_network_policy"
      | "refine_selector_or_wait_for_ui"
      | "inspect_crash_signals"
      | "resolve_interruption"
      | "inspect_keyboard_focus"
      | "collect_debug_evidence";
    reason: string;
  };
  boundaries: string[];
}

export interface RealisticScenarioEvidence {
  id: string;
  surface: "native_android" | "native_ios" | "react_native_android" | "react_native_ios" | "flutter_android" | "flutter_ios" | "hybrid_webview";
  painPoint: string;
  evidencePath: string;
  verdict: "mobile_change_verified" | "failure_packet_actionable" | "unsupported_boundary_documented";
  failurePacketPath?: string;
}

export interface RealisticEvidenceIndex {
  schema: "realistic-mobile-evidence-breadth/v1";
  verdict: "realistic_workflow_evidence_available" | "insufficient_realistic_evidence";
  scenarioCount: number;
  failurePacketCount: number;
  scenarios: RealisticScenarioEvidence[];
  boundaries: string[];
}

const verificationEvidenceDir = "docs/showcase/evidence/mobile-change-verification-fixture";
const summaryJsonPath = `${verificationEvidenceDir}/summary.json`;
const reportMarkdownPath = `${verificationEvidenceDir}/report.md`;
const failurePacketJsonPath = `${verificationEvidenceDir}/failure-packet.json`;
const failurePacketMarkdownPath = `${verificationEvidenceDir}/failure-packet.md`;
const scenarioIndexJsonPath = `${verificationEvidenceDir}/scenario-index.json`;
const scenarioIndexMarkdownPath = `${verificationEvidenceDir}/scenario-index.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function isSuccessfulWorkflow(steps: VerificationStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.status === "success");
}

export function buildMobileChangeVerificationBundle(input: MobileChangeVerificationInput): MobileChangeVerificationBundle {
  const verified = isSuccessfulWorkflow(input.steps);
  return {
    schema: "mobile-change-verification/v1",
    runId: input.runId,
    source: input.source,
    verdict: verified ? "mobile_change_verified" : "mobile_change_verification_failed",
    validationSurface: {
      platform: input.platform,
      appId: input.appId,
      appArtifact: input.appArtifact,
      policyProfile: input.policyProfile,
    },
    readiness: {
      expectedScreenId: input.expectedReadiness.screenId,
      expectedAppPhase: input.expectedReadiness.appPhase,
      matched: verified,
    },
    workflow: {
      stepIds: input.steps.map((step) => step.id),
      steps: input.steps,
    },
    evidence: {
      artifacts: input.artifacts,
    },
    nextAction: verified
      ? {
          kind: "attach_to_pr",
          command: "pnpm run validate:mobile-change-verification",
          reason: "Attach the Markdown report or JSON summary to the PR as mobile verification evidence.",
        }
      : {
          kind: "inspect_failure_packet",
          command: "pnpm run validate:mobile-change-verification",
          reason: "Inspect the generated failure packet before retrying or changing the app.",
        },
    boundaries: [
      "This fixture validates the workflow contract without claiming a live-device run.",
      "The workflow proves launch/readiness evidence packaging, not broad Android/iOS/RN/Flutter parity.",
      "Device-specific support must still be backed by live proof bundles before public claims expand.",
    ],
  };
}

function categoryFromSignals(signals: FailureSignals): FailureCategory {
  if (signals.policyDenied) return "policy";
  if (signals.appNotReady) return "app_readiness";
  if (signals.networkPolicyFailure) return "network";
  if (signals.selectorNoMatch) return "ui_target";
  if (signals.crashDetected) return "app_crash";
  if (signals.interruptionDetected) return "interruption";
  if (signals.keyboardFocusAmbiguous) return "keyboard_focus";
  return "unknown";
}

function nextActionForCategory(category: FailureCategory): FailurePacket["nextAction"] {
  switch (category) {
    case "policy":
      return {
        kind: "escalate_policy_profile",
        reason: "Retry only after ending the current session and starting a new session with the recommended policy profile.",
      };
    case "app_readiness":
      return {
        kind: "wait_or_fix_readiness_contract",
        reason: "Add or verify deterministic readiness signals before treating the screen as testable.",
      };
    case "network":
      return {
        kind: "inspect_network_policy",
        reason: "Check Android cleartext or iOS ATS policy before retrying network-dependent UI actions.",
      };
    case "ui_target":
      return {
        kind: "refine_selector_or_wait_for_ui",
        reason: "Use a stable selector or wait for the intended element before retrying the action.",
      };
    case "app_crash":
      return {
        kind: "inspect_crash_signals",
        reason: "Collect crash signals and logs before retrying UI automation.",
      };
    case "interruption":
      return {
        kind: "resolve_interruption",
        reason: "Resolve the blocking system or app interruption through the governed interruption path.",
      };
    case "keyboard_focus":
      return {
        kind: "inspect_keyboard_focus",
        reason: "Inspect focus and IME visibility before typing again.",
      };
    case "unknown":
      return {
        kind: "collect_debug_evidence",
        reason: "Collect logs, UI tree, screenshot, and session timeline before assigning a specific cause.",
      };
  }
}

export function buildFailurePacket(input: FailurePacketInput): FailurePacket {
  const category = categoryFromSignals(input.signals);
  return {
    schema: "mobile-verification-failure-packet/v1",
    runId: input.runId,
    source: input.source,
    category,
    confidence: category === "unknown" ? "low" : "high",
    failedStep: input.failedStep,
    reasonCode: input.failedStep.reasonCode,
    evidence: {
      artifacts: input.artifacts,
      signals: input.signals,
    },
    policyGuidance: input.policyGuidance,
    nextAction: nextActionForCategory(category),
    boundaries: [
      "Failure packets classify observed evidence; they do not autonomously fix app code.",
      "Remediation is deterministic and bounded. LLM-generated remediation is out of scope for this phase.",
    ],
  };
}

export function buildRealisticEvidenceIndex(input: { scenarios: RealisticScenarioEvidence[] }): RealisticEvidenceIndex {
  const failurePacketCount = input.scenarios.filter((scenario) => Boolean(scenario.failurePacketPath)).length;
  const verdict = input.scenarios.length >= 2 && failurePacketCount >= 1
    ? "realistic_workflow_evidence_available"
    : "insufficient_realistic_evidence";

  return {
    schema: "realistic-mobile-evidence-breadth/v1",
    verdict,
    scenarioCount: input.scenarios.length,
    failurePacketCount,
    scenarios: input.scenarios,
    boundaries: [
      "This index proves app-oriented evidence breadth only for the listed scenarios.",
      "Dry-run or fixture evidence must not be described as live-device coverage.",
      "Cloud farms, broad platform parity, and framework-wide maturity remain future work unless backed by separate evidence.",
    ],
  };
}

export function renderMobileChangeVerificationMarkdown(bundle: MobileChangeVerificationBundle): string {
  const stepLines = bundle.workflow.steps.map((step) => `- ${step.id}: \`${step.tool}\` -> \`${step.status}\` (${step.reasonCode})`);
  const artifactLines = bundle.evidence.artifacts.map((artifact) => `- ${artifact.kind}: \`${artifact.path}\``);
  const boundaryLines = bundle.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## Mobile change verification",
    "",
    `Verdict: \`${bundle.verdict}\``,
    `Source: \`${bundle.source}\``,
    "",
    "Validation surface:",
    `- Platform: \`${bundle.validationSurface.platform}\``,
    `- App: \`${bundle.validationSurface.appId}\``,
    `- Policy profile: \`${bundle.validationSurface.policyProfile}\``,
    bundle.validationSurface.appArtifact ? `- Artifact: \`${bundle.validationSurface.appArtifact}\`` : undefined,
    "",
    "Workflow:",
    ...stepLines,
    "",
    "Readiness:",
    `- Expected screen: \`${bundle.readiness.expectedScreenId ?? "not-specified"}\``,
    `- Expected app phase: \`${bundle.readiness.expectedAppPhase ?? "not-specified"}\``,
    `- Matched: \`${bundle.readiness.matched}\``,
    "",
    "Artifacts:",
    ...artifactLines,
    "",
    "Next action:",
    `- \`${bundle.nextAction.kind}\`: ${bundle.nextAction.reason}`,
    `- Command: \`${bundle.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function renderFailurePacketMarkdown(packet: FailurePacket): string {
  const artifactLines = packet.evidence.artifacts.map((artifact) => `- ${artifact.kind}: \`${artifact.path}\``);
  const boundaryLines = packet.boundaries.map((boundary) => `- ${boundary}`);
  const policyLines = packet.policyGuidance
    ? [
        `- Current profile: \`${packet.policyGuidance.currentProfile ?? "unknown"}\``,
        `- Recommended profile: \`${packet.policyGuidance.recommendedProfile ?? "unknown"}\``,
        `- Tool sequence: \`${packet.policyGuidance.toolSequence?.join(" -> ") ?? "not-specified"}\``,
      ]
    : ["- No policy escalation guidance attached."];

  return [
    "## Mobile verification failure packet",
    "",
    `Category: \`${packet.category}\``,
    `Confidence: \`${packet.confidence}\``,
    `Reason code: \`${packet.reasonCode}\``,
    "",
    "Failed step:",
    `- ${packet.failedStep.id}: \`${packet.failedStep.tool}\` -> \`${packet.failedStep.status}\``,
    "",
    "Evidence:",
    ...artifactLines,
    "",
    "Policy guidance:",
    ...policyLines,
    "",
    "Next action:",
    `- \`${packet.nextAction.kind}\`: ${packet.nextAction.reason}`,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

export function renderRealisticEvidenceIndexMarkdown(index: RealisticEvidenceIndex): string {
  const scenarioLines = index.scenarios.map((scenario) => {
    const failure = scenario.failurePacketPath ? `; failure packet: \`${scenario.failurePacketPath}\`` : "";
    return `- ${scenario.id}: \`${scenario.surface}\`, pain point \`${scenario.painPoint}\`, verdict \`${scenario.verdict}\`, evidence \`${scenario.evidencePath}\`${failure}`;
  });
  const boundaryLines = index.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## Realistic mobile evidence breadth",
    "",
    `Verdict: \`${index.verdict}\``,
    `Scenario count: \`${index.scenarioCount}\``,
    `Failure packet count: \`${index.failurePacketCount}\``,
    "",
    "Scenarios:",
    ...scenarioLines,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    const existing = await readFile(absolutePath, "utf8");
    assert.equal(existing, content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-verification`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export function buildFixtureEvidence(): {
  bundle: MobileChangeVerificationBundle;
  failurePacket: FailurePacket;
  scenarioIndex: RealisticEvidenceIndex;
} {
  const bundle = buildMobileChangeVerificationBundle({
    runId: "mobile-change-verification-fixture-2026-05-27",
    source: "fixture",
    platform: "android",
    appId: "com.example.mobilechange",
    appArtifact: "examples/rn-login-demo/android/app/build/outputs/apk/debug/app-debug.apk",
    policyProfile: "interactive",
    expectedReadiness: {
      screenId: "login",
      appPhase: "authentication",
    },
    steps: [
      { id: "discover-device", tool: "list_devices", status: "success", reasonCode: "OK" },
      { id: "start-session", tool: "start_session", status: "success", reasonCode: "OK" },
      { id: "install-or-launch", tool: "launch_app", status: "success", reasonCode: "OK" },
      { id: "inspect-readiness", tool: "inspect_ui", status: "success", reasonCode: "OK" },
      { id: "governed-smoke", tool: "wait_for_ui", status: "success", reasonCode: "OK" },
      { id: "close-session", tool: "end_session", status: "success", reasonCode: "OK" },
    ],
    artifacts: [
      { kind: "summary", path: summaryJsonPath },
      { kind: "report", path: reportMarkdownPath },
      { kind: "ui_tree", path: "output/showcase/mobile-change-verification/fixture/ui-tree.json" },
      { kind: "screenshot", path: "output/showcase/mobile-change-verification/fixture/screenshot.png" },
      { kind: "timeline", path: "output/showcase/mobile-change-verification/fixture/session-timeline.json" },
    ],
  });

  const failurePacket = buildFailurePacket({
    runId: "mobile-change-verification-network-policy-failure-2026-05-27",
    source: "fixture",
    failedStep: {
      id: "wait-login-network-ready",
      tool: "diagnose_network_failure",
      status: "failed",
      reasonCode: "NETWORK_POLICY_BLOCKED",
      detail: "HTTP endpoint would be blocked by release network policy.",
    },
    signals: {
      networkPolicyFailure: true,
    },
    artifacts: [
      { kind: "failure_packet", path: failurePacketJsonPath },
      { kind: "logs", path: "output/showcase/mobile-change-verification/failure/network-events.json" },
      { kind: "timeline", path: "output/showcase/mobile-change-verification/failure/session-timeline.json" },
    ],
  });

  const scenarioIndex = buildRealisticEvidenceIndex({
    scenarios: [
      {
        id: "rn-login-readiness",
        surface: "react_native_android",
        painPoint: "launch_readiness_regression",
        evidencePath: summaryJsonPath,
        verdict: "mobile_change_verified",
      },
      {
        id: "network-policy-failure-packet",
        surface: "native_android",
        painPoint: "network_policy_failure",
        evidencePath: failurePacketJsonPath,
        verdict: "failure_packet_actionable",
        failurePacketPath: failurePacketJsonPath,
      },
    ],
  });

  return { bundle, failurePacket, scenarioIndex };
}

export async function writeFixtureEvidence(check: boolean): Promise<void> {
  const { bundle, failurePacket, scenarioIndex } = buildFixtureEvidence();
  await writeOrCheck(summaryJsonPath, `${JSON.stringify(bundle, null, 2)}\n`, check);
  await writeOrCheck(reportMarkdownPath, renderMobileChangeVerificationMarkdown(bundle), check);
  await writeOrCheck(failurePacketJsonPath, `${JSON.stringify(failurePacket, null, 2)}\n`, check);
  await writeOrCheck(failurePacketMarkdownPath, renderFailurePacketMarkdown(failurePacket), check);
  await writeOrCheck(scenarioIndexJsonPath, `${JSON.stringify(scenarioIndex, null, 2)}\n`, check);
  await writeOrCheck(scenarioIndexMarkdownPath, renderRealisticEvidenceIndexMarkdown(scenarioIndex), check);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  await writeFixtureEvidence(check);
  console.log(check
    ? "Mobile change verification evidence is up to date."
    : `Mobile change verification evidence written to ${verificationEvidenceDir}`);
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
