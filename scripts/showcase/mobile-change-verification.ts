import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";

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
  verdict: "mobile_change_verified" | "mobile_change_verification_failed" | "device_unavailable" | "app_artifact_unavailable";
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
  deviceUnavailable?: boolean;
  appArtifactUnavailable?: boolean;
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
  | "environment"
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
      | "connect_device_or_use_fixture"
      | "build_or_provide_app_artifact"
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
const readinessFailureEvidenceDir = "docs/showcase/evidence/mobile-change-readiness-failure";
const readinessFailureSummaryPath = `${readinessFailureEvidenceDir}/summary.json`;
const readinessFailureReportPath = `${readinessFailureEvidenceDir}/report.md`;
const readinessFailurePacketJsonPath = `${readinessFailureEvidenceDir}/failure-packet.json`;
const readinessFailurePacketMarkdownPath = `${readinessFailureEvidenceDir}/failure-packet.md`;

export type ToolInvoker = (toolName: string, input: Record<string, unknown>) => Promise<unknown>;

export interface LiveMobileChangeVerificationOptions {
  runId: string;
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  runnerProfile: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  deviceId?: string;
  outputDir?: string;
  skipInstall?: boolean;
}

export interface LiveMobileChangeVerificationResult {
  bundle: MobileChangeVerificationBundle;
  failurePacket?: FailurePacket;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function isSuccessfulWorkflow(steps: VerificationStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.status === "success");
}

function addArtifactUnique(artifacts: VerificationArtifact[], artifact: VerificationArtifact): void {
  if (!artifacts.some((existing) => existing.kind === artifact.kind && existing.path === artifact.path)) {
    artifacts.push(artifact);
  }
}

function verdictFromSteps(steps: VerificationStep[]): MobileChangeVerificationBundle["verdict"] {
  if (steps.some((step) => step.reasonCode === "DEVICE_UNAVAILABLE")) return "device_unavailable";
  if (steps.some((step) => step.reasonCode === "APP_ARTIFACT_UNAVAILABLE")) return "app_artifact_unavailable";
  return isSuccessfulWorkflow(steps) ? "mobile_change_verified" : "mobile_change_verification_failed";
}

export function buildMobileChangeVerificationBundle(input: MobileChangeVerificationInput): MobileChangeVerificationBundle {
  const verdict = verdictFromSteps(input.steps);
  const verified = verdict === "mobile_change_verified";
  const boundaries = input.source === "fixture"
    ? [
        "This fixture validates the workflow contract without claiming a live-device run.",
        "The workflow proves launch/readiness evidence packaging, not broad Android/iOS/RN/Flutter parity.",
        "Device-specific support must still be backed by live proof bundles before public claims expand.",
      ]
    : [
        "This bundle was produced through the live runner contract, but its proof level depends on the invoker and available device context.",
        "Forced or controlled live-runner modes prove failure shaping and evidence structure, not physical-device fidelity.",
        "Device-specific support must still be backed by live proof bundles before public claims expand.",
      ];
  return {
    schema: "mobile-change-verification/v1",
    runId: input.runId,
    source: input.source,
    verdict,
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
    boundaries,
  };
}

function categoryFromSignals(signals: FailureSignals): FailureCategory {
  if (signals.deviceUnavailable || signals.appArtifactUnavailable) return "environment";
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
    case "environment":
      return {
        kind: "connect_device_or_use_fixture",
        reason: "Connect an eligible device/emulator or run the fixture-backed proof when live execution is unavailable.",
      };
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stepFromResult(id: string, tool: string, result: unknown, fallbackReasonCode = "UNKNOWN"): VerificationStep {
  const record = asRecord(result);
  return {
    id,
    tool,
    status: record.status === "success" ? "success" : record.status === "skipped" ? "skipped" : "failed",
    reasonCode: typeof record.reasonCode === "string" ? record.reasonCode : fallbackReasonCode,
  };
}

function selectDevice(listDevicesResult: unknown, platform: "android" | "ios", requestedDeviceId?: string): string | undefined {
  if (requestedDeviceId) return requestedDeviceId;
  const data = asRecord(asRecord(listDevicesResult).data);
  const devices = Array.isArray(data[platform]) ? data[platform] : [];
  for (const item of devices) {
    const device = asRecord(item);
    if (device.available === false) continue;
    if (typeof device.id === "string" && device.id.length > 0) return device.id;
  }
  return undefined;
}

function screenSummaryFromResult(result: unknown): Record<string, unknown> {
  return asRecord(asRecord(asRecord(result).data).screenSummary);
}

function readinessMatches(summary: Record<string, unknown>, expected: LiveMobileChangeVerificationOptions["expectedReadiness"]): boolean {
  if (expected.appPhase && summary.appPhase !== expected.appPhase) return false;
  return true;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runLiveMobileChangeVerificationWorkflow(
  options: LiveMobileChangeVerificationOptions,
  invoke: ToolInvoker,
): Promise<LiveMobileChangeVerificationResult> {
  const steps: VerificationStep[] = [];
  const artifacts: VerificationArtifact[] = [];
  const outputDir = options.outputDir ?? `output/showcase/mobile-change-verification-live/${options.runId}`;

  const listed = await invoke("list_devices", { includeUnavailable: true });
  const deviceId = selectDevice(listed, options.platform, options.deviceId);
  steps.push(deviceId
    ? stepFromResult("discover-device", "list_devices", listed, "OK")
    : { id: "discover-device", tool: "list_devices", status: "failed", reasonCode: "DEVICE_UNAVAILABLE" });

  if (!deviceId) {
    const bundle = buildMobileChangeVerificationBundle({
      runId: options.runId,
      source: "live_device",
      platform: options.platform,
      appId: options.appId,
      appArtifact: options.appArtifact,
      policyProfile: options.policyProfile,
      expectedReadiness: options.expectedReadiness,
      steps,
      artifacts,
    });
    return {
      bundle,
      failurePacket: buildFailurePacket({
        runId: options.runId,
        source: "live_device",
        failedStep: steps[0],
        signals: { deviceUnavailable: true },
        artifacts,
      }),
    };
  }

  if (options.appArtifact && !options.skipInstall && !(await pathExists(path.resolve(repoRoot(), options.appArtifact)))) {
    const failedStep = {
      id: "check-app-artifact",
      tool: "filesystem",
      status: "failed" as const,
      reasonCode: "APP_ARTIFACT_UNAVAILABLE",
      detail: options.appArtifact,
    };
    steps.push(failedStep);
    const bundle = buildMobileChangeVerificationBundle({
      runId: options.runId,
      source: "live_device",
      platform: options.platform,
      appId: options.appId,
      appArtifact: options.appArtifact,
      policyProfile: options.policyProfile,
      expectedReadiness: options.expectedReadiness,
      steps,
      artifacts,
    });
    return {
      bundle,
      failurePacket: buildFailurePacket({
        runId: options.runId,
        source: "live_device",
        failedStep,
        signals: { appArtifactUnavailable: true },
        artifacts,
      }),
    };
  }

  const sessionId = `mobile-change-live-${options.runId}`;

  const capabilities = await invoke("describe_capabilities", { platform: options.platform, runnerProfile: options.runnerProfile });
  steps.push(stepFromResult("describe-capabilities", "describe_capabilities", capabilities, "OK"));

  const started = await invoke("start_session", {
    sessionId,
    platform: options.platform,
    deviceId,
    appId: options.appId,
    profile: options.runnerProfile,
    policyProfile: options.policyProfile,
  });
  steps.push(stepFromResult("start-session", "start_session", started, "OK"));

  if (options.appArtifact && !options.skipInstall) {
    const installed = await invoke("install_app", {
      sessionId,
      platform: options.platform,
      deviceId,
      runnerProfile: options.runnerProfile,
      artifactPath: path.resolve(repoRoot(), options.appArtifact),
    });
    steps.push(stepFromResult("install-app", "install_app", installed, "OK"));
  }

  const launched = await invoke("launch_app", {
    sessionId,
    platform: options.platform,
    deviceId,
    runnerProfile: options.runnerProfile,
    appId: options.appId,
  });
  steps.push(stepFromResult("launch-app", "launch_app", launched, "OK"));

  const inspectOutputPath = path.join(outputDir, "inspect-ui.xml");
  const inspected = await invoke("inspect_ui", {
    sessionId,
    platform: options.platform,
    deviceId,
    runnerProfile: options.runnerProfile,
    appId: options.appId,
    outputPath: inspectOutputPath,
  });
  steps.push(stepFromResult("inspect-readiness", "inspect_ui", inspected, "OK"));
  const inspectArtifacts = asStringArray(asRecord(inspected).artifacts);
  for (const artifact of inspectArtifacts) artifacts.push({ kind: "ui_tree", path: artifact });

  const screen = await invoke("get_screen_summary", {
    sessionId,
    platform: options.platform,
    deviceId,
    runnerProfile: options.runnerProfile,
    appId: options.appId,
    includeDebugSignals: true,
  });
  const screenSummary = screenSummaryFromResult(screen);
  const screenStep = stepFromResult("check-readiness", "get_screen_summary", screen, "OK");
  if (screenStep.status === "success" && !readinessMatches(screenSummary, options.expectedReadiness)) {
    screenStep.status = "failed";
    screenStep.reasonCode = "APP_NOT_READY";
  }
  steps.push(screenStep);

  const ended = await invoke("end_session", {
    sessionId,
    artifacts: [outputDir],
  });
  steps.push(stepFromResult("close-session", "end_session", ended, "OK"));

  const bundle = buildMobileChangeVerificationBundle({
    runId: options.runId,
    source: "live_device",
    platform: options.platform,
    appId: options.appId,
    appArtifact: options.appArtifact,
    policyProfile: options.policyProfile,
    expectedReadiness: options.expectedReadiness,
    steps,
    artifacts,
  });

  const failedStep = steps.find((step) => step.status === "failed");
  const hasDeviceUnavailable = steps.some((step) => step.reasonCode === "DEVICE_UNAVAILABLE");
  const hasAppNotReady = steps.some((step) => step.reasonCode === "APP_NOT_READY");
  return {
    bundle,
    failurePacket: failedStep
      ? buildFailurePacket({
          runId: options.runId,
          source: "live_device",
          failedStep,
          signals: {
            deviceUnavailable: hasDeviceUnavailable,
            appNotReady: hasAppNotReady,
          },
          artifacts,
        })
      : undefined,
  };
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

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function writeLiveMobileChangeVerificationProof(): Promise<{
  outputDir: string;
  result: LiveMobileChangeVerificationResult;
}> {
  const root = repoRoot();
  const runId = process.env.M2E_LIVE_MOBILE_CHANGE_RUN_ID ?? timestampId();
  const outputDir = path.resolve(root, "output/showcase/mobile-change-verification-live", runId);
  await mkdir(outputDir, { recursive: true });

  const server = createServer();
  const invoke: ToolInvoker = process.env.M2E_LIVE_MOBILE_CHANGE_FORCE_NO_DEVICE === "1"
    ? async (toolName) => toolName === "list_devices"
      ? { status: "success", reasonCode: "OK", data: { android: [], ios: [] } }
      : { status: "skipped", reasonCode: "FORCED_NO_DEVICE" }
    : (toolName, input) => server.invoke(toolName, input);
  const result = await runLiveMobileChangeVerificationWorkflow({
    runId,
    outputDir: path.relative(root, outputDir),
    platform: (process.env.M2E_LIVE_MOBILE_CHANGE_PLATFORM as "android" | "ios" | undefined) ?? "android",
    appId: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ID ?? "com.example.mobilechange",
    appArtifact: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT,
    policyProfile: process.env.M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE ?? "interactive",
    runnerProfile: process.env.M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE ?? "native_android",
    expectedReadiness: {
      screenId: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_SCREEN_ID,
      appPhase: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE,
    },
    deviceId: process.env.M2E_DEVICE_ID,
    skipInstall: process.env.M2E_LIVE_MOBILE_CHANGE_SKIP_INSTALL !== "0",
  }, invoke);

  addArtifactUnique(result.bundle.evidence.artifacts, { kind: "summary", path: path.relative(root, path.join(outputDir, "summary.json")) });
  addArtifactUnique(result.bundle.evidence.artifacts, { kind: "report", path: path.relative(root, path.join(outputDir, "report.md")) });
  if (result.failurePacket) {
    const failureArtifact = { kind: "failure_packet" as const, path: path.relative(root, path.join(outputDir, "failure-packet.json")) };
    addArtifactUnique(result.bundle.evidence.artifacts, failureArtifact);
    addArtifactUnique(result.failurePacket.evidence.artifacts, failureArtifact);
  }

  await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(result.bundle, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMobileChangeVerificationMarkdown(result.bundle), "utf8");
  if (result.failurePacket) {
    await writeFile(path.join(outputDir, "failure-packet.json"), `${JSON.stringify(result.failurePacket, null, 2)}\n`, "utf8");
    await writeFile(path.join(outputDir, "failure-packet.md"), renderFailurePacketMarkdown(result.failurePacket), "utf8");
  }

  return { outputDir, result };
}

export async function buildControlledReadinessFailureProof(): Promise<LiveMobileChangeVerificationResult> {
  return runLiveMobileChangeVerificationWorkflow({
    runId: "mobile-change-readiness-failure-2026-05-27",
    platform: "android",
    appId: "com.example.mobilechange",
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {
      screenId: "login",
      appPhase: "authentication",
    },
    outputDir: "output/showcase/mobile-change-readiness-failure/controlled",
    skipInstall: true,
  }, async (toolName) => {
    if (toolName === "list_devices") {
      return { status: "success", reasonCode: "OK", data: { android: [{ id: "controlled-live-runner", available: true }] } };
    }
    if (toolName === "inspect_ui") {
      return {
        status: "success",
        reasonCode: "OK",
        data: {
          outputPath: "output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml",
          summary: { totalNodes: 17, clickableNodes: 4 },
        },
        artifacts: ["output/showcase/mobile-change-readiness-failure/controlled/inspect-ui.xml"],
      };
    }
    if (toolName === "get_screen_summary") {
      return {
        status: "success",
        reasonCode: "OK",
        data: {
          screenSummary: {
            appPhase: "onboarding",
            readiness: "not_ready",
            stateConfidence: 0.72,
          },
        },
      };
    }
    return { status: "success", reasonCode: "OK" };
  });
}

export async function writeControlledReadinessFailureProof(check: boolean): Promise<void> {
  const proof = await buildControlledReadinessFailureProof();
  addArtifactUnique(proof.bundle.evidence.artifacts, { kind: "summary", path: readinessFailureSummaryPath });
  addArtifactUnique(proof.bundle.evidence.artifacts, { kind: "report", path: readinessFailureReportPath });
  addArtifactUnique(proof.bundle.evidence.artifacts, { kind: "failure_packet", path: readinessFailurePacketJsonPath });
  if (proof.failurePacket) {
    addArtifactUnique(proof.failurePacket.evidence.artifacts, { kind: "failure_packet", path: readinessFailurePacketJsonPath });
  }

  await writeOrCheck(readinessFailureSummaryPath, `${JSON.stringify(proof.bundle, null, 2)}\n`, check);
  await writeOrCheck(readinessFailureReportPath, renderMobileChangeVerificationMarkdown(proof.bundle), check);
  assert.ok(proof.failurePacket, "controlled readiness failure proof must include a failure packet");
  await writeOrCheck(readinessFailurePacketJsonPath, `${JSON.stringify(proof.failurePacket, null, 2)}\n`, check);
  await writeOrCheck(readinessFailurePacketMarkdownPath, renderFailurePacketMarkdown(proof.failurePacket), check);
}

async function main(): Promise<void> {
  if (process.argv.includes("--readiness-failure")) {
    const check = process.argv.includes("--check");
    await writeControlledReadinessFailureProof(check);
    console.log(check
      ? "Controlled readiness failure proof is up to date."
      : `Controlled readiness failure proof written to ${readinessFailureEvidenceDir}`);
    return;
  }

  if (process.argv.includes("--live")) {
    const { outputDir, result } = await writeLiveMobileChangeVerificationProof();
    const relativeOutputDir = path.relative(repoRoot(), outputDir);
    console.log(`Live mobile change verification proof written to ${relativeOutputDir}`);
    console.log(JSON.stringify({
      outputDir: relativeOutputDir,
      verdict: result.bundle.verdict,
      failureCategory: result.failurePacket?.category ?? null,
      nextAction: result.bundle.nextAction.kind,
    }, null, 2));

    if (
      result.bundle.verdict === "device_unavailable" &&
      process.env.M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE !== "1"
    ) {
      process.exitCode = 1;
    } else if (
      result.bundle.verdict !== "mobile_change_verified" &&
      result.bundle.verdict !== "device_unavailable"
    ) {
      process.exitCode = 1;
    }
    return;
  }

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
